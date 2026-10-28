import { expect, it } from 'vitest';

import {
  createRunError,
  describeRunError,
  isRunErrorCode,
  normalizeRunError,
  RUN_ERROR_CODES,
} from '@/ag-ui';

it('preserves known codes and uses only catalog messages for Error and wire objects', () => {
  for (const code of Object.values(RUN_ERROR_CODES)) {
    const result = normalizeRunError({
      code,
      message: 'PRIVATE provider body',
      stack: 'PRIVATE',
      url: 'PRIVATE',
    });

    expect(result.code).toBe(code);
    expect(Object.keys(result)).toEqual(['code', 'message']);
    expect(JSON.stringify(result)).not.toContain('PRIVATE');
    expect(normalizeRunError(Object.assign(new Error('PRIVATE'), { code }))).toEqual(result);
    expect(createRunError(code)).toMatchObject(result);
    expect(describeRunError({ code, message: 'PRIVATE' })).toBe(result.message);
  }
});

it('does not infer codes from message text or trust unknown provider codes', () => {
  for (const error of [
    undefined,
    null,
    'TIMEOUT',
    new Error('TIMEOUT websocket BFF connection'),
    { code: 'toString', message: 'PRIVATE' },
    { code: 'INTERNAL_PROVIDER_CODE', message: 'PRIVATE' },
  ]) {
    expect(normalizeRunError(error)).toEqual(normalizeRunError({ code: 'AGENT_ERROR' }));
  }

  expect(isRunErrorCode('toString')).toBe(false);
  expect(isRunErrorCode('TIMEOUT')).toBe(true);
});
