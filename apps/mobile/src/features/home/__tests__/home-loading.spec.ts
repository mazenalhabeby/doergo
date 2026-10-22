/**
 * The home's loading, end to end in source and in the pieces that decide it:
 * the queue is wired, the Crew copy holds counts and never people, and
 * sign-out wipes every kept answer on the device.
 */
import * as fs from 'fs';
import * as path from 'path';

const SRC = path.resolve(__dirname, '../../..');
const code = (p: string) => readSource(path.join(SRC, p), 'utf8');

jest.mock('@react-native-async-storage/async-storage', () => {
  const data = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async (k: string) => data.get(k) ?? null),
      setItem: jest.fn(async (k: string, v: string) => { data.set(k, v); }),
      getAllKeys: jest.fn(async () => [...data.keys()]),
      multiRemove: jest.fn(async (ks: string[]) => { ks.forEach((k) => data.delete(k)); }),
      __data: data,
    },
  };
});
import AsyncStorage from '@react-native-async-storage/async-storage';
import { forgetEverythingKept } from '@/lib/remember/store';
import { crewAsOf, type CrewPerson } from '../crew-state';
import { readSource } from '@/test-utils/read-source';

const flush = () => new Promise((r) => setImmediate(r));

describe('the home asks through its queue', () => {
  it('every card on the home sits in a HomeCard, inside the queue\'s provider', () => {
    const home = code('features/home/home-screen.tsx');
    expect(home).toMatch(/<HomeLoadContext\.Provider value=\{loadQueue\}>/);
    expect(home).toMatch(/<HomeCard id=\{item\.key\} restHeight=\{item\.restHeight\}>/);
    expect(home).toMatch(/onViewableItemsChanged=\{onViewable\}/);
  });

  it('useLiveRefresh asks through the queue when it is inside a home card', () => {
    const hook = code('hooks/use-live-refresh.ts');
    expect(hook).toMatch(/q\.request\(k, \(\) => latest\.current\(\), asker\)/);
    expect(hook).toMatch(/useContext\(HomeLoadContext\)/);
  });

  it('every home widget gives the height its first answer will take', () => {
    const reg = code('features/home/registry.tsx');
    const keys = [...reg.matchAll(/key: '([a-z-]+)',\n    restHeight: \d+/g)].map((m) => m[1]);
    expect(keys.sort()).toEqual(['clients', 'crew', 'my-route', 'my-work', 'shift-clock', 'shortcuts', 'today']);
  });
});

describe('Crew with no signal: counts as of a time, never people', () => {
  const person = (over: Partial<CrewPerson>): CrewPerson => ({
    userId: 'u', firstName: 'Anna', lastName: 'Secret', spaceId: 's1', spaceName: 'Warehouse',
    clockInAt: '2026-09-27T06:00:00.000Z', ...over,
  } as CrewPerson);

  it('keeps totals per workspace and nothing that names anyone', () => {
    const at = Date.parse('2026-09-27T08:12:00.000Z');
    const snap = crewAsOf([person({ userId: 'a' }), person({ userId: 'b', spaceId: 's2', spaceName: 'Main Office' })], at);
    expect(snap.at).toBe(at);
    expect(snap.sites.map((x) => x.spaceName).sort()).toEqual(['Main Office', 'Warehouse']);
    const text = JSON.stringify(snap);
    for (const leak of ['Anna', 'Secret', '"a"', '"b"', 'userId', 'firstName', 'clockInAt']) expect(text).not.toContain(leak);
  });

  it('the card draws it greyed out and dated, and the old one-liner only with nothing kept', () => {
    const card = code('features/home/crew-card.tsx');
    expect(card).toMatch(/t\('crew\.asOf'/);
    expect(card).toMatch(/t\('crew\.offline'/);
    // Nothing to act on from an old picture: the approvals row needs a live answer.
    expect(card).toMatch(/\{!data\.failed && \(site \?/);
  });

  it('kept per user, for TODAY only', () => {
    expect(code('features/home/use-crew.ts')).toMatch(/const AS_OF_RULES = \{ sameDay: true \}/);
  });
});

describe('sign-out wipes every kept answer on the device', () => {
  it('including copies written by an EARLIER run and never read in this one', async () => {
    const data = (AsyncStorage as unknown as { __data: Map<string, string> }).__data;
    data.set('@hbcfield/kept/crew-asof/user-1', '{}');
    data.set('@hbcfield/kept/shift/user-1', '{}');
    data.set('unrelated/key', 'x');
    forgetEverythingKept();
    await flush(); await flush();
    expect([...data.keys()]).toEqual(['unrelated/key']);
  });
});
