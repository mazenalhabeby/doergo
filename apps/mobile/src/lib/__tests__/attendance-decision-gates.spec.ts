/**
 * The phone's attendance review asks the same three questions the server does.
 *
 *   approve / reject a shift   → canApproveAttendance  (a sign-off)
 *   edit a shift, excuse a no-show → canReconcileAttendance (a correction)
 *
 * They were one grant (`canReconcileAttendance`) until a client's supervisor
 * needed to sign off our hours without being able to rewrite them. A button
 * that asks the wrong key is either a control the server refuses or a grant
 * nobody can use.
 */
import * as path from 'path';
import { readSource } from '../../test-utils/read-source';
import { holds } from '../permissions';

const SCREEN = path.resolve(__dirname, '../../../app/(app)/manage/attendance.tsx');
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const src = stripComments(readSource(SCREEN, 'utf8'));

describe('attendance review — which grant each control asks', () => {
  it('approving hours and excusing a missed clock-in are decided in Approvals, not here', () => {
    expect(src).not.toMatch(/approveEntry|rejectEntry|resolveNoShow/);
    expect(src).toContain('/(app)/approvals?kind=noShow');
  });

  it('editing follows canReconcileAttendance', () => {
    expect(src).toContain("const canCorrect = holds(user, 'canReconcileAttendance')");
    expect(src).toContain("{canCorrect && segment === 'records' && (");
  });

  it('a supervisor who only signs off holds the one and not the other', () => {
    const supervisor = {
      role: 'EMPLOYEE',
      access: { org: {}, perSpace: { s1: { canApproveAttendance: true, canViewSpaceAttendance: true } } },
    };
    expect(holds(supervisor, 'canApproveAttendance')).toBe(true);
    expect(holds(supervisor, 'canReconcileAttendance')).toBe(false);
  });
});
