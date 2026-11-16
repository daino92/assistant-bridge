import { expect, it } from 'vitest';

import {
  PROTOCOL_VERSION,
  assistantCommandResultSchema,
  hostActionRequestSchema,
  isCompatibleProtocolVersion,
} from '@/contracts';

const [major, minor] = PROTOCOL_VERSION.split('.').map(Number);

it('treats versions with the same major as compatible', () => {
  expect(isCompatibleProtocolVersion(PROTOCOL_VERSION)).toBe(true);
  expect(isCompatibleProtocolVersion(`${major}.${minor + 4}.0`)).toBe(true);
  expect(isCompatibleProtocolVersion(`${major + 1}.0.0`)).toBe(false);
  expect(isCompatibleProtocolVersion(`${major - 1}.9.9`)).toBe(false);

  for (const value of [undefined, null, 2, '', `${major}`, `${major}.0`, `v${PROTOCOL_VERSION}`]) {
    expect(isCompatibleProtocolVersion(value)).toBe(false);
  }
});

it('accepts envelopes from any compatible version and refuses others', () => {
  const request = {
    requestId: crypto.randomUUID(),
    action: 'ui.navigate',
    payload: { path: '/' },
  };

  expect(
    hostActionRequestSchema.safeParse({ ...request, protocolVersion: `${major}.${minor + 1}.0` })
      .success,
  ).toBe(true);
  expect(hostActionRequestSchema.safeParse({ ...request, protocolVersion: '1.0.0' }).success).toBe(
    major === 1,
  );
  expect(
    assistantCommandResultSchema.safeParse({
      protocolVersion: `${major + 1}.0.0`,
      requestId: crypto.randomUUID(),
      success: true,
    }).success,
  ).toBe(false);
});
