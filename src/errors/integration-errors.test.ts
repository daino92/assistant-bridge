import { expect, it } from 'vitest';

import { ERROR_CODES } from '@/contracts';
import {
  createIntegrationError,
  isIntegrationErrorCode,
  normalizeIntegrationError,
} from '@/errors';

it('preserves every supported code and strips raw details from errors and plain wire objects', () => {
  for (const code of Object.values(ERROR_CODES)) {
    const detail = normalizeIntegrationError({
      code,
      message: 'PRIVATE body',
      stack: 'PRIVATE stack',
      token: 'PRIVATE token',
    });

    expect(detail.code).toBe(code);
    expect(JSON.stringify(detail)).not.toContain('PRIVATE');
    expect(Object.keys(detail)).toEqual(['code', 'message']);
    expect(createIntegrationError(code)).toMatchObject(detail);
    expect(normalizeIntegrationError(Object.assign(new Error('PRIVATE'), { code }))).toEqual(
      detail,
    );
  }
});

it('does not infer a code from arbitrary message text or inherited object keys', () => {
  for (const value of [
    null,
    undefined,
    'ACTION_REJECTED',
    new Error('ACTION_REJECTED: TIMEOUT'),
    { code: 'UNKNOWN_PRIVATE_CODE', message: 'SERVICE_UNAVAILABLE' },
    { code: 'toString' },
  ]) {
    expect(normalizeIntegrationError(value).code).toBe(ERROR_CODES.EXECUTION_FAILED);
  }

  expect(isIntegrationErrorCode('toString')).toBe(false);
  expect(isIntegrationErrorCode('TIMEOUT')).toBe(true);
});
