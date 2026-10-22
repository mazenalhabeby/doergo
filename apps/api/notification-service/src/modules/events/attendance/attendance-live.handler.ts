import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import {
  eventPattern,
  type EventPayload,
  attendanceChangedEvent,
  attendanceClockInEvent,
  attendanceClockOutEvent,
  breakEndedEvent,
  breakStartedEvent,
  documentTypesChangedEvent,
  presenceChangedEvent,
  spaceChangedEvent,
  spaceRosterChangedEvent,
} from '@hbcfield/shared/microservices';
import { WebsocketGateway } from '../../websocket/websocket.gateway';

/** Live updates for open screens: presence, workspaces, rosters, clock-ins, rests. */
@Controller()
export class AttendanceLiveHandler {
  private readonly logger = new Logger('AttendanceLiveHandler');

  constructor(private readonly websocketGateway: WebsocketGateway) {}

  // Availability status (Available/Busy/Away) changed — broadcast so teammates'
  // dashboards / contact lists update in real time.
  @EventPattern(eventPattern(presenceChangedEvent))
  handlePresenceChanged(@Payload() data: EventPayload<typeof presenceChangedEvent>) {
    // ⚠️ The contract allows a null organization (what the gateway sends); passed on as before.
    this.websocketGateway.emitPresenceChanged(data.userId, data.presence, data.organizationId as string);
  }

  /**
   * Space and roster changes. These carry no notification of their own — they
   * exist so open dashboards and space lists re-read instead of showing stale
   * data until someone hits refresh, which was the last case in the app that
   * still required one.
   */
  @EventPattern(eventPattern(spaceChangedEvent))
  async handleSpaceChanged(@Payload() data: EventPayload<typeof spaceChangedEvent>) {
    this.websocketGateway.emitSpaceChanged(data.organizationId, data.spaceId ?? null);
  }

  @EventPattern(eventPattern(documentTypesChangedEvent))
  async handleDocumentTypesChanged(@Payload() data: EventPayload<typeof documentTypesChangedEvent>) {
    this.websocketGateway.emitDocumentTypesChanged(data.organizationId, data.typeId ?? null);
  }

  @EventPattern(eventPattern(spaceRosterChangedEvent))
  async handleSpaceRosterChanged(@Payload() data: EventPayload<typeof spaceRosterChangedEvent>) {
    this.websocketGateway.emitSpaceRosterChanged(data.organizationId, data.spaceId ?? null);
  }

  @EventPattern(eventPattern(attendanceClockInEvent))
  async handleClockIn(@Payload() data: EventPayload<typeof attendanceClockInEvent>) {
    this.logger.log(`Clock-in: user=${data.userId}`);
    this.websocketGateway.emitClockIn(data.userId, data.organizationId, data.timeEntry);
  }

  @EventPattern(eventPattern(attendanceClockOutEvent))
  async handleClockOut(@Payload() data: EventPayload<typeof attendanceClockOutEvent>) {
    this.logger.log(`Clock-out: user=${data.userId}`);
    this.websocketGateway.emitClockOut(data.userId, data.organizationId, data.timeEntry);
  }

  // Admin-side attendance mutation (edit/approve/reject/delete/manual-add) →
  // broadcast so every open attendance view refreshes live, no page reload.
  @EventPattern(eventPattern(attendanceChangedEvent))
  handleAttendanceChanged(@Payload() data: EventPayload<typeof attendanceChangedEvent>) {
    this.websocketGateway.emitToOrganization(data.organizationId, 'attendance.changed', {
      action: data.action,
      entryId: data.entryId ?? null,
      timestamp: new Date().toISOString(),
    });
  }

  @EventPattern(eventPattern(breakStartedEvent))
  async handleBreakStarted(@Payload() data: EventPayload<typeof breakStartedEvent>) {
    this.logger.log(`Break started: user=${data.userName}, type=${data.breakType}`);
    this.websocketGateway.emitBreakStarted(data.userId, data.organizationId, {
      breakId: data.breakId,
      userId: data.userId,
      userName: data.userName,
      type: data.breakType,
      startedAt: data.startedAt,
    });
  }

  @EventPattern(eventPattern(breakEndedEvent))
  async handleBreakEnded(@Payload() data: EventPayload<typeof breakEndedEvent>) {
    this.logger.log(`Break ended: user=${data.userName}, duration=${data.durationMinutes}min`);
    this.websocketGateway.emitBreakEnded(data.userId, data.organizationId, {
      breakId: data.breakId,
      userId: data.userId,
      userName: data.userName,
      type: data.breakType,
      startedAt: data.startedAt,
      endedAt: data.endedAt,
      durationMinutes: data.durationMinutes,
    });
  }
}
