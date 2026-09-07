import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsArray,
  IsIn,
  MaxLength,
  Min,
  Max,
  ArrayMaxSize,
} from 'class-validator';
import { ATTENDANCE_CONSTANTS, GEOFENCE_POLYGON_LIMITS, WorkModel, SpaceKind } from '@hbcfield/shared';
import { GEOFENCE_POLICIES, DEFAULT_GEOFENCE_POLICY } from '@hbcfield/shared';

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
      "The site's outline as [{lat,lng}]. When set it replaces the radius — an " +
      'address geocodes to the front door, so a circle cannot describe a property ' +
      'with a yard or several buildings. Validated server-side for point count, ' +
      'coordinate range and total area.',
    type: 'array',
    items: { type: 'object', properties: { lat: { type: 'number' }, lng: { type: 'number' } } },
  })
  @IsArray()
  @ArrayMaxSize(GEOFENCE_POLYGON_LIMITS.MAX_POINTS)
  @IsOptional()
  /*
    Deliberately NOT validated point-by-point here. The real rules — coordinate
    ranges, the closed-ring convention and the maximum area — live in
    `validateGeofencePolygon` in the shared package, which is also what the
    service calls before writing. Duplicating half of them in a decorator gives
    two definitions of a valid boundary that drift.

    The size cap stays at this edge so a hostile payload is rejected before it
    is parsed at all.
  */
  geofencePolygon?: { lat: number; lng: number }[];


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
