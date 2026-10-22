import fs from 'fs';
import path from 'path';

jest.mock('@react-native-async-storage/async-storage', () => {
  const data = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async (k: string) => data.get(k) ?? null),
      setItem: jest.fn(async (k: string, v: string) => { data.set(k, v); }),
      removeItem: jest.fn(async (k: string) => { data.delete(k); }),
      __data: data,
    },
  };
});

import { HOME_WIDGET_KEYS, parseAssignedHome, readAssignedHome } from '@hbcfield/shared/client';
import {
  layoutFromAssignment, appliedAssignment, markAssignmentApplied,
  saveShortcuts, loadShortcuts, onShortcutsChanged,
} from '../layout-store';
import { MANAGE_ROWS, MEMBER_ROWS } from '../../../lib/manage-rows';

/**
 * A home screen the office sets up: validated on the server, applied ONCE by
 * the phone, then the member's to change.
 */
describe('a home screen set up by the office', () => {
  it('the server knows exactly the widgets the phone has', () => {
    const registry = fs.readFileSync(path.resolve(__dirname, '../registry.tsx'), 'utf8');
    const keys = [...registry.matchAll(/^\s{4}key: '([a-z-]+)',/gm)].map((m) => m[1]);
    expect([...keys].sort()).toEqual([...HOME_WIDGET_KEYS].sort());
  });

  it('every shortcut key the phone has passes the server check', () => {
    const labelKeys = [...MANAGE_ROWS, ...MEMBER_ROWS].map((r) => r.labelKey);
    expect(labelKeys.length).toBeGreaterThan(10);
    for (const k of labelKeys) {
      expect(() => parseAssignedHome({ widgets: ['shortcuts'], shortcuts: [k] })).not.toThrow();
    }
  });

  it('refuses what it does not know, duplicates, and more than four tiles', () => {
    expect(() => parseAssignedHome({ widgets: ['pwned'] })).toThrow();
    expect(() => parseAssignedHome({ widgets: [] })).toThrow();
    expect(() => parseAssignedHome({ widgets: ['crew', 'crew'] })).toThrow();
    expect(() => parseAssignedHome({ widgets: ['shortcuts'], shortcuts: ['javascript:alert(1)'] })).toThrow();
    expect(() => parseAssignedHome({ widgets: ['shortcuts'], shortcuts: ['a.b', 'c.d', 'e.f', 'g.h', 'i.j'] })).toThrow();
    expect(parseAssignedHome({ widgets: ['shift-clock'] }).shortcuts).toEqual([]);
  });

  it('shows the chosen widgets in order and switches every other one off', () => {
    const l = layoutFromAssignment({ widgets: ['shift-clock', 'shortcuts', 'crew', 'my-work'] });
    expect(l.keys.slice(0, 4)).toEqual(['shift-clock', 'shortcuts', 'crew', 'my-work']);
    expect([...l.hidden].sort()).toEqual(['clients', 'my-route', 'today']);
    expect(new Set(l.keys).size).toBe(HOME_WIDGET_KEYS.length);
  });

  it('is applied once: the phone remembers which assignment it applied', async () => {
    expect(await appliedAssignment('u1')).toBeNull();
    await markAssignmentApplied('u1', '2026-09-29T20:00:00.000Z');
    expect(await appliedAssignment('u1')).toBe('2026-09-29T20:00:00.000Z');
    expect(await appliedAssignment('u2')).toBeNull(); // keyed by person
  });

  it('tells a card on screen that its tiles changed', async () => {
    const heard: string[] = [];
    const off = onShortcutsChanged((id) => heard.push(id));
    await saveShortcuts('u1', ['shortcuts.documents', 'shortcuts.support']);
    off();
    await saveShortcuts('u1', null);
    expect(heard).toEqual(['u1']);
    expect(await loadShortcuts('u1')).toBeNull();
  });

  it('reads a stored value defensively', () => {
    expect(readAssignedHome(null)).toBeNull();
    expect(readAssignedHome({ widgets: 'x', setAt: 'y' })).toBeNull();
    expect(readAssignedHome({ widgets: ['crew', 'nope'], shortcuts: ['shortcuts.sync', 'bad key'], setAt: 't' })).toEqual({
      widgets: ['crew'], shortcuts: ['shortcuts.sync'], setAt: 't',
    });
  });
});
