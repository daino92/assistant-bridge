import { describe, expect, it, vi } from 'vitest';
import { TypedEventBus } from './typed-event-bus';

type TestEvents = {
  ping: { value: number };
  pong: string;
};

describe('TypedEventBus', () => {
  it('delivers events to subscribers', () => {
    const bus = new TypedEventBus<TestEvents>();
    const handler = vi.fn();

    bus.on('ping', handler);
    bus.emit('ping', { value: 42 });
    expect(handler).toHaveBeenCalledWith({ value: 42 });
  });

  it('unsubscribes via cleanup function', () => {
    const bus = new TypedEventBus<TestEvents>();
    const handler = vi.fn();
    const off = bus.on('ping', handler);

    off();
    bus.emit('ping', { value: 1 });
    expect(handler).not.toHaveBeenCalled();
  });

  it('supports independent instances', () => {
    const a = new TypedEventBus<TestEvents>();
    const b = new TypedEventBus<TestEvents>();
    const ha = vi.fn();
    const hb = vi.fn();

    a.on('ping', ha);
    b.on('ping', hb);
    a.emit('ping', { value: 1 });
    expect(ha).toHaveBeenCalled();
    expect(hb).not.toHaveBeenCalled();
  });
});
