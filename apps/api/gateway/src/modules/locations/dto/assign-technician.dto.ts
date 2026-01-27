import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsBoolean,
  IsOptional,
  IsArray,
  ArrayMaxSize,
  IsDateString,
} from 'class-validator';

export class AssignTechnicianDto {
  @ApiProperty({ description: 'User ID of the technician to assign' })
  @IsString()
  @IsNotEmpty()
  userId: string;

  @ApiPropertyOptional({
    description: 'Is this the primary work location',
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  isPrimary?: boolean;

  @ApiPropertyOptional({
    description: 'Work schedule days',
    example: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
    type: [String],
  })
  @IsArray()
  @IsOptional()
  @ArrayMaxSize(7)
  schedule?: string[];

  @ApiPropertyOptional({ description: 'Assignment start date' })
  @IsDateString()
  @IsOptional()
  effectiveFrom?: string;

  @ApiPropertyOptional({
    description: 'Assignment end date (null = indefinite)',
  })
  @IsDateString()
  @IsOptional()
  effectiveTo?: string;
}
