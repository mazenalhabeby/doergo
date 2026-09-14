/**
 * A profile photo chosen, changed or removed with no signal.
 */
import { createPendingAvatar, type PendingAvatarDeps } from '../profile/pending-avatar';

function setup(mode: 'ok' | 'offline' | 'refused' = 'ok') {
  const mem = new Map<string, string>();
  const calls: string[] = [];
  const forgotten: string[] = [];
  const deps: PendingAvatarDeps = {
    storage: { getItem: async (k) => mem.get(k) ?? null, setItem: async (k, v) => void mem.set(k, v), removeItem: async (k) => void mem.delete(k) },
    upload: async (uri) => {
      if (mode === 'offline') throw new TypeError('Network request failed');
      if (mode === 'refused') throw new Error('File too large');
      calls.push(`upload ${uri}`);
    },
    remove: async () => {
      if (mode === 'offline') throw new TypeError('Network request failed');
      calls.push('remove');
    },
    forgetFile: async (id) => void forgotten.push(id),
    isUnreachable: (e) => e instanceof TypeError,
  };
  const avatar = createPendingAvatar('u1', deps);
  return { avatar, calls, forgotten, setMode: (m: typeof mode) => (mode = m) };
}
const photo = (id: string, at: number) => ({ kind: 'photo' as const, fileId: id, uri: `file:///${id}.jpg`, mime: 'image/jpeg', fileName: `${id}.jpg`, at });

describe('pending profile photo', () => {
  it('waits without signal, then sends and forgets the kept copy', async () => {
    const s = setup('offline');
    await s.avatar.set(photo('a', 1));
    expect(await s.avatar.flush()).toBe('waiting');
    expect((await s.avatar.current())?.kind).toBe('photo');
    s.setMode('ok');
    expect(await s.avatar.flush()).toBe('sent');
    expect(s.calls).toEqual(['upload file:///a.jpg']);
    expect(s.forgotten).toEqual(['a']);
    expect(await s.avatar.current()).toBeNull();
  });

  it('only the newest choice is sent: a photo then a removal means no photo', async () => {
    const s = setup('offline');
    await s.avatar.set(photo('a', 1));
    await s.avatar.set({ kind: 'remove', at: 2 });
    expect(s.forgotten).toEqual(['a']);
    s.setMode('ok');
    await s.avatar.flush();
    expect(s.calls).toEqual(['remove']);
  });

  it('a refused photo does not wait forever', async () => {
    const s = setup('refused');
    await s.avatar.set(photo('b', 1));
    expect(await s.avatar.flush()).toBe('refused');
    expect(await s.avatar.current()).toBeNull();
    expect(s.forgotten).toEqual(['b']);
  });

  it('tells the screen when the waiting choice changes', async () => {
    const s = setup('ok');
    const seen: (string | null)[] = [];
    s.avatar.subscribe((c) => seen.push(c?.kind ?? null));
    await s.avatar.set(photo('c', 1));
    await s.avatar.flush();
    expect(seen).toEqual(['photo', null]);
  });
});
