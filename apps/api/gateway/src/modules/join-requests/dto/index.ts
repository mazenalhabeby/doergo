import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum, IsInt, Min, Max } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { Role, Platform, TechnicianType, WorkMode } from '@doergo/shared';

/**
 * List join requests query DTO
 */
export class ListJoinRequestsDto {
  @ApiPropertyOptional({ enum: ['PENDING', 'APPROVED', 'REJECTED', 'CANCELED', 'all'], default: 'PENDING' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

/**
 * Approve join request DTO
 */
export class ApproveJoinRequestDto {
  @ApiProperty({ enum: [Role.DISPATCHER, Role.TECHNICIAN], description: 'Role to assign' })
  @IsEnum([Role.DISPATCHER, Role.TECHNICIAN], { message: 'Role must be DISPATCHER or TECHNICIAN' })
  role: string;

  @ApiPropertyOptional({ enum: Platform, description: 'Platform access' })
  @IsOptional()
  @IsEnum(Platform)
  platform?: string;

  @ApiPropertyOptional({ enum: TechnicianType, description: 'Technician type (if role=TECHNICIAN)' })
  @IsOptional()
  @IsEnum(TechnicianType)
  technicianType?: string;

  @ApiPropertyOptional({ enum: WorkMode, description: 'Work mode (if role=TECHNICIAN)' })
  @IsOptional()
  @IsEnum(WorkMode)
  workMode?: string;

  @ApiPropertyOptional({ description: 'Specialty (if role=TECHNICIAN)' })
  @IsOptional()
  @IsString()
  specialty?: string;

  @ApiPropertyOptional({ description: 'Max daily jobs (if role=TECHNICIAN)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  maxDailyJobs?: number;
}

/**
 * Reject join request DTO
 */
export class RejectJoinRequestDto {
  @ApiPropertyOptional({ description: 'Reason for rejection' })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  reason?: string;
}
