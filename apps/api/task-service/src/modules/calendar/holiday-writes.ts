import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { PrismaService, parseWeekendDays } from '@hbcfield/shared';
import { emitEvent, calendarSettingsChangedEvent } from '@hbcfield/shared/microservices';
import { countryList, validCountry, validRegion } from './holiday-library';
import { Scope } from './holidays-helpers';

/** What every holiday/weekend write shares: the workspace scope, the workspace, the settings as sent, the refresh. */

/** Every screen of the organization refreshes: a moved Eid changes leave counts and shading everywhere at once. */
export function announceCalendarChange(notifications: ClientProxy, organizationId: string) {
  emitEvent(notifications, calendarSettingsChangedEvent, { organizationId });
}

export function assertSpaceScope(spaceId: string, scope: Scope) {
  if (scope !== undefined && !scope.includes(spaceId)) {
    throw new ForbiddenException('You do not manage that workspace');
  }
}

export async function findWorkspace(prisma: PrismaService, organizationId: string, spaceId: string) {
  const s = await prisma.companyLocation.findFirst({
    where: { id: spaceId, organizationId },
    select: {
      id: true,
      holidayCountry: true,
      holidayRegion: true,
      detectedHolidayCountry: true,
      detectedHolidayRegion: true,
    },
  });
  if (!s) throw new NotFoundException('Workspace not found');
  return s;
}

export function readPlaceSettings(
  input: { weekendDays?: unknown; holidayCountry?: unknown; holidayRegion?: unknown },
  allowInherit: boolean,
) {
  const data: { weekendDays?: number[]; holidayCountry?: string | null; holidayRegion?: string | null } = {};
  if (input.weekendDays !== undefined) {
    const w = parseWeekendDays(input.weekendDays);
    if (!w || (!allowInherit && w.length === 0))
      throw new BadRequestException({
        code: 'WEEKEND_INVALID',
        message: 'Choose the weekend days — at least one working day must remain.',
      });
    data.weekendDays = w;
  }
  if (input.holidayCountry !== undefined) {
    if (input.holidayCountry === null || input.holidayCountry === '') {
      data.holidayCountry = null;
      data.holidayRegion = null;
    } else {
      const c = String(input.holidayCountry).toUpperCase();
      if (!validCountry(c) || !countryList().some((x) => x.code === c))
        throw new BadRequestException({
          code: 'COUNTRY_UNKNOWN',
          message: 'We do not have holidays for that country.',
        });
      data.holidayCountry = c;
    }
  }
  if (input.holidayRegion !== undefined && data.holidayCountry !== null) {
    if (input.holidayRegion === null || input.holidayRegion === '') data.holidayRegion = null;
    else if (!validRegion(input.holidayRegion))
      throw new BadRequestException({ code: 'REGION_UNKNOWN', message: 'That region is not known.' });
    else data.holidayRegion = String(input.holidayRegion);
  }
  return data;
}
