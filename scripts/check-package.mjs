import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const MANIFEST = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const TEMP = mkdtempSync(path.join(tmpdir(), 'assistant-bridge-package-'));
const PNPM = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

const run = (command, args, cwd) => {
  execFileSync(command, args, { cwd, stdio: 'inherit' });
};

const createConsumer = (label, peers) => {
  const directory = path.join(TEMP, label);

  // Each consumer lives outside the repository, so workspace aliases cannot hide errors.
  const manifest = { name: `sdk-${label}-consumer`, private: true, type: 'module' };

  mkdirSync(directory);
  writeFileSync(path.join(directory, 'package.json'), JSON.stringify(manifest));
  writeFileSync(path.join(directory, '.npmrc'), 'auto-install-peers=false\n');
  run(PNPM, ['add', archive, '--ignore-scripts', ...peers], directory);

  return directory;
};

const checkConsumer = (label, peers, code) => {
  run(process.execPath, ['--input-type=module', '-e', code], createConsumer(label, peers));
};

const VITE = pathToFileURL(path.join(ROOT, 'node_modules/vite/dist/node/index.js')).href;

/** Bundles `entry` with Vite, as an application would, using only the given peers. */
const checkBundle = (label, peers, entry) => {
  const directory = createConsumer(label, peers);

  writeFileSync(path.join(directory, 'entry.js'), entry);
  run(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
      const { build } = await import(${JSON.stringify(VITE)});
      await build({
        root: process.cwd(),
        configFile: false,
        logLevel: 'warn',
        build: { outDir: 'dist', rollupOptions: { input: 'entry.js' } },
      });
      console.log(${JSON.stringify(`${label} bundle OK`)});
    `,
    ],
    directory,
  );
};

let archive;

try {
  run(PNPM, ['pack', '--pack-destination', TEMP], ROOT);

  const archives = readdirSync(TEMP).filter((file) => file.endsWith('.tgz'));

  assert.equal(archives.length, 1, 'Expected one package archive');
  archive = path.join(TEMP, archives[0]);

  const entries = execFileSync('tar', ['-tzf', archive], { encoding: 'utf8' }).trim().split('\n');
  const readEntry = (entry) => execFileSync('tar', ['-xOzf', archive, entry], { encoding: 'utf8' });
  const published = JSON.parse(readEntry('package/package.json'));

  assert.equal(published.name, MANIFEST.name);
  assert.equal(published.version, MANIFEST.version);
  assert.equal(published.license, 'MIT');
  assert.equal(published.private, undefined);
  assert.equal(published.publishConfig.access, 'public');
  assert.equal(published.publishConfig.registry, 'https://registry.npmjs.org/');

  for (const entry of ['package/LICENSE', 'package/README.md', 'package/CHANGELOG.md']) {
    assert.ok(entries.includes(entry), `Missing ${entry}`);
  }

  for (const entry of entries) {
    assert.match(
      entry,
      /^package\/(?:dist\/|schemas\/|docs\/|package\.json$|README\.md$|CHANGELOG\.md$|LICENSE$)/,
    );
    assert.doesNotMatch(entry, /(?:^|\/)(?:node_modules|src|scripts|\.env)(?:\/|$)|\.test\./);

    if (entry.endsWith('.js') || entry.endsWith('.d.ts')) {
      assert.doesNotMatch(readEntry(entry), /(?:from\s*|import\s*\()\s*['"]@\//);
    }
  }

  for (const entry of Object.values(published.exports)) {
    if (typeof entry === 'object') {
      for (const target of Object.values(entry)) {
        assert.ok(entries.includes(`package/${target.replace(/^\.\//, '')}`), `Missing ${target}`);
      }
    }
  }

  const packageName = JSON.stringify(MANIFEST.name);

  checkConsumer(
    'core',
    [],
    `
    import assert from 'node:assert/strict';
    import { createRequire } from 'node:module';
    const require = createRequire(import.meta.url);
    for (const peer of ['react', '@module-federation/runtime']) {
      assert.throws(() => require.resolve(peer), { code: 'MODULE_NOT_FOUND' });
    }
    const { createHostIntegration } = await import(${packageName});
    const integration = createHostIntegration({ actions: [] });
    assert.ok(integration.assistantClient);
    integration.dispose();
    console.log('Core works without optional peers');
  `,
  );

  checkConsumer(
    'adapters',
    Object.entries(MANIFEST.peerDependencies).map(([name, range]) => `${name}@${range}`),
    `
    for (const entry of ['react', 'federation', 'react/federation', 'ag-ui']) {
      await import(${packageName} + '/' + entry);
      console.log(entry + ' import OK');
    }
  `,
  );

  // `/react` must bundle without the optional federation peer installed.
  checkBundle(
    'react-without-federation',
    [`react@${MANIFEST.peerDependencies.react}`],
    `
    import { AssistantEmbed, IntegrationProvider, useIntegration } from ${JSON.stringify(`${MANIFEST.name}/react`)};
    console.log(AssistantEmbed, IntegrationProvider, useIntegration);
  `,
  );

  console.log(`Package verified: ${entries.length} archive entries and all isolated consumers`);
} finally {
  rmSync(TEMP, { recursive: true, force: true });
}
