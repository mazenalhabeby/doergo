import { BreakService } from './break.service';
import { BreakStatusService } from './break-status.service';
import { BreakReadService } from './break-read.service';
import { OfficeBreaksService } from './office-breaks.service';

/**
 * Rests, by job — one list read by the module and by every test that builds
 * them, so the two cannot drift (one BreakService until 2026-10-16).
 */
export const BREAK_SERVICES = [BreakService, BreakStatusService, BreakReadService, OfficeBreaksService];
