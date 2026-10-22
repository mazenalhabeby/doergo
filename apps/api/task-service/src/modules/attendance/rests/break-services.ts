import { BreakService } from './break.service';
import { BreakStartService } from './break-start.service';
import { BreakStatusService } from './break-status.service';
import { BreakReadService } from './break-read.service';
import { OfficeBreaksService } from './office-breaks.service';
import { RestAwayService } from './rest-away.service';

/**
 * Rests, by job — one list read by the module and by every test that builds
 * them, so the two cannot drift (one BreakService until 2026-10-16).
 */
export const BREAK_SERVICES = [
  BreakStartService,
  BreakService,
  BreakStatusService,
  BreakReadService,
  OfficeBreaksService,
  // Lunch off site is the rest — the heartbeat asks it, optionally (rest-away.service).
  RestAwayService,
];
