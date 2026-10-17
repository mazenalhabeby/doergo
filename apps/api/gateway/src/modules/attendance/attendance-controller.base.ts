import { Inject, Injectable } from '@nestjs/common';
import { type AccessPermissionKey } from '@hbcfield/shared';
import { AttendanceService } from './attendance.service';
import { AttendanceReportsGatewayService } from './attendance-reports.gateway-service';
import { BreaksGatewayService } from './breaks.gateway-service';
import { EntryDecisionsGatewayService } from './entry-decisions.gateway-service';
import { ExtraTimeGatewayService } from './extra-time.gateway-service';
import { AttendanceQueueService } from './attendance.queue.service';
import { scopeFor } from '../../common/permission-scope';

import type { AuthedRequest } from '../../common/request.types';
/**
 * What every /attendance controller shares: the services, and which spaces
 * this caller may see attendance for.
 */
@Injectable()
export abstract class AttendanceControllerBase {
  @Inject(AttendanceReportsGatewayService) protected readonly attendanceReports!: AttendanceReportsGatewayService;
  @Inject(BreaksGatewayService) protected readonly breaksGateway!: BreaksGatewayService;
  @Inject(EntryDecisionsGatewayService) protected readonly entryDecisions!: EntryDecisionsGatewayService;
  @Inject(ExtraTimeGatewayService) protected readonly extraTimeGateway!: ExtraTimeGatewayService;

  constructor(
    protected readonly attendanceService: AttendanceService,
    protected readonly attendanceQueueService: AttendanceQueueService,
  ) {}

  /**
   * Which spaces this caller may see attendance for — the list every query
   * narrows to.
   *
   * The guard above only ever WIDENS: none of these routes names a space (they
   * are keyed on entry ids, approval ids, or nothing), so a space-scoped grant
   * satisfies `accessAllowsAnywhere` and would otherwise read every site in the
   * organization. The narrowing has to happen where the query is built, and
   * this is what carries it there.
   *
   * `null` means org-wide — do not narrow. An empty array means granted in no
   * space and must return NOTHING. They are deliberately different values,
   * because collapsing them into one falsy check is precisely how this becomes
   * a data leak.
   */
  protected scope(req: AuthedRequest, key: AccessPermissionKey): string[] | null {
    return scopeFor(req.user, key);
  }
}
