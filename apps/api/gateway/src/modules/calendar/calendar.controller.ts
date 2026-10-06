import { Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role, CurrentUser, CurrentUserData, isAdmin, resolveCrmCaps, spacesGranting } from '@hbcfield/shared';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { DenyExternal, RequirePermission, Roles } from '../../common/decorators';
import { CalendarGatewayService } from './calendar.service';
import {
  AvailabilityDto, CreateEventDto, EventDto, FreeSlotsDto, HolidayDto, HolidaysQueryDto, ItemsQueryDto,
  DoneDto, OrgCalendarSettingsDto, PeopleQueryDto, PlaceSettingsDto, RespondDto, SnoozeDto, TeamQueryDto,
} from './calendar.dto';

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
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.EMPLOYEE)
@DenyExternal()
export class CalendarController {
  constructor(private readonly svc: CalendarGatewayService) {}

  private caller(u: CurrentUserData) {
    const admin = isAdmin(u as any);
    return {
      userId: u.id,
      organizationId: u.organizationId as string,
      role: String(u.role),
      canManageUsers: !!u.canManageUsers,
      orgWideView: admin || spacesGranting(u.access as any, 'canViewAllTasks') === null,
      // A client on an event is shown (and may be set) only for somebody who reads the client book.
      crm: resolveCrmCaps(String(u.role), (u.access as any)?.org).canAccess,
      // Whose leave the caller may be told about — availability hides the reason from everyone else.
      teamSpaces: this.teamSpaces(u),
    };
  }

  /** Where the caller sees the team's leave: the cover chart's gate (leads attendance or the rota). */
  private teamSpaces(u: CurrentUserData): string[] | undefined {
    if (isAdmin(u as any)) return undefined;
    const a = spacesGranting(u.access as any, 'canViewSpaceAttendance');
    const b = spacesGranting(u.access as any, 'canManageRota');
    if (a === null || b === null) return undefined;
    return [...new Set([...a, ...b])];
  }

  private viewTaskSpaces(u: CurrentUserData): string[] | undefined {
    if (isAdmin(u as any)) return undefined;
    return spacesGranting(u.access as any, 'canViewAllTasks') ?? undefined;
  }

  // ─── reading ─────────────────────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'Every calendar item the caller may see, for a window (≤ 62 days)' })
  items(@Query() q: ItemsQueryDto, @CurrentUser() u: CurrentUserData) {
    return this.svc.read('calendar_items', {
      ...this.caller(u), from: q.from, to: q.to, spaceId: q.spaceId ?? null, lang: q.lang,
      layers: q.layers ? q.layers.split(',').filter(Boolean) : undefined,
      viewTaskSpaces: this.viewTaskSpaces(u), teamSpaces: this.teamSpaces(u),
    });
  }

  @Get('team')
  @ApiOperation({ summary: 'A workspace\'s days (weekend, holidays) for the team view' })
  team(@Query() q: TeamQueryDto, @CurrentUser() u: CurrentUserData) {
    return this.svc.read('calendar_team', { ...this.caller(u), spaceId: q.spaceId, from: q.from, to: q.to, teamSpaces: this.teamSpaces(u) });
  }

  @Get('people')
  @ApiOperation({ summary: 'Colleagues the caller may invite' })
  people(@Query() q: PeopleQueryDto, @CurrentUser() u: CurrentUserData) {
    return this.svc.read('calendar_people', { ...this.caller(u), q: q.q });
  }

  @Post('availability')
  @ApiOperation({ summary: 'Free/busy (times only) and days off for colleagues around a time' })
  availability(@Body() b: AvailabilityDto, @CurrentUser() u: CurrentUserData) {
    return this.svc.read('calendar_availability', { ...this.caller(u), userIds: b.userIds, from: b.from, to: b.to });
  }

  @Post('free-slots')
  @ApiOperation({ summary: 'The next times everybody is free' })
  freeSlots(@Body() b: FreeSlotsDto, @CurrentUser() u: CurrentUserData) {
    return this.svc.read('calendar_free_slots', { ...this.caller(u), ...b });
  }

  @Get('holidays')
  @ApiOperation({ summary: 'One year of holidays for the organization or a workspace' })
  holidays(@Query() q: HolidaysQueryDto, @CurrentUser() u: CurrentUserData) {
    return this.svc.read('calendar_holidays', { organizationId: u.organizationId, spaceId: q.spaceId ?? null, year: q.year, lang: q.lang });
  }

  @Get('countries')
  countries(@Query('lang') lang?: string) {
    return this.svc.read('calendar_countries', { lang: ['en', 'de', 'es', 'fr', 'it'].includes(lang ?? '') ? lang : 'en' });
  }

  @Get('countries/:code/regions')
  regions(@Param('code') code: string, @Query('lang') lang?: string) {
    if (!/^[A-Za-z]{2}$/.test(code)) throw new ForbiddenException('Unknown country');
    return this.svc.read('calendar_regions', { country: code.toUpperCase(), lang: ['en', 'de', 'es', 'fr', 'it'].includes(lang ?? '') ? lang : 'en' });
  }

  // ─── events ─────────────────────────────────────────────────────────────

  @Post('events')
  @ApiOperation({ summary: 'Create an appointment or reminder, inviting colleagues' })
  create(@Body() b: CreateEventDto, @CurrentUser() u: CurrentUserData) {
    const { id: clientId, ...input } = b;
    return this.svc.write('calendar_event_create', { ...this.caller(u), input, clientId });
  }

  @Get('events/:id')
  get(@Param('id') eventId: string, @CurrentUser() u: CurrentUserData) {
    return this.svc.read('calendar_event_get', { ...this.caller(u), eventId: id(eventId) });
  }

  @Patch('events/:id')
  update(@Param('id') eventId: string, @Body() b: EventDto, @CurrentUser() u: CurrentUserData) {
    return this.svc.write('calendar_event_update', { ...this.caller(u), eventId: id(eventId), input: b });
  }

  @Delete('events/:id')
  cancel(@Param('id') eventId: string, @CurrentUser() u: CurrentUserData) {
    return this.svc.write('calendar_event_cancel', { ...this.caller(u), eventId: id(eventId) });
  }

  @Post('events/:id/respond')
  respond(@Param('id') eventId: string, @Body() b: RespondDto, @CurrentUser() u: CurrentUserData) {
    return this.svc.write('calendar_event_respond', { ...this.caller(u), eventId: id(eventId), response: b.response });
  }

  @Post('events/:id/snooze')
  snooze(@Param('id') eventId: string, @Body() b: SnoozeDto, @CurrentUser() u: CurrentUserData) {
    return this.svc.write('calendar_event_snooze', { ...this.caller(u), eventId: id(eventId), minutes: b.minutes, occurrence: b.occurrence });
  }

  @Post('events/:id/done')
  done(@Param('id') eventId: string, @Body() b: DoneDto, @CurrentUser() u: CurrentUserData) {
    return this.svc.write('calendar_event_done', { ...this.caller(u), eventId: id(eventId), occurrence: b.occurrence });
  }

  // ─── the optional Google / Outlook link ─────────────────────────────────

  @Get('feed')
  feedStatus(@CurrentUser() u: CurrentUserData) {
    return this.svc.read('calendar_feed_status', { userId: u.id, organizationId: u.organizationId });
  }

  @Post('feed')
  @ApiOperation({ summary: 'Make a new private link (the old one stops working). Shown once.' })
  async feedRotate(@CurrentUser() u: CurrentUserData) {
    const r: any = await this.svc.write('calendar_feed_rotate', { userId: u.id, organizationId: u.organizationId });
    const token = r?.data?.token;
    return { success: true, data: { path: `/api/v1/calendar-feed/${token}.ics` } };
  }

  @Delete('feed')
  feedRevoke(@CurrentUser() u: CurrentUserData) {
    return this.svc.write('calendar_feed_revoke', { userId: u.id });
  }

  // ─── settings: holidays & weekends ──────────────────────────────────────

  @Get('settings')
  @RequirePermission('canManageWorkspaces')
  settings(@Query() q: HolidaysQueryDto, @CurrentUser() u: CurrentUserData) {
    return this.svc.read('calendar_settings', { organizationId: u.organizationId, year: q.year, lang: q.lang });
  }

  @Patch('settings')
  @RequirePermission('canManageWorkspaces')
  updateOrg(@Body() b: OrgCalendarSettingsDto, @CurrentUser() u: CurrentUserData) {
    return this.svc.write('calendar_update_org', { organizationId: u.organizationId, ...b });
  }

  @Patch('settings/workspaces/:spaceId')
  @RequirePermission('canManageWorkspaces')
  updateSpace(@Param('spaceId') spaceId: string, @Body() b: PlaceSettingsDto, @CurrentUser() u: CurrentUserData) {
    return this.svc.write('calendar_update_space', { organizationId: u.organizationId, spaceId: id(spaceId), ...b });
  }

  @Post('holidays')
  @RequirePermission('canManageWorkspaces')
  saveHoliday(@Body() b: HolidayDto, @CurrentUser() u: CurrentUserData) {
    return this.svc.write('calendar_holiday_save', { organizationId: u.organizationId, userId: u.id, ...b });
  }

  @Patch('holidays/:id')
  @RequirePermission('canManageWorkspaces')
  editHoliday(@Param('id') hid: string, @Body() b: HolidayDto, @CurrentUser() u: CurrentUserData) {
    return this.svc.write('calendar_holiday_save', { organizationId: u.organizationId, userId: u.id, ...b, id: id(hid) });
  }

  @Delete('holidays/:id')
  @RequirePermission('canManageWorkspaces')
  removeHoliday(@Param('id') hid: string, @CurrentUser() u: CurrentUserData) {
    return this.svc.write('calendar_holiday_remove', { organizationId: u.organizationId, id: id(hid) });
  }
}
