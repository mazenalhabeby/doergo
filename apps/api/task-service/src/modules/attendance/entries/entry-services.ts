import { ApprovalService } from './approval.service';
import { EntryEditService } from './entry-edit.service';
import { EntryRecordService } from './entry-record.service';
import { ManualEntriesService } from './manual-entries.service';
import { EntryChangeLog } from './entry-change-log';

/**
 * Deciding and correcting time entries, by job — one list read by the module and
 * by every test that builds them (one ApprovalService until 2026-10-16), with the
 * change log they all write through.
 */
export const ENTRY_SERVICES = [
  ApprovalService,
  EntryEditService,
  EntryRecordService,
  ManualEntriesService,
  EntryChangeLog,
];
