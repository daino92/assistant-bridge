import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const DIST = fileURLToPath(new URL('../dist/', import.meta.url));

const resolveAlias = (specifier, file) => {
  const target = specifier.startsWith('@/')
    ? path.resolve(DIST, specifier.slice(2))
    : path.resolve(path.dirname(file), specifier);
  const resolved = [`${target}.js`, path.join(target, 'index.js')].find(existsSync);

  if (!resolved) {
    throw new Error(`Cannot resolve SDK alias ${specifier} in ${file}`);
  }

  const relative = path.relative(path.dirname(file), resolved).split(path.sep).join('/');

  return relative.startsWith('.') ? relative : `./${relative}`;
};

const rewrite = (file) => {
  const source = readFileSync(file, 'utf8');
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const edits = [];

  const visit = (node) => {
    if (
      ts.isStringLiteral(node) &&
      (node.text.startsWith('@/') || (node.text.startsWith('.') && !path.extname(node.text)))
    ) {
      const parent = node.parent;
      const moduleSpecifier =
        ((ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)) &&
          parent.moduleSpecifier === node) ||
        (ts.isLiteralTypeNode(parent) && ts.isImportTypeNode(parent.parent)) ||
        (ts.isCallExpression(parent) && parent.expression.kind === ts.SyntaxKind.ImportKeyword);

      if (moduleSpecifier) {
        edits.push({
          start: node.getStart(parsed) + 1,
          end: node.end - 1,
          value: resolveAlias(node.text, file),
        });
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(parsed);

  let output = source;

  for (const edit of edits.reverse()) {
    output = output.slice(0, edit.start) + edit.value + output.slice(edit.end);
  }

  if (output !== source) {
    writeFileSync(file, output);
  }
};

const walk = (directory) => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      walk(file);
    } else if (file.endsWith('.js') || file.endsWith('.d.ts')) {
      rewrite(file);
    }
  }
};

walk(DIST);
