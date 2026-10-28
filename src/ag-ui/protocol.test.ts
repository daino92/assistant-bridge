// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { EventSchemas } from '@ag-ui/core/schemas';
import { describe, expect, it } from 'vitest';
import Ajv from 'ajv';

import { agentControlSchema } from '@/ag-ui';

const FIXTURES = fileURLToPath(new URL('../../docs/fixtures/ag-ui/', import.meta.url));

interface Step {
  direction: 'client' | 'server';
  value: Record<string, unknown>;
}

const readScenario = (name: string): { steps: Step[] } =>
  JSON.parse(readFileSync(`${FIXTURES}/${name}`, 'utf8'));

describe('portable AG-UI transport fixtures', () => {
  for (const name of readdirSync(FIXTURES).filter((file) => file.endsWith('.json'))) {
    it(`validates schemas and correlations for ${name}`, () => {
      const { steps } = readScenario(name);
      const first = agentControlSchema.parse(steps[0].value);

      expect(first.type).toBe('run');

      if (first.type !== 'run') {
        throw new Error('Expected run');
      }

      const pending = new Set<string>();
      let terminal = false;
      let started = false;
      let textMessage: string | undefined;

      for (const step of steps) {
        expect(terminal).toBe(false);

        if (step.direction === 'client') {
          const control = agentControlSchema.parse(step.value);

          if (control.type !== 'run') {
            expect(control.runId).toBe(first.input.runId);
          }

          if (control.type === 'tool_result') {
            expect(pending.delete(control.message.toolCallId)).toBe(true);
          }
        } else {
          const event = EventSchemas.parse(step.value);

          if (event.type === 'RUN_STARTED' || event.type === 'RUN_FINISHED') {
            expect(event.runId).toBe(first.input.runId);
            expect(event.threadId).toBe(first.input.threadId);
          }

          if (event.type === 'RUN_STARTED') {
            expect(started).toBe(false);
            started = true;
          } else {
            expect(started).toBe(true);
          }

          if (event.type === 'TEXT_MESSAGE_START') {
            expect(textMessage).toBeUndefined();
            textMessage = event.messageId;
          }

          if (event.type === 'TEXT_MESSAGE_CONTENT' || event.type === 'TEXT_MESSAGE_END') {
            expect(event.messageId).toBe(textMessage);
          }

          if (event.type === 'TEXT_MESSAGE_END') {
            textMessage = undefined;
          }

          if (event.type === 'TOOL_CALL_END') {
            pending.add(event.toolCallId);
          }

          terminal = event.type === 'RUN_FINISHED' || event.type === 'RUN_ERROR';
        }
      }

      expect(terminal).toBe(true);
      expect(pending.size).toBe(0);
      expect(textMessage).toBeUndefined();
    });
  }

  it('rejects malformed controls and invalid refreshed host state', () => {
    expect(agentControlSchema.safeParse({ type: 'stop' }).success).toBe(false);
    expect(agentControlSchema.safeParse({ type: 'unknown' }).success).toBe(false);
    expect(agentControlSchema.safeParse({ type: 'run', input: {} }).success).toBe(false);

    const result = readScenario('tool-success.json').steps.find(
      (step) => step.value.type === 'tool_result',
    )!.value;

    expect(
      agentControlSchema.safeParse({ ...result, hostState: { tools: [], context: 'invalid' } })
        .success,
    ).toBe(false);
    expect(agentControlSchema.safeParse({ ...result, runId: 42 }).success).toBe(false);
  });
});

it('validates portable controls against the exported JSON Schema', () => {
  const ajv = new Ajv({ allErrors: true });

  const schema = JSON.parse(
    readFileSync(
      fileURLToPath(new URL('../../schemas/agent-control.schema.json', import.meta.url)),
      'utf8',
    ),
  );

  const validate = ajv.compile(schema);

  for (const name of readdirSync(FIXTURES)) {
    for (const step of readScenario(name).steps.filter((item) => item.direction === 'client')) {
      expect(validate(step.value), JSON.stringify(validate.errors)).toBe(true);
    }
  }

  for (const value of [
    { type: 'stop' },
    { type: 'stop', runId: 5 },
    { type: 'run', input: {} },
    { type: 'tool_result', runId: 'one', message: {} },
    { type: 'invalid' },
  ]) {
    expect(validate(value)).toBe(agentControlSchema.safeParse(value).success);
    expect(validate(value)).toBe(false);
  }
});
