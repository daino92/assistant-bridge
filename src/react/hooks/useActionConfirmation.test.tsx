import { StrictMode, type ReactNode } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';

import { useActionConfirmation } from '@/react/hooks';

const Wrapper = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>;

const REQUEST = { name: 'test.delete', description: 'Delete', args: {} };

afterEach(cleanup);

it('works after Strict Mode replay, rejects stale UI decisions and cancels on final unmount', async () => {
  const { result, unmount } = renderHook(() => useActionConfirmation(), { wrapper: Wrapper });

  await act(async () => {
    await Promise.resolve();
  });

  let first!: Promise<boolean>;

  act(() => {
    first = result.current.requestConfirmation(REQUEST);
  });
  expect(result.current.confirmation?.name).toBe('test.delete');

  const staleApprove = result.current.approve;

  act(() => result.current.approve());
  await expect(first).resolves.toBe(true);
  expect(result.current.confirmation).toBeUndefined();

  let second!: Promise<boolean>;

  act(() => {
    second = result.current.requestConfirmation(REQUEST);
  });
  act(() => staleApprove());
  expect(result.current.confirmation).toBeDefined();
  act(() => result.current.reject());
  await expect(second).resolves.toBe(false);

  let pending!: Promise<boolean>;

  act(() => {
    pending = result.current.requestConfirmation(REQUEST);
  });

  const rejected = expect(pending).rejects.toThrow();
  const request = result.current.requestConfirmation;

  unmount();
  await rejected;
  await Promise.resolve();
  await expect(request(REQUEST)).rejects.toMatchObject({ code: 'RECEIVER_UNAVAILABLE' });
});

it('clears the visible confirmation when the executor cancellation signal aborts', async () => {
  const { result } = renderHook(() => useActionConfirmation());
  const stop = new AbortController();
  let pending!: Promise<boolean>;

  act(() => {
    pending = result.current.requestConfirmation(REQUEST, stop.signal);
  });

  const rejected = expect(pending).rejects.toThrow();

  act(() => stop.abort());
  await rejected;
  expect(result.current.confirmation).toBeUndefined();
});
