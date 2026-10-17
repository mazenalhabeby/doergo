import { Injectable, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { SERVICE_NAMES, BaseGatewayService } from '@hbcfield/shared';
import {
  pattern,
  type RpcRequest,
  getAttendanceStatus,
  listClockInLocations,
  getAttendanceHistory,
  worklogAddNote,
  worklogAddNotesBatch,
  worklogList,
  worklogDeleteNote,
  worklogPresignAttachment,
  worklogConfirmAttachment,
  worklogDeleteAttachment,
  getLocationEntries,
  getLocationEntriesBatch,
  getAllEntries,
  getActiveEntries,
  listNoShows,
  resolveNoShow,
  noShowSummary,
  autoClockPlan,
  autoClockConsent,
  autoClockUndo,
  autoClockSkipRest,
} from '@hbcfield/shared/microservices';

@Injectable()
export class AttendanceService extends BaseGatewayService {
  constructor(@Inject(SERVICE_NAMES.TASK) taskClient: ClientProxy) {
    super(taskClient, AttendanceService.name);
  }

  /**
   * Get current attendance status for an employee
   */
  async getStatus(data: RpcRequest<typeof getAttendanceStatus>) {
    return this.send(pattern(getAttendanceStatus), data);
  }

  /** The workspaces this member may clock in at right now — see the service. */
  async listClockInLocations(data: RpcRequest<typeof listClockInLocations>) {
    return this.send(pattern(listClockInLocations), data);
  }

  /**
   * Get attendance history for an employee
   */
  async getHistory(data: RpcRequest<typeof getAttendanceHistory>) {
    return this.send(pattern(getAttendanceHistory), data);
  }

  // ── Session work-log ("what I did today") ──────────────────────────────────
  /*
    Work-log and rest WRITES go through `sendOnce`: `send` retries on a slow
    answer, and a retried write lands twice — the batch route has no ids to
    catch it. Reads and presigns keep the retrying `send`.
  */
  worklogAddNote(data: RpcRequest<typeof worklogAddNote>) {
    return this.sendOnce(pattern(worklogAddNote), data);
  }
  worklogAddNotesBatch(data: RpcRequest<typeof worklogAddNotesBatch>) {
    return this.sendOnce(pattern(worklogAddNotesBatch), data);
  }
  worklogList(data: RpcRequest<typeof worklogList>) {
    return this.send(pattern(worklogList), data);
  }
  worklogDeleteNote(data: RpcRequest<typeof worklogDeleteNote>) {
    return this.sendOnce(pattern(worklogDeleteNote), data);
  }
  worklogPresignAttachment(data: RpcRequest<typeof worklogPresignAttachment>) {
    return this.send(pattern(worklogPresignAttachment), data);
  }
  worklogConfirmAttachment(data: RpcRequest<typeof worklogConfirmAttachment>) {
    return this.sendOnce(pattern(worklogConfirmAttachment), data);
  }
  worklogDeleteAttachment(data: RpcRequest<typeof worklogDeleteAttachment>) {
    return this.sendOnce(pattern(worklogDeleteAttachment), data);
  }

  /**
   * Get time entries for a location (admin view)
   */
  async getLocationEntries(data: RpcRequest<typeof getLocationEntries>) {
    return this.send(pattern(getLocationEntries), data);
  }

  async getLocationEntriesBatch(data: RpcRequest<typeof getLocationEntriesBatch>) {
    return this.send(pattern(getLocationEntriesBatch), data);
  }

  /**
   * Get all time entries for an organization (admin view)
   */
  async getAllEntries(data: RpcRequest<typeof getAllEntries>) {
    return this.send(pattern(getAllEntries), data);
  }

  async getActiveEntries(data: RpcRequest<typeof getActiveEntries>) {
    return this.send(pattern(getActiveEntries), data);
  }

  async listNoShows(data: RpcRequest<typeof listNoShows>) {
    return this.send(pattern(listNoShows), data);
  }

  async resolveNoShow(data: RpcRequest<typeof resolveNoShow>) {
    return this.send(pattern(resolveNoShow), data);
  }

  async noShowSummary(data: RpcRequest<typeof noShowSummary>) {
    return this.send(pattern(noShowSummary), data);
  }

  // ── The automatic clock (attendance/auto-clock.ts) — the caller's own, always ──
  // Writes through `sendOnce`: a retried consent is harmless, a retried undo is not worth the doubt.
  autoClockPlan(data: RpcRequest<typeof autoClockPlan>) {
    return this.send(pattern(autoClockPlan), data);
  }
  autoClockConsent(data: RpcRequest<typeof autoClockConsent>) {
    return this.sendOnce(pattern(autoClockConsent), data);
  }
  autoClockUndo(data: RpcRequest<typeof autoClockUndo>) {
    return this.sendOnce(pattern(autoClockUndo), data);
  }
  autoClockSkipRest(data: RpcRequest<typeof autoClockSkipRest>) {
    return this.sendOnce(pattern(autoClockSkipRest), data);
  }
}
