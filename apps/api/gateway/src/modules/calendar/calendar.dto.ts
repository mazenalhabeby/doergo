import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsISO8601, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';
import { EVENT_MAX_ATTENDEES, EVENT_TEXT_MAX, EVENT_TITLE_MAX, HOLIDAY_MAX_DAYS, HOLIDAY_NAME_MAX, MAX_REMINDERS } from '@hbcfield/shared';
import { CLIENT_ID } from '../../common/dto/upload.dto';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^[A-Za-z0-9_-]{1,64}$/;

/** A repeat rule — closed shape; the service re-validates (shared parseRepeat). */
export class RepeatDto {
  @IsIn(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']) freq!: string;
  @IsOptional() @IsInt() @Min(1) @Max(52) interval?: number;
  @IsOptional() @IsArray() @ArrayMaxSize(7) @IsInt({ each: true }) @Min(0, { each: true }) @Max(6, { each: true }) byDay?: number[];
  @IsOptional() @Matches(DATE) until?: string | null;
  @IsOptional() @IsInt() @Min(1) @Max(500) count?: number | null;
}

export class EventDto {
  @IsOptional() @IsIn(['APPOINTMENT', 'REMINDER']) kind?: 'APPOINTMENT' | 'REMINDER';
  @IsOptional() @IsString() @MaxLength(EVENT_TITLE_MAX) title?: string;
  @IsOptional() @IsString() @MaxLength(EVENT_TEXT_MAX) description?: string | null;
  @IsOptional() @IsString() @MaxLength(200) location?: string | null;
  @IsOptional() @IsString() @MaxLength(500) meetingUrl?: string | null;
  @IsOptional() @IsString() @Matches(ID) customerId?: string | null;
  @IsOptional() @IsString() @Matches(ID) spaceId?: string | null;
  @IsOptional() @IsBoolean() allDay?: boolean;
  @IsOptional() @IsISO8601({ strict: true }) startAt?: string;
  @IsOptional() @IsISO8601({ strict: true }) endAt?: string;
  @IsOptional() @Matches(DATE) startDate?: string;
  @IsOptional() @Matches(DATE) endDate?: string;
  @IsOptional() @IsString() @MaxLength(64) timezone?: string;
  @IsOptional() @ValidateNested() @Type(() => RepeatDto) repeat?: RepeatDto | null;
  @IsOptional() @IsArray() @ArrayMaxSize(MAX_REMINDERS) @IsInt({ each: true }) reminders?: number[];
  @IsOptional() @IsIn(['BUSY', 'DETAILS']) visibility?: 'BUSY' | 'DETAILS';
  @IsOptional() @IsArray() @ArrayMaxSize(EVENT_MAX_ATTENDEES) @Matches(ID, { each: true }) attendeeIds?: string[];
}

export class CreateEventDto extends EventDto {
  /** A client-made id, so the same request sent twice from a phone's queue creates one event. */
  @IsOptional() @IsString() @Matches(CLIENT_ID) id?: string;
}

export class RespondDto {
  @IsIn(['ACCEPTED', 'MAYBE', 'DECLINED']) response!: 'ACCEPTED' | 'MAYBE' | 'DECLINED';
}

export class SnoozeDto {
  @IsOptional() @IsIn([5, 10, 15, 30, 60]) minutes?: number;
  /** The occurrence the push was about (checked against the series in the service). */
  @IsOptional() @IsISO8601({ strict: true }) occurrence?: string;
}

export class DoneDto {
  @IsOptional() @IsISO8601({ strict: true }) occurrence?: string;
}

export class ItemsQueryDto {
  @Matches(DATE) from!: string;
  @Matches(DATE) to!: string;
  @IsOptional() @Matches(ID) spaceId?: string;
  @IsOptional() @Matches(/^[a-z,]{1,80}$/) layers?: string;
  @IsOptional() @IsIn(['en', 'de', 'es', 'fr', 'it']) lang?: string;
}

export class TeamQueryDto {
  @Matches(ID) spaceId!: string;
  @Matches(DATE) from!: string;
  @Matches(DATE) to!: string;
}

export class AvailabilityDto {
  @IsArray() @ArrayMaxSize(20) @Matches(ID, { each: true }) userIds!: string[];
  @IsISO8601({ strict: true }) from!: string;
  @IsISO8601({ strict: true }) to!: string;
}

export class FreeSlotsDto {
  @IsArray() @ArrayMaxSize(20) @Matches(ID, { each: true }) userIds!: string[];
  @IsInt() @Min(5) @Max(480) durationMin!: number;
  @IsOptional() @IsISO8601({ strict: true }) from?: string;
  @IsOptional() @IsInt() @Min(1) @Max(30) days?: number;
  @IsOptional() @IsString() @MaxLength(64) timezone?: string;
}

export class PeopleQueryDto {
  @IsOptional() @IsString() @MaxLength(60) q?: string;
}

export class PlaceSettingsDto {
  @IsOptional() @IsArray() @ArrayMaxSize(7) @IsInt({ each: true }) @Min(0, { each: true }) @Max(6, { each: true }) weekendDays?: number[];
  @IsOptional() @IsString() @MaxLength(2) holidayCountry?: string | null;
  @IsOptional() @IsString() @MaxLength(10) holidayRegion?: string | null;
}

export class OrgCalendarSettingsDto extends PlaceSettingsDto {
  @IsOptional() @IsBoolean() calendarFeedsEnabled?: boolean;
}

export class HolidayDto {
  @IsOptional() @Matches(ID) spaceId?: string | null;
  @IsOptional() @IsString() @MaxLength(100) libraryKey?: string | null;
  @Matches(DATE) date!: string;
  @IsOptional() @IsInt() @Min(1) @Max(HOLIDAY_MAX_DAYS) days?: number;
  @IsString() @MaxLength(HOLIDAY_NAME_MAX) name!: string;
  @IsOptional() @IsBoolean() halfDay?: boolean;
  @IsOptional() @IsBoolean() confirmed?: boolean;
  @IsOptional() @IsBoolean() removed?: boolean;
}

export class HolidaysQueryDto {
  @IsOptional() @Matches(ID) spaceId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1970) @Max(2200) year?: number;
  @IsOptional() @IsIn(['en', 'de', 'es', 'fr', 'it']) lang?: string;
}

export class LeaveCountQueryDto {
  @Matches(DATE) from!: string;
  @Matches(DATE) to!: string;
}

