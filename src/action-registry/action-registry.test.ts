import { describe, expect, it } from 'vitest';
import Ajv from 'ajv';
import { z } from 'zod';

import { ERROR_CODES, type HostContext } from '@/contracts';
import { HostActionRegistry } from '@/action-registry';
import { normalizeIntegrationError } from '@/errors';

const baseContext: HostContext = {
  route: '/',
  page: { title: 'T', type: 'dashboard' },
  capabilities: [],
  revision: 5,
};

describe('HostActionRegistry', () => {
  it('preserves known handler error codes and falls back for unknown codes', async () => {
    for (const supplied of [
      'RESOURCE_NOT_FOUND',
      'SERVICE_UNAVAILABLE',
      'STALE_CONTEXT',
      'UNKNOWN_INTERNAL_CODE',
    ]) {
      const registry = new HostActionRegistry();

      registry.register({
        name: 'test.failure',
        description: 'Test',
        parametersSchema: z.object({}),
        requiresConfirmation: false,
        handler: () => {
          throw Object.assign(new Error('Safe message'), { code: supplied });
        },
      });

      const result = await registry.execute('test.failure', {}, { getContext: () => baseContext });

      expect(result).toMatchObject({
        success: false,
        error: {
          code: supplied === 'UNKNOWN_INTERNAL_CODE' ? 'EXECUTION_FAILED' : supplied,
          message: normalizeIntegrationError({ code: supplied }).message,
        },
      });
    }
  });
  it('refuses protected actions without confirmation and validates approved payloads', async () => {
    const registry = new HostActionRegistry();
    let executions = 0;

    registry.register({
      name: 'records.updateStatus',
      description: 'Update',
      parametersSchema: z.object({ status: z.enum(['active', 'archived']) }),
      requiresConfirmation: true,
      handler: () => {
        executions += 1;

        return { ok: true };
      },
    });

    const denied = await registry.execute(
      'records.updateStatus',
      { status: 'archived' },
      { getContext: () => baseContext },
    );

    expect(denied).toMatchObject({
      success: false,
      error: { code: ERROR_CODES.CONFIRMATION_REQUIRED },
    });
    expect(executions).toBe(0);

    const invalid = await registry.execute(
      'records.updateStatus',
      { status: 'unknown' },
      { getContext: () => baseContext, confirmed: true },
    );

    expect(invalid).toMatchObject({ success: false, error: { code: ERROR_CODES.INVALID_PAYLOAD } });
    expect(executions).toBe(0);

    const approved = await registry.execute(
      'records.updateStatus',
      { status: 'archived' },
      { getContext: () => baseContext, confirmed: true },
    );

    expect(approved.success).toBe(true);
    expect(executions).toBe(1);
  });
  it('rejects unknown actions', async () => {
    const registry = new HostActionRegistry();
    const result = await registry.execute('nope', {}, { getContext: () => baseContext });

    expect(result.success).toBe(false);

    if (!result.success) {
      expect(result.error.code).toBe(ERROR_CODES.UNKNOWN_ACTION);
    }
  });

  it('validates payload', async () => {
    const registry = new HostActionRegistry();

    registry.register({
      name: 'test.action',
      description: 'test',
      parametersSchema: z.object({ id: z.string() }),
      requiresConfirmation: false,
      handler: () => ({ ok: true }),
    });

    const bad = await registry.execute(
      'test.action',
      { id: 123 },
      { getContext: () => baseContext },
    );

    expect(bad.success).toBe(false);

    if (!bad.success) {
      expect(bad.error.code).toBe(ERROR_CODES.INVALID_PAYLOAD);
    }
  });

  it('detects stale context', async () => {
    const registry = new HostActionRegistry();

    registry.register({
      name: 'test.action',
      description: 'test',
      parametersSchema: z.object({}),
      requiresConfirmation: false,
      handler: () => ({}),
    });

    const result = await registry.execute(
      'test.action',
      {},
      { getContext: () => baseContext, minContextRevision: 10 },
    );

    expect(result.success).toBe(false);

    if (!result.success) {
      expect(result.error.code).toBe(ERROR_CODES.STALE_CONTEXT);
    }
  });
});

describe('action JSON Schema', () => {
  it('preserves enums, required fields, nested arrays and constraints in advertised tools', () => {
    const schema = z.object({
      id: z.string().min(1).describe('Canonical business identifier'),
      status: z.enum(['active', 'pending', 'archived']),
      limit: z.number().int().min(1).max(20).optional(),
      filters: z.object({ tags: z.array(z.string()).min(1), enabled: z.boolean() }),
      note: z.string().nullable().optional(),
    });

    const registry = new HostActionRegistry();

    registry.register({
      name: 'test.schema',
      description: 'Test',
      parametersSchema: schema,
      requiresConfirmation: false,
      handler: (payload) => payload,
    });

    const advertised = registry.getCapabilities()[0].parametersSchema;

    expect(advertised).toMatchObject({
      type: 'object',
      required: ['id', 'status', 'filters'],
      properties: {
        id: { type: 'string', minLength: 1, description: 'Canonical business identifier' },
        status: { enum: ['active', 'pending', 'archived'] },
        limit: { type: 'integer', minimum: 1, maximum: 20 },
        filters: {
          required: ['tags', 'enabled'],
          properties: {
            tags: { type: 'array', minItems: 1, items: { type: 'string' } },
            enabled: { type: 'boolean' },
          },
        },
      },
    });

    const validate = new Ajv().compile(advertised);

    const valid = {
      id: 'record-012',
      status: 'active',
      filters: { tags: ['demo'], enabled: true },
    };

    for (const payload of [
      valid,
      { ...valid, extra: 'stripped by Zod' },
      { ...valid, note: null },
      { ...valid, status: 'invalid' },
      { ...valid, limit: 21 },
      { ...valid, id: '' },
      { ...valid, filters: { tags: [], enabled: true } },
      { status: 'active' },
    ]) {
      expect(validate(payload)).toBe(schema.safeParse(payload).success);
    }
  });

  it('describes input values while Zod still applies defaults and transforms at execution', async () => {
    const schema = z.object({
      label: z.string().transform((value) => value.toUpperCase()),
      limit: z.number().int().default(10),
    });

    const registry = new HostActionRegistry();

    registry.register({
      name: 'test.input',
      description: 'Test',
      parametersSchema: schema,
      requiresConfirmation: false,
      handler: (payload) => payload,
    });

    const advertised = registry.getCapabilities()[0].parametersSchema;

    expect(advertised).toMatchObject({
      required: ['label'],
      properties: { label: { type: 'string' }, limit: { type: 'integer', default: 10 } },
    });
    expect(new Ajv().compile(advertised)({ label: 'hello' })).toBe(true);
    await expect(
      registry.execute('test.input', { label: 'hello' }, { getContext: () => baseContext }),
    ).resolves.toEqual({ success: true, data: { label: 'HELLO', limit: 10 } });
  });

  it('does not silently advertise an unsupported custom schema as a generic object', () => {
    const registry = new HostActionRegistry();

    registry.register({
      name: 'test.custom',
      description: 'Test',
      parametersSchema: z.object({ value: z.custom(() => true) }),
      requiresConfirmation: false,
      handler: () => null,
    });
    expect(() => registry.getCapabilities()).toThrow(
      'Custom types cannot be represented in JSON Schema',
    );
  });
});
