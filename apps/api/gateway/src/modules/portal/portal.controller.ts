import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Request,
  Inject,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { Throttle } from '@nestjs/throttler';
import { firstValueFrom } from 'rxjs';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import {
  AllowCustomer,
  SkipOnboardingCheck,
  TASK_SOURCE,
  requestTitle,
  priorityForCategory,
} from '@hbcfield/shared';
import { CustomerScopeGuard } from '../../common/guards/customer-scope.guard';
import { TasksQueueService } from '../tasks/tasks.queue.service';
import { SubmitRequestDto } from './dto';

/**
 * Customer Portal API (external CUSTOMER persona only).
 *
 * CustomerScopeGuard asserts the caller is a portal customer bound to a Customer.
 * Every handler scopes to `req.user.customerId` / `req.user.organizationId` read
 * from the verified token — the client can never widen scope via the body.
 */
@ApiTags('portal')
@ApiBearerAuth()
@AllowCustomer()
@UseGuards(CustomerScopeGuard)
@Controller('portal')
export class PortalController {
  constructor(
    @Inject('AUTH_SERVICE') private readonly authClient: ClientProxy,
    @Inject('TASK_SERVICE') private readonly taskClient: ClientProxy,
    private readonly tasksQueue: TasksQueueService,
  ) {}

  /** Intake config (branding + features + category tree) for the caller's OWN portal. */
  @Get('config')
  @SkipOnboardingCheck()
  @ApiOperation({ summary: 'Get the portal intake config' })
  async config(@Request() req: any) {
    return firstValueFrom(
      this.authClient.send({ cmd: 'portal_config_for_customer' }, { customerId: req.user.customerId }),
    );
  }

  /** Units the caller (a customer) is bound to. */
  @Get('units')
  @SkipOnboardingCheck()
  @ApiOperation({ summary: "List the customer's units" })
  async units(@Request() req: any) {
    // Units live in the auth DB; auth-service serves them.
    return firstValueFrom(
      this.authClient.send(
        { cmd: 'portal_list_units' },
        { organizationId: req.user.organizationId, customerId: req.user.customerId },
      ),
    );
  }

  /** The customer's own requests. */
  @Get('requests')
  @SkipOnboardingCheck()
  @ApiOperation({ summary: "List the customer's requests" })
  async listRequests(@Request() req: any) {
    return firstValueFrom(
      this.taskClient.send(
        { cmd: 'portal_list_requests' },
        { organizationId: req.user.organizationId, customerId: req.user.customerId },
      ),
    );
  }

  /** One of the customer's own requests (404 if not theirs). */
  @Get('requests/:id')
  @SkipOnboardingCheck()
  @ApiOperation({ summary: 'Get one of the customer’s requests' })
  async getRequest(@Param('id') id: string, @Request() req: any) {
    return firstValueFrom(
      this.taskClient.send(
        { cmd: 'portal_get_request' },
        { id, organizationId: req.user.organizationId, customerId: req.user.customerId },
      ),
    );
  }

  /** Submit a new request → creates a Task via the pipeline (source=CUSTOMER_PORTAL). */
  @Post('requests')
  @SkipOnboardingCheck()
  @Throttle({ default: { limit: 20, ttl: 60000 } }) // anti-flood: 20 requests/min
  @ApiOperation({ summary: 'Submit a new request' })
  async submitRequest(@Body() dto: SubmitRequestDto, @Request() req: any) {
    // Resolve the category from the caller's own portal config (fail closed).
    const config: any = await firstValueFrom(
      this.authClient.send({ cmd: 'portal_config_for_customer' }, { customerId: req.user.customerId }),
    );
    const category = (config?.categories || []).find((c: any) => c.key === dto.categoryKey && c.isActive);
    if (!category) {
      throw new BadRequestException('Unknown or inactive category');
    }

    // Unit ownership is validated inside task-service create (same tx, no extra
    // hop, no TOCTOU): an unowned/unknown unitId is dropped there. We only pass
    // the requested unit, falling back to the caller's bound default unit.
    const unitId: string | undefined = dto.unitId || req.user.unitId || undefined;

    // Access permission / preferred time / contact preference are captured into the
    // description so staff see them without a bespoke schema (kept simple for v1).
    const extras: string[] = [];
    if (dto.accessPermitted !== undefined) extras.push(`Access: ${dto.accessPermitted ? 'permitted' : 'not permitted'}`);
    if (dto.preferredTime) extras.push(`Preferred: ${dto.preferredTime.toLowerCase()}`);
    if (dto.contactPreference) extras.push(`Contact via: ${dto.contactPreference.toLowerCase()}`);
    const description = [dto.description?.trim(), extras.length ? extras.join(' · ') : null]
      .filter(Boolean)
      .join('\n\n') || undefined;

    const created: any = await this.tasksQueue.createTask({
      title: requestTitle(category.label, dto.issue),
      description,
      priority: priorityForCategory(category),
      spaceId: category.spaceId || undefined, // else task-service uses the default space
      source: TASK_SOURCE.CUSTOMER_PORTAL,
      customerId: req.user.customerId, // from the verified token, never the body
      unitId, // validated to belong to this customer above
      organizationId: req.user.organizationId,
      userId: req.user.id,
    });

    return created;
  }
}
