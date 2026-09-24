/**
 * The rail is a VIEW OF A TABLE, and the table is the only thing that gates.
 *
 * ⚠️ One table, three surfaces — the Manage tab, the More sheet and this rail
 * all read `manage-rows.ts`. If the rail and the Manage list ever disagree
 * about who may open Clients, the bug is in that file. `manage-rows.ts` records
 * what the drift already cost: *"that is how a member comes to see Clients on
 * the web and not on the phone."*
 */
import * as fs from 'fs';
import * as path from 'path';
import { chooseTiles } from '../shortcut-tiles';
import type { Destination } from '../manage-rows';

const SRC = path.resolve(__dirname, '../..');
const d = (labelKey: string, badge?: string): Destination =>
  ({ icon: '', labelKey, descKey: '', route: '/x', color: '#000',
     permission: '', orgWide: false, home: true, ...(badge ? { badge } : {}) }) as Destination;

describe('twenty-two destinations, four slots', () => {
  it('cuts to four', () => {
    const all = ['a', 'b', 'c', 'e', 'f'].map((k) => d(k));
    expect(chooseTiles(all, {}).length).toBe(4);
  });

  it('puts badged tiles first', () => {
    const chosen = chooseTiles([d('verb1'), d('doc', 'documents.due'), d('verb2')], { 'documents.due': 3 });
    expect(chosen[0]!.labelKey).toBe('doc');
  });

  it('keeps registry order inside each group — a toolbar that reorders itself cannot be learned', () => {
    const chosen = chooseTiles([d('a'), d('b'), d('c')], {});
    expect(chosen.map((x) => x.labelKey)).toEqual(['a', 'b', 'c']);
  });

  it('a count of zero is not a badge, and drops the tile to the verb group', () => {
    const chosen = chooseTiles([d('verb'), d('doc', 'documents.due')], { 'documents.due': 0 });
    expect(chosen[0]!.labelKey).toBe('verb');
  });

  it('an unknown count draws no badge and does not promote', () => {
    // ⚠️ Never a `?`, never a dot. The rail must not invent a reason to worry.
    const chosen = chooseTiles([d('verb'), d('doc', 'documents.due')], {});
    expect(chosen[0]!.labelKey).toBe('verb');
  });
});

describe('the five states', () => {
  const src = fs.readFileSync(path.join(SRC, 'components/home/shortcuts-rail.tsx'), 'utf8');

  it('⑤ fewer than two is not drawn — one tile is a button that has learned to look like a widget', () => {
    expect(src).toMatch(/if \(chosen\.length < 2\) return null;/);
  });

  it('④ two tiles are NOT stretched to fill the width', () => {
    /*
      They are 71pt because that is what a 26px mark needs; a 150pt tile with a
      26px mark in it looks like a mistake. `flex: 1` made exactly that shape
      the moment a member had two modules instead of four.
    */
    const rule = fs.readFileSync(path.join(SRC, 'lib/shortcut-tiles.ts'), 'utf8');
    expect(rule).toMatch(/export const TILE_SIZE = 71;/);
    expect(src).toMatch(/width: TILE_SIZE,\s*\n\s*height: TILE_SIZE,/);
    const tile = src.slice(src.indexOf('function Tile('));
    expect(tile).not.toMatch(/flex: 1/);
  });

  it('the badge caps at 9+', () => {
    expect(src).toMatch(/count > 9 \? '9\+'/);
  });
});

describe('the rail asks nobody anything', () => {
  const src = fs.readFileSync(path.join(SRC, 'components/home/shortcuts-rail.tsx'), 'utf8');

  it('makes no request of its own', () => {
    /*
      ⚠️ The only widget in the catalogue that cannot show an error state,
      because it never asks. A badge must never be the ONLY reason a request
      happens — a tile renders without its number rather than firing a call to
      decorate itself. `useSyncStatus` is the one allowed source: the outbox is
      on this phone.
    */
    expect(src).not.toMatch(/\bfetch\(|Api\.\w+\(|useQuery\(/);
  });

  it('owns no gate — it reads homeDestinationsFor and nothing else', () => {
    expect(src).toContain('homeDestinationsFor(user');
    expect(src).not.toMatch(/\bholds\(|orgHasAddOn\(|moduleAnywhere\(/);
  });
});

describe('never a tile for a tab', () => {
  it('no home row points inside (tabs)/, except the one argued in the table', () => {
    const rows = fs.readFileSync(path.join(SRC, 'lib/manage-rows.ts'), 'utf8');
    const homeTabRoutes = [...rows.matchAll(/route: '([^']*\(tabs\)[^']*)'[^}]*home: true/g)].map((m) => m[1]);
    /*
      ⚠️ A tile that duplicates a tab is a second door to the same room, one of
      which moves. `create-task` is the single exception and it is argued in
      the table: v2's fixed set is Home · Jobs · Clock · Messages, so it holds
      no permanent slot any more — and creating a job was always a better tile
      than a place. It is an action; the tab bar is a set of rooms.
    */
    expect(homeTabRoutes).toEqual(['/(app)/(tabs)/create-task']);
  });
});
