export { AdminDashboard } from './admin-dashboard';
export { ShiftClockCard } from './shift-clock-card';
export { FullTimeHome } from './full-time-home';
export { FreelancerHome } from './freelancer-home';
export { HybridHome } from './hybrid-home';
export { QuickActions } from './quick-actions';
export * from './glyphs';

/* ═══════════════════════════════════════════════════════════════════════════
   v2 — the icon system.

   Fifty-four marks in seven files, one construction law, moved here from
   `docs/design/icons/`. Read that folder's `README.md` before adding one: the
   law is not a style, it is the only reason they read as one family.

   ⚠️ `OnBreakGlyph` was in the handoff and is NOT here — a steaming cup and
   `BreakGlyph` were one idea drawn twice. `BreakGlyph` now lives in
   `shift-glyphs.tsx` and is the PAUSE, not a cup.
   ═══════════════════════════════════════════════════════════════════════════ */

/* ── The shift clock · §3.1 — the card and the two issue sheets ── */
export {
  ClockInGlyph,
  ClockOutGlyph,
  BreakGlyph,
  IssueNewGlyph,
  IssueMineGlyph,
  RouteGlyph,
} from './shift-glyphs';

/* ── The active row · §3.2 §3.3 §3.5 — the job you are on ── */
export {
  AcceptGlyph,
  OnMyWayGlyph,
  ArrivedGlyph,
  StartWorkGlyph,
  FinishGlyph,
  CallGlyph,
  NavigateGlyph,
  MoreGlyph,
} from './work-glyphs';

/* ── The route · §3.4 — the driving day ── */
export {
  PlanRouteGlyph,
  OptimizedGlyph,
  StopDoneGlyph,
  NoRoadGlyph,
  BackHomeGlyph,
} from './route-glyphs';

/* ── The crew · §3.6 §3.7 §3.8 — attendance ── */
export {
  OnClockGlyph,
  NotArrivedGlyph,
  HoursWaitingGlyph,
  RosterGlyph,
} from './crew-glyphs';

/* ── The queues · §3.14 §3.15 §3.19 §3.21 — what is waiting on you ── */
export {
  LeaveQueueGlyph,
  ExpenseQueueGlyph,
  ProposalQueueGlyph,
  JoinQueueGlyph,
  CoverGlyph,
} from './queue-glyphs';

/* ── The tiles and destinations · §3.27 — the shortcuts rail, and every screen that had no mark ── */
export {
  CredentialGlyph,
  SyncGlyph,
  NewJobGlyph,
  ScanCardGlyph,
  AddClientGlyph,
  MyEquipmentGlyph,
  EquipmentLogGlyph,
  SignGlyph,
  OvertimeGlyph,
  MembersGlyph,
  InvitationsGlyph,
  SchedulesGlyph,
  ContractGlyph,
  ClientsGlyph,
  InvoicesGlyph,
  SavedReportGlyph,
} from './tile-glyphs';

/* ── The documents reminder · §3.16 — one sheet, four badges ── */
export {
  DocNeededGlyph,
  DocExpiringGlyph,
  DocSentBackGlyph,
  DocBlockedGlyph,
  CountersignGlyph,
} from './doc-glyphs';

/* ── The clients card · §3.11 ── */
export {
  EmailGlyph,
  ReminderGlyph,
  ColdGlyph,
  ClientCompanyGlyph,
  ClientPersonGlyph,
} from './crm-glyphs';

