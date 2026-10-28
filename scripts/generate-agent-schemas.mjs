import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

import { agentControlSchema } from '../dist/ag-ui/protocol.js';
import { hostAgentStateSchema } from '../dist/ag-ui/host-state.js';

const directory = fileURLToPath(new URL('../schemas/', import.meta.url));
const check = process.argv.includes('--check');

mkdirSync(directory, { recursive: true });

for (const [name, schema] of Object.entries({
  'agent-control': agentControlSchema,
  'host-agent-state': hostAgentStateSchema,
})) {
  const converted = z.toJSONSchema(schema, {
    target: 'draft-7',
    io: 'input',
    unrepresentable: 'any',
    override: ({ zodSchema, jsonSchema, path }) => {
      if (zodSchema._zod.def.type === 'custom') {
        // AG-UI currently uses custom record guards for developer metadata and
        // activity-message content. Both accept non-null, non-array objects.
        const field = path.at(-1);

        if (field !== 'metadata' && field !== 'content') {
          throw new Error(`Unsupported custom AG-UI schema at ${path.join('.')}`);
        }

        jsonSchema.type = 'object';
      }
    },
  });
  const content = JSON.stringify(converted, null, 2) + '\n';
  const target = `${directory}/${name}.schema.json`;

  if (check) {
    if (readFileSync(target, 'utf8') !== content) {
      throw new Error(`Stale schema: ${target}. Run pnpm build.`);
    }
  } else {
    writeFileSync(target, content);
  }
}
