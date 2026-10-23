import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** POST /attendance/entries/:id/outside — how many of the minutes count (0 = not counted). */
export class DecideOutsideShiftDto {
  @ApiPropertyOptional({
    description: 'Minutes of the time outside the shift that count; 0 = not counted',
    example: 90,
  })
  @IsInt()
  @Min(0)
  @Max(1440)
  minutes!: number;

  @ApiPropertyOptional({ description: 'Why — recorded with the decision' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  reason?: string;
}
