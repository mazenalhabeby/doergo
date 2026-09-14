import { createPoke } from '../socket-poke';

describe('live events as a signal to re-sync', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('a burst of events is one pull, after the burst', () => {
    const pull = jest.fn().mockResolvedValue(undefined);
    const poke = createPoke(pull);
    for (let i = 0; i < 10; i++) {
      poke.poke();
      jest.advanceTimersByTime(500);
    }
    expect(pull).not.toHaveBeenCalled();
    jest.advanceTimersByTime(2000);
    expect(pull).toHaveBeenCalledTimes(1);
  });

  it('events far apart are separate pulls', () => {
    const pull = jest.fn().mockResolvedValue(undefined);
    const poke = createPoke(pull);
    poke.poke();
    jest.advanceTimersByTime(2500);
    poke.poke();
    jest.advanceTimersByTime(2500);
    expect(pull).toHaveBeenCalledTimes(2);
  });

  it('a failed pull is swallowed — the cursor covers it next time', async () => {
    const pull = jest.fn().mockRejectedValue(new Error('offline'));
    const poke = createPoke(pull);
    poke.poke();
    jest.advanceTimersByTime(2000);
    await Promise.resolve();
    expect(pull).toHaveBeenCalledTimes(1);
  });

  it('nothing pulls after the listener is gone', () => {
    const pull = jest.fn().mockResolvedValue(undefined);
    const poke = createPoke(pull);
    poke.poke();
    poke.cancel();
    jest.advanceTimersByTime(5000);
    expect(pull).not.toHaveBeenCalled();
  });
});
