import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsInt,
  IsOptional,
  IsArray,
  IsIn,
  MaxLength,
  Min,
  Max,
  ArrayMaxSize,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ATTENDANCE_CONSTANTS, GEOFENCE_POLYGON_LIMITS, WorkModel, SpaceKind } from '@hbcfield/shared';
import { GEOFENCE_POLICIES, DEFAULT_GEOFENCE_POLICY, MIN_COVER_MAX, NO_SHIFT_POLICIES, NO_SHIFT_LIMIT } from '@hbcfield/shared';

/** One corner of a drawn site boundary. */
export class GeoPointDto {
  @ApiProperty({ example: 48.135048 })
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat!: number;

  @ApiProperty({ example: 11.595039 })
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng!: number;
}

export class CreateLocationDto {
  @ApiProperty({
    example: 'Main Office',
    description: 'Name of the company location',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(ATTENDANCE_CONSTANTS.LOCATION_NAME_MAX_LENGTH)
  name: string;

  @ApiPropertyOptional({
    example: '123 Business Ave, New York, NY 10001',
    description: 'Full address of the location',
  })
  @IsString()
  @IsOptional()
  @MaxLength(ATTENDANCE_CONSTANTS.LOCATION_ADDRESS_MAX_LENGTH)
  address?: string;

  @ApiPropertyOptional({
    example: 40.7128,
    description: 'Latitude — only for physical locations (attendance/geofence)',
  })
  @IsNumber()
  @IsOptional()
  @Min(-90)
  @Max(90)
  lat?: number;

  @ApiPropertyOptional({
    example: -74.006,
    description: 'Longitude — only for physical locations (attendance/geofence)',
  })
  @IsNumber()
  @IsOptional()
  @Min(-180)
  @Max(180)
  lng?: number;

  @ApiPropertyOptional({
    example: 15,
    description: 'Geofence radius in meters for clock-in zone',
    default: ATTENDANCE_CONSTANTS.DEFAULT_GEOFENCE_RADIUS,
  })
  @IsNumber()
  @IsOptional()
  @Min(ATTENDANCE_CONSTANTS.MIN_GEOFENCE_RADIUS)
  @Max(ATTENDANCE_CONSTANTS.MAX_GEOFENCE_RADIUS)
  geofenceRadius?: number;

  @ApiPropertyOptional({
    description:
      "The site's outline. When set it replaces the radius — an address geocodes " +
      'to the front door, so a circle cannot describe a property with a yard or ' +
      'several buildings. Area and ring rules are enforced server-side.',
    type: () => [GeoPointDto],
  })
  @IsArray()
  @ArrayMaxSize(GEOFENCE_POLYGON_LIMITS.MAX_POINTS)
  @ValidateNested({ each: true })
  @Type(() => GeoPointDto)
  @IsOptional()
  /*
    ⚠️ THE POINTS MUST BE A REAL NESTED DTO, not a bare `{lat,lng}[]`.

    The pipe runs with `whitelist: true`, which strips any property carrying no
    validation decorator — including the contents of nested objects. With the
    array typed only in TypeScript, every point arrived at the service as `{}`
    and the boundary was refused as "not a valid coordinate" while the browser
    had sent perfectly good numbers. TypeScript types are gone at runtime;
    `@Type` is what tells the transformer these objects have a shape worth
    keeping.

    The coordinate ranges are therefore stated twice — here, because the pipe
    demands it, and in `validateGeofencePolygon`, which is the one the service
    trusts and which also enforces the ring and area rules that no decorator
    can express.
  */
  geofencePolygon?: GeoPointDto[];


  @ApiPropertyOptional({
    example: 'America/New_York',
    description: 'IANA timezone for this location (e.g. Europe/Berlin, America/New_York)',
    default: 'Europe/Berlin',
  })
  @IsString()
  @IsOptional()
  timezone?: string;

  @ApiPropertyOptional({
    enum: WorkModel,
    description: 'How attendance is interpreted for this space (shift-based, fixed, task, or none)',
    default: WorkModel.NONE,
  })
  @IsIn(Object.values(WorkModel))
  @IsOptional()
  workModel?: WorkModel;

  /**
   * Whether anybody may clock in for this workspace without standing in it.
   *
   * ⚠️ A CEILING, not a permission. AWAY_ALLOWED grants nothing to anybody — it
   * makes an away day possible here, and the grant on the member decides who may
   * take one. Defaults to STRICT, which is today's behaviour.
   */
  @ApiPropertyOptional({
    enum: GEOFENCE_POLICIES,
    description: 'STRICT = must be on site · AWAY_ALLOWED = permitted for granted members · NONE = no ring',
    default: DEFAULT_GEOFENCE_POLICY,
  })
  @IsIn(GEOFENCE_POLICIES as unknown as string[])
  @IsOptional()
  geofencePolicy?: string;

  /**
   * The staffing floor: how many people must be on the floor here on a working
   * day. 0 means no floor — the screens then report the headcount and pass no
   * verdict on it, which is what every existing workspace does.
   */
  @ApiPropertyOptional({
    description: 'Minimum people on the floor on a working day. 0 = no floor set.',
    minimum: 0,
    maximum: MIN_COVER_MAX,
    default: 0,
  })
  @IsInt()
  @Min(0)
  @Max(MIN_COVER_MAX)
  @IsOptional()
  minCover?: number;

  /**
   * Clocking in here with no shift: ALLOW, LIMIT (up to `noShiftDailyMinutes` a
   * day, counted at every workspace) or SHIFT_ONLY. Defaults to ALLOW.
   */
  @ApiPropertyOptional({ enum: NO_SHIFT_POLICIES, default: 'ALLOW' })
  @IsIn(NO_SHIFT_POLICIES as unknown as string[])
  @IsOptional()
  noShiftPolicy?: string;

  @ApiPropertyOptional({ description: 'Daily limit for LIMIT, in minutes', minimum: NO_SHIFT_LIMIT.MIN_MINUTES, maximum: NO_SHIFT_LIMIT.MAX_MINUTES })
  @IsInt()
  @Min(NO_SHIFT_LIMIT.MIN_MINUTES)
  @Max(NO_SHIFT_LIMIT.MAX_MINUTES)
  @IsOptional()
  noShiftDailyMinutes?: number;

  @ApiPropertyOptional({
    enum: SpaceKind,
    description: 'Ownership classification: PROJECT | COMPANY | CUSTOMER (a customer company you do work for)',
    default: SpaceKind.COMPANY,
  })
  @IsIn(Object.values(SpaceKind))
  @IsOptional()
  kind?: SpaceKind;

  @ApiPropertyOptional({ description: 'CUSTOMER kind: primary contact name' })
  @IsString()
  @IsOptional()
  @MaxLength(200)
  contactName?: string;

  @ApiPropertyOptional({ description: 'CUSTOMER kind: contact email' })
  @IsString()
  @IsOptional()
  @MaxLength(200)
  contactEmail?: string;

  @ApiPropertyOptional({ description: 'CUSTOMER kind: contact phone' })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  contactPhone?: string;

  @ApiPropertyOptional({ description: 'CUSTOMER kind: billable rate override (EUR cents/hour; null falls back to org default)' })
  @IsNumber()
  @Min(0)
  @Max(100000000)
  @IsOptional()
  billableRateCents?: number;

  @ApiPropertyOptional({ description: 'What an hour here COSTS, in EUR cents. Null clears; 0 is a real rate of nothing.' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1000000)
  costRateCents?: number | null;

  @ApiPropertyOptional({
    example: ['time_tracking', 'sprints'],
    description: 'Enabled modules for this space (overrides org defaults)',
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  enabledModules?: string[];

  @ApiPropertyOptional({
    description: 'Status workflow ID to associate with this space',
  })
  @IsString()
  @IsOptional()
  workflowId?: string;

  @ApiPropertyOptional({ type: [String], description: 'Role ids notified about members in this space (empty = space leaders)' })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  notifyRoleIds?: string[];

  @ApiPropertyOptional({ type: [String], description: 'Role ids contactable by members in this space (empty = space leaders)' })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  contactRoleIds?: string[];
}
