/*
  useFetchData's options, pinned with a tiny stand-in for React's hooks (the phone's
  jest runs without a renderer): state, callbacks and refs persist across "renders"
  by call order, exactly as React keeps them.
*/
const slots: unknown[] = [];
let cursor = 0;
jest.mock('react', () => ({
  useState: (init: unknown) => {
    const i = cursor++;
    if (!(i in slots)) slots[i] = typeof init === 'function' ? (init as () => unknown)() : init;
    const set = (v: unknown) => {
      slots[i] = typeof v === 'function' ? (v as (p: unknown) => unknown)(slots[i]) : v;
    };
    return [slots[i], set];
  },
  useRef: (init: unknown) => {
    const i = cursor++;
    if (!(i in slots)) slots[i] = { current: init };
    return slots[i];
  },
  useCallback: (fn: unknown) => {
    cursor++;
    return fn;
  },
}));

import { useFetchData } from '../useFetchData';

// Called through a plain name: the stand-in above IS the component, so the hook rule does not apply here.
const runHook = useFetchData;

type Opts = Parameters<typeof useFetchData<string[]>>[0];
function mount(opts: Opts) {
  slots.length = 0;
  const render = () => {
    cursor = 0;
    return runHook<string[]>(opts);
  };
  return render;
}
const deferred = <T>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
};
const err401 = Object.assign(new Error('Session expired'), { statusCode: 401 });

describe('useFetchData', () => {
  it('default: a second call while one is in flight is dropped', async () => {
    const d = deferred<string[]>();
    const fetcher = jest.fn(() => d.promise);
    const render = mount({ fetcher });
    const a = render().fetchData();
    const b = render().refresh();
    d.resolve(['x']);
    await Promise.all([a, b]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(render().data).toEqual(['x']);
  });

  it('dedupe: false — every call asks, and each clears only its own flag', async () => {
    const first = deferred<string[]>();
    const pull = deferred<string[]>();
    const fetcher = jest.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(pull.promise);
    const render = mount({ fetcher, dedupe: false });
    const a = render().fetchData();
    const b = render().refresh();
    expect(fetcher).toHaveBeenCalledTimes(2);
    first.resolve(['a']);
    await a;
    expect(render().isRefreshing).toBe(true); // the pull's spinner is still going
    pull.resolve(['b']);
    await b;
    expect(render().isRefreshing).toBe(false);
    expect(render().data).toEqual(['b']);
  });

  it('default: a 401 sets no error and leaves the data alone', async () => {
    const onError = jest.fn(() => ['fallback']);
    const render = mount({ fetcher: () => Promise.reject(err401), onError });
    await render().fetchData();
    expect(render().error).toBeNull();
    expect(render().data).toBeUndefined();
    expect(onError).not.toHaveBeenCalled();
  });

  it('ignore401: false — a 401 is a failure like any other', async () => {
    const render = mount({ fetcher: () => Promise.reject(err401), ignore401: false, onError: () => [] });
    await render().fetchData();
    expect(render().error).toBe('Session expired');
    expect(render().data).toEqual([]);
  });

  it('onError is called once with the current data; its answer becomes the data', async () => {
    const onError = jest.fn((_e: unknown, cur: string[] | undefined) => cur ?? ['empty']);
    const fetcher = jest.fn().mockResolvedValueOnce(['kept']).mockRejectedValueOnce(new Error('down'));
    const render = mount({ fetcher, onError });
    await render().fetchData();
    render();
    await render().fetchData();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][1]).toEqual(['kept']);
    expect(render().data).toEqual(['kept']);
    expect(render().error).toBe('down');
  });

  it('onError answering undefined leaves the data untouched', async () => {
    const render = mount({ fetcher: () => Promise.reject(new Error('x')), onError: () => undefined });
    await render().fetchData();
    expect(render().data).toBeUndefined();
  });
});
