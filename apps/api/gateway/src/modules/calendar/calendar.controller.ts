import { Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { scopeFor, scopeIdsFor } from '../../common/permission-scope';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role, CurrentUser, crmReachOf, crmCanAccess, moduleAnywhere } from '@hbcfield/shared';
import { DenyExternal, RequirePermission, Roles } from '../../common/decorators';
import { CalendarGatewayService } from './calendar.service';
import { callerOrgId } from '../../common/caller-org';
import {
  calendarItems,
  calendarTeam,
  calendarPeople,
  calendarAvailability,
  calendarFreeSlots,
  calendarHolidays,
  calendarCountries,
  calendarRegions,
  calendarEventCreate,
  calendarEventGet,
  calendarEventUpdate,
  calendarEventCancel,
  calendarEventRespond,
  calendarEventSnooze,
  calendarEventDone,
  calendarFeedStatus,
  calendarFeedRotate,
  calendarFeedRevoke,
  calendarSettings,
  calendarUpdateOrg,
  calendarUpdateSpace,
  calendarHolidaySave,
  calendarHolidayRemove,
} from '@hbcfield/shared/microservices';
import {
  AvailabilityDto,
  CreateEventDto,
  EventDto,
  FreeSlotsDto,
  HolidayDto,
  HolidaysQueryDto,
  ItemsQueryDto,
  DoneDto,
  OrgCalendarSettingsDto,
  PeopleQueryDto,
  PlaceSettingsDto,
  RespondDto,
  SnoozeDto,
  TeamQueryDto,
} from './calendar.dto';
import type { SessionUser } from '../../common/request.types';

const ID = /^[A-Za-z0-9_-]{1,64}$/;
function id(v: string): string {
  if (!ID.test(v ?? '')) throw new ForbiddenException('Not found');
  return v;
}

/**
 * The company calendar. Everything is the CALLER's: identity and scopes come from the token, never
 * from the body. External members hold no calendar (no clock, no leave) — closed to them entirely.
 *
 * Scopes travel as: undefined = organization-wide, [ids] = only these workspaces, [] = nowhere.
 */
@ApiTags('calendar')
@ApiBearerAuth()
@Controller('calendar')
@Roles(Role.ADMIN, Role.EMPLOYEE)
@DenyExternal()
export class CalendarController {
  constructor(private readonly svc: CalendarGatewayService) {}

  private caller(u: SessionUser) {
    return {
      userId: u.id,
      organizationId: callerOrgId(u),
      role: String(u.role),
      canManageUsers: !!u.canManageUsers,
      orgWideView: scopeFor(u, 'canViewAllTasks') === null,
      // A client on an event is shown (and may be set) only for somebody who reads the client book —
      // org-wide or in a workspace (crm/crm-reach.ts). A coarse gate: task-service then asks the
      // reach from the database for the client's own workspace, module included.
      crm: crmCanAccess(crmReachOf(String(u.role), u.access, { crmSpaces: () => moduleAnywhere(u, 'crm') })),
      // Whose leave the caller may be told about — availability hides the reason from everyone else.
      teamSpaces: this.teamSpaces(u),
    };
  }

  /** Where the caller sees the team's leave: the cover chart's gate (leads attendance or the rota). */
  private teamSpaces(u: SessionUser): string[] | undefined {
    const a = scopeFor(u, 'canViewSpaceAttendance');
    const b = scopeFor(u, 'canManageRota');
    if (a === null || b === null) return undefined;
    return [...new Set([...a, ...b])];
  }

  private viewTaskSpaces(u: SessionUser): string[] | undefined {
    return scopeIdsFor(u, 'canViewAllTasks');
  }

  // ─── reading ─────────────────────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'Every calendar item the caller may see, for a window (≤ 62 days)' })
  items(@Query() q: ItemsQueryDto, @CurrentUser() u: SessionUser) {
    return this.svc.read(calendarItems, {
      ...this.caller(u),
      from: q.from,
      to: q.to,
      spaceId: q.spaceId ?? null,
      lang: q.lang,
      layers: q.layers ? q.layers.split(',').filter(Boolean) : undefined,
      viewTaskSpaces: this.viewTaskSpaces(u),
      teamSpaces: this.teamSpaces(u),
    });
  }

  @Get('team')
  @ApiOperation({ summary: "A workspace's days (weekend, holidays) for the team view" })
  team(@Query() q: TeamQueryDto, @CurrentUser() u: SessionUser) {
    return this.svc.read(calendarTeam, {
      ...this.caller(u),
      spaceId: q.spaceId,
      from: q.from,
      to: q.to,
      teamSpaces: this.teamSpaces(u),
    });
  }

  @Get('people')
  @ApiOperation({ summary: 'Colleagues the caller may invite' })
  people(@Query() q: PeopleQueryDto, @CurrentUser() u: SessionUser) {
    return this.svc.read(calendarPeople, { ...this.caller(u), q: q.q });
  }

  @Post('availability')
  @ApiOperation({ summary: 'Free/busy (times only) and days off for colleagues around a time' })
  availability(@Body() b: AvailabilityDto, @CurrentUser() u: SessionUser) {
    return this.svc.read(calendarAvailability, { ...this.caller(u), userIds: b.userIds, from: b.from, to: b.to });
  }

  @Post('free-slots')
  @ApiOperation({ summary: 'The next times everybody is free' })
  freeSlots(@Body() b: FreeSlotsDto, @CurrentUser() u: SessionUser) {
    return this.svc.read(calendarFreeSlots, { ...this.caller(u), ...b });
  }

  @Get('holidays')
  @ApiOperation({ summary: 'One year of holidays for the organization or a workspace' })
  holidays(@Query() q: HolidaysQueryDto, @CurrentUser() u: SessionUser) {
    return this.svc.read(calendarHolidays, {
      organizationId: callerOrgId(u),
      spaceId: q.spaceId ?? null,
      year: q.year,
      lang: q.lang,
    });
  }

  @Get('countries')
  countries(@Query('lang') lang?: string) {
    return this.svc.read(calendarCountries, {
      lang: ['en', 'de', 'es', 'fr', 'it'].includes(lang ?? '') ? lang : 'en',
    });
  }

  @Get('countries/:code/regions')
  regions(@Param('code') code: string, @Query('lang') lang?: string) {
    if (!/^[A-Za-z]{2}$/.test(code)) throw new ForbiddenException('Unknown country');
    return this.svc.read(calendarRegions, {
      country: code.toUpperCase(),
      lang: ['en', 'de', 'es', 'fr', 'it'].includes(lang ?? '') ? lang : 'en',
    });
  }

  // ─── events ─────────────────────────────────────────────────────────────

  @Post('events')
  @ApiOperation({ summary: 'Create an appointment or reminder, inviting colleagues' })
  create(@Body() b: CreateEventDto, @CurrentUser() u: SessionUser) {
    const { id: clientId, ...input } = b;
    return this.svc.write(calendarEventCreate, { ...this.caller(u), input, clientId });
  }

  @Get('events/:id')
  get(@Param('id') eventId: string, @CurrentUser() u: SessionUser) {
    return this.svc.read(calendarEventGet, { ...this.caller(u), eventId: id(eventId) });
  }

  @Patch('events/:id')
  update(@Param('id') eventId: string, @Body() b: EventDto, @CurrentUser() u: SessionUser) {
    return this.svc.write(calendarEventUpdate, { ...this.caller(u), eventId: id(eventId), input: b });
  }

  @Delete('events/:id')
  cancel(@Param('id') eventId: string, @CurrentUser() u: SessionUser) {
    return this.svc.write(calendarEventCancel, { ...this.caller(u), eventId: id(eventId) });
  }

  @Post('events/:id/respond')
  respond(@Param('id') eventId: string, @Body() b: RespondDto, @CurrentUser() u: SessionUser) {
    return this.svc.write(calendarEventRespond, { ...this.caller(u), eventId: id(eventId), response: b.response });
  }

  @Post('events/:id/snooze')
  snooze(@Param('id') eventId: string, @Body() b: SnoozeDto, @CurrentUser() u: SessionUser) {
    return this.svc.write(calendarEventSnooze, {
      ...this.caller(u),
      eventId: id(eventId),
      minutes: b.minutes,
      occurrence: b.occurrence,
    });
  }

  @Post('events/:id/done')
  done(@Param('id') eventId: string, @Body() b: DoneDto, @CurrentUser() u: SessionUser) {
    return this.svc.write(calendarEventDone, { ...this.caller(u), eventId: id(eventId), occurrence: b.occurrence });
  }

  // ─── the optional Google / Outlook link ─────────────────────────────────

  @Get('feed')
  feedStatus(@CurrentUser() u: SessionUser) {
    return this.svc.read(calendarFeedStatus, { userId: u.id, organizationId: callerOrgId(u) });
  }

  @Post('feed')
  @ApiOperation({ summary: 'Make a new private link (the old one stops working). Shown once.' })
  async feedRotate(@CurrentUser() u: SessionUser) {
    const r: any = await this.svc.write(calendarFeedRotate, { userId: u.id, organizationId: callerOrgId(u) });
    const token = r?.data?.token;
    return { success: true, data: { path: `/api/v1/calendar-feed/${token}.ics` } };
  }

  @Delete('feed')
  feedRevoke(@CurrentUser() u: SessionUser) {
    return this.svc.write(calendarFeedRevoke, { userId: u.id });
  }

  // ─── settings: holidays & weekends ──────────────────────────────────────

  @Get('settings')
  @RequirePermission('canManageWorkspaces')
  settings(@Query() q: HolidaysQueryDto, @CurrentUser() u: SessionUser) {
    return this.svc.read(calendarSettings, { organizationId: callerOrgId(u), year: q.year, lang: q.lang });
  }

  @Patch('settings')
  @RequirePermission('canManageWorkspaces')
  updateOrg(@Body() b: OrgCalendarSettingsDto, @CurrentUser() u: SessionUser) {
    return this.svc.write(calendarUpdateOrg, { organizationId: callerOrgId(u), ...b });
  }

  @Patch('settings/workspaces/:spaceId')
  @RequirePermission('canManageWorkspaces')
  updateSpace(@Param('spaceId') spaceId: string, @Body() b: PlaceSettingsDto, @CurrentUser() u: SessionUser) {
    return this.svc.write(calendarUpdateSpace, { organizationId: callerOrgId(u), spaceId: id(spaceId), ...b });
  }

  @Post('holidays')
  @RequirePermission('canManageWorkspaces')
  saveHoliday(@Body() b: HolidayDto, @CurrentUser() u: SessionUser) {
    return this.svc.write(calendarHolidaySave, { organizationId: callerOrgId(u), userId: u.id, ...b });
  }

  @Patch('holidays/:id')
  @RequirePermission('canManageWorkspaces')
  editHoliday(@Param('id') hid: string, @Body() b: HolidayDto, @CurrentUser() u: SessionUser) {
    return this.svc.write(calendarHolidaySave, {
      organizationId: callerOrgId(u),
      userId: u.id,
      ...b,
      id: id(hid),
    });
  }

  @Delete('holidays/:id')
  @RequirePermission('canManageWorkspaces')
  removeHoliday(@Param('id') hid: string, @CurrentUser() u: SessionUser) {
    return this.svc.write(calendarHolidayRemove, { organizationId: callerOrgId(u), id: id(hid) });
  }
}
