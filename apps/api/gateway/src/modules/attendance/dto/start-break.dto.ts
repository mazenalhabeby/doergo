import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export enum BreakType {
  LUNCH = 'LUNCH',
  SHORT = 'SHORT',
  OTHER = 'OTHER',
}

export class StartBreakDto {
  @ApiProperty({
    enum: BreakType,
    default: BreakType.SHORT,
    description: 'Type of break',
  })
  @IsEnum(BreakType)
  @IsOptional()
  type?: BreakType = BreakType.SHORT;

  @ApiPropertyOptional({ description: 'Optional notes about the break' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  notes?: string;
}
