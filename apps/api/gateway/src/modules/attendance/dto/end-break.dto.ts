import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class EndBreakDto {
  @ApiPropertyOptional({ description: 'Optional notes about the break' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  notes?: string;
}
