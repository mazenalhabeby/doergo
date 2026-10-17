import {
  Controller,
  Get,
  Query,
  Inject,
  HttpException,
  HttpStatus,
  ForbiddenException,
  UseInterceptors,
} from '@nestjs/common';
import { RebillService } from '../../common/billing/rebill.service';
import { LabourCostInterceptor } from '../../common/interceptors/labour-cost.interceptor';
import { ClientProxy } from '@nestjs/microservices';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { firstValueFrom } from 'rxjs';
import { OrgEventsService } from '../../common/events/org-events.service';
import { Role, CurrentUser, CurrentUserData, addOnDef } from '@hbcfield/shared';
import { isFeatureEntitled } from '../../common/entitlements';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthTokenCache } from '../../common/cache/auth-token-cache.service';
import { ChatReachLookup } from '../chat/chat-reach.lookup';
import { sendRpc, auditLogList } from '@hbcfield/shared/microservices';
import { callerOrgId } from '../../common/caller-org';

/** /organizations/audit-logs — who did what, when. */
@ApiTags('organizations')
@UseInterceptors(LabourCostInterceptor)
@Controller('organizations')
@ApiBearerAuth()
export class AuditLogController {
  constructor(
    @Inject('AUTH_SERVICE') private readonly authClient: ClientProxy,
    private readonly billing: RebillService,
    @Inject('NOTIFICATION_SERVICE') private readonly notificationClient: ClientProxy,
    private readonly orgEvents: OrgEventsService,
    private readonly authCache: AuthTokenCache,
    private readonly chatReach: ChatReachLookup,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════
  // AUDIT LOGS
  // ═══════════════════════════════════════════════════════════════════════

  @Get('audit-logs')
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  @ApiOperation({ summary: 'Get audit logs — org-wide (ADMIN) or per-entity (managers with canViewAllTasks)' })
  async getAuditLogs(
    @Query()
    query: {
      eventType?: string;
      userId?: string;
      resourceType?: string;
      resourceId?: string;
      startDate?: string;
      endDate?: string;
      page?: string;
      limit?: string;
    },
    @CurrentUser() user: CurrentUserData,
  ) {
    const isAdmin = user.role === Role.ADMIN;

    // Access model:
    // - ADMIN may query anything (org-wide log + per-entity trails).
    // - Non-admins may read ONLY per-entity trails (resourceId required) AND
    //   only when they have the canViewAllTasks permission.
    // The service is always org-scoped via the token's organizationId.
    if (!isAdmin) {
      if (!user.canViewAllTasks) {
        throw new ForbiddenException('You do not have permission to view audit logs.');
      }
      if (!query.resourceId) {
        throw new ForbiddenException('Per-entity access requires a resourceId.');
      }
    }

    // audit_log is a Business capability. This is a READ (guards pass reads by
    // design), so gate the premium data here explicitly.
    if (!isFeatureEntitled(user as any, 'audit_log')) {
      throw new HttpException(
        {
          statusCode: HttpStatus.PAYMENT_REQUIRED,
          message: 'The "audit_log" feature is not available on your plan.',
          error: 'PlanUpgradeRequired',
          feature: 'audit_log',
          monthlyCents: addOnDef('audit_log')?.monthlyCents ?? 0,
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
    return firstValueFrom(
      sendRpc(this.authClient, auditLogList, {
        organizationId: callerOrgId(user),
        // Who is reading: a document's trail follows the document's own visibility.
        viewerId: user.id,
        eventType: query.eventType,
        userId: query.userId,
        resourceType: query.resourceType,
        resourceId: query.resourceId,
        startDate: query.startDate,
        endDate: query.endDate,
        page: query.page ? Number(query.page) : undefined,
        limit: query.limit ? Number(query.limit) : undefined,
      }),
    );
  }
}
