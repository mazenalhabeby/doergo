/**
 * ⚠️ A URL may OPEN a screen, never ACT.
 *
 * `hbcfield://task/<id>?sheet=join` used to join the member to that job's crew
 * (starting their time on it) the moment the page opened. The push button now
 * hands the join over in memory; a link can only open the job.
 */
import * as fs from 'fs';
import * as path from 'path';
import { armCrewJoin, clearCrewJoin, crewJoinArmed, JOIN_INTENT_TTL_MS, takeCrewJoin } from '../join-intent';
import { parseOpenSheet } from '../../features/job/job-logic';
import { crewJoinTarget } from '../notification-route';
import { runSessionEndCleaners } from '../session/session-registry';
import { readSource } from '../../test-utils/read-source';

const ROOT = path.resolve(__dirname, '../../..');
const read = (p: string) =>
  readSource(path.join(ROOT, p), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

beforeEach(() => clearCrewJoin());

describe('the join is armed in memory by the push button, and taken once', () => {
  it('only for the task it was armed for, only once', () => {
    armCrewJoin('task-1', 1_000);
    expect(takeCrewJoin('task-2', 1_100)).toBe(false);
    expect(takeCrewJoin('task-1', 1_200)).toBe(true);
    expect(takeCrewJoin('task-1', 1_300)).toBe(false);
  });

  it('goes stale — a launch that never reached the page must not join later', () => {
    armCrewJoin('task-1', 0);
    expect(crewJoinArmed('task-1', JOIN_INTENT_TTL_MS + 1)).toBe(false);
    expect(takeCrewJoin('task-1', JOIN_INTENT_TTL_MS + 1)).toBe(false);
  });

  it('is forgotten when the session ends', async () => {
    armCrewJoin('task-1');
    await runSessionEndCleaners();
    expect(takeCrewJoin('task-1')).toBe(false);
  });
});

describe('a link cannot ask for a join', () => {
  it('`?sheet=join` is not a sheet any more', () => {
    expect(parseOpenSheet('join')).toBeNull();
    expect(parseOpenSheet(['join'])).toBeNull();
    // The sheets that only OPEN something still work.
    expect(parseOpenSheet('issue')).toBe('issue');
    expect(parseOpenSheet('form:ARRIVED')).toBe('form:ARRIVED');
  });

  it("the crew push's target carries no join in its URL", () => {
    expect(crewJoinTarget({ taskId: 't1' })).toEqual({ pathname: '/(app)/task/[id]', params: { id: 't1' } });
  });

  it('the job page joins only on an armed intent, never on its route parameter', () => {
    const page = read('src/features/job/job-page.tsx');
    expect(page).not.toMatch(/initialSheet\s*!==\s*'join'|initialSheet\s*===\s*'join'/);
    expect(page).toMatch(/takeCrewJoin\(taskId\) && !crew\.me\.joined\) void crew\.join\(true\)/);
  });

  it("the push handler arms it only for the push's own recipient", () => {
    const layout = read('app/(app)/_layout.tsx');
    expect(layout).toMatch(/mayActOnPush\(\{[^}]*\}\)\) armCrewJoin\(taskId\)/);
  });
});

describe('the signing screen trusts only the document id from its URL', () => {
  const src = read('app/(app)/sign-document.tsx');
  it('reads no title or mode from the route', () => {
    expect(src).toMatch(/useLocalSearchParams<\{ id: string \}>\(\)/);
    expect(src).not.toMatch(/params\.title|params\.mode/);
  });
  it("the title comes from the server's chain answer", () => {
    expect(src).toMatch(/setTitle\(c\.title\)/);
    expect(src).toMatch(/<ScreenHeader\s+title=\{title \|\| t\('documents\.sign\.title'\)\}/);
  });
});
