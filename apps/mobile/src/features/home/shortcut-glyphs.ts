import type React from 'react';
import type { GlyphProps } from '../../components/glyphs/glyphs';
import { DocumentsGlyph, SupportGlyph } from '../../components/glyphs/glyphs';
import {
  SignGlyph, MyEquipmentGlyph, SyncGlyph, OvertimeGlyph, NewJobGlyph, ScanCardGlyph, AddClientGlyph,
  EquipmentLogGlyph, MembersGlyph, ClientsGlyph, InvitationsGlyph, SchedulesGlyph, RegisterGlyph, ClientRequestsGlyph,
} from '../../components/glyphs/tile-glyphs';
import { ExpenseQueueGlyph, LeaveQueueGlyph, JoinQueueGlyph, ApprovalsGlyph } from '../../components/glyphs/queue-glyphs';
import { PlanRouteGlyph } from '../../components/glyphs/route-glyphs';
import { RosterGlyph, HoursWaitingGlyph } from '../../components/glyphs/crew-glyphs';
import { IssueNewGlyph } from '../../components/glyphs/shift-glyphs';

/**
 * Each destination's mark, keyed by the table row's `labelKey`.
 *
 * ⚠️ Here and not on the row: `manage-rows.ts` is read by the tab bar, and a
 * table that imports every drawing in the app is how a require cycle turns
 * into a black screen (components/amazen/index.ts records one).
 * ⚠️ Every mark differs in OUTLINE (icons README rule 4) — these sit side by
 * side in one row of four.
 */
export const SHORTCUT_GLYPHS: Record<string, React.ComponentType<GlyphProps>> = {
  'shortcuts.documents': DocumentsGlyph,
  'shortcuts.sign': SignGlyph,
  'shortcuts.myEquipment': MyEquipmentGlyph,
  'shortcuts.sync': SyncGlyph,
  'shortcuts.overtime': OvertimeGlyph,
  'shortcuts.logExpense': ExpenseQueueGlyph,
  'shortcuts.newJob': NewJobGlyph,
  'shortcuts.scanCard': ScanCardGlyph,
  'shortcuts.addClient': AddClientGlyph,
  'shortcuts.planRoute': PlanRouteGlyph,
  'shortcuts.support': SupportGlyph,
  'shortcuts.equipmentLog': EquipmentLogGlyph,
  'manage.approvals.label': ApprovalsGlyph,
  'manage.attendance.label': RosterGlyph,
  'manage.extraTime.label': HoursWaitingGlyph,
  'manage.timeOff.label': LeaveQueueGlyph,
  'manage.members.label': MembersGlyph,
  'manage.customers.label': ClientsGlyph,
  'manage.joinRequests.label': JoinQueueGlyph,
  'manage.invitations.label': InvitationsGlyph,
  'manage.schedules.label': SchedulesGlyph,
  'manage.issues.label': IssueNewGlyph,
  'manage.equipment.label': RegisterGlyph,
  'manage.clientRequests.label': ClientRequestsGlyph,
};
