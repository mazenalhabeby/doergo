import type { CompanyLocation } from '../api';
import { clockableLocations } from '../clockable';
import { readSource } from '../../test-utils/read-source';
import path from 'path';

/*
  The phone chose where to clock in from the status list, which includes an
  assignment that starts next week and a workspace with Time Tracking off —
  so it could offer, or silently auto-pick, a workspace the server refused.
*/
const loc = (id: string, clockable?: boolean) => ({ id, name: id, clockable }) as unknown as CompanyLocation;

describe('the phone clocks in only where the server would take it', () => {
  it('drops a workspace the server marks not clockable; keeps an untagged one (older server)', () => {
    expect(clockableLocations([loc('a', true), loc('b', false), loc('c')]).map((l) => l.id)).toEqual(['a', 'c']);
    expect(clockableLocations(undefined)).toEqual([]);
  });

  it('the choice, the picker and the card all read the clockable list', () => {
    const src = (p: string) => readSource(path.resolve(__dirname, '../..', p), 'utf8');
    const hook = src('hooks/useClockIn.ts');
    expect(hook).toMatch(/chooseClockInLocation\(clockable,/);
    expect(hook).toMatch(/locations: clockable,/);
    expect(src('features/home/shift-clock-card.tsx')).toMatch(/clockableLocations\(status\?\.assignedLocations\)/);
  });
});
