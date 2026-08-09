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
} from 'class-validator';
import { ATTENDANCE_CONSTANTS, WorkModel, SpaceKind } from '@hbcfield/shared';

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
