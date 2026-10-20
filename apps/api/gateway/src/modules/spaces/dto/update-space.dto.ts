import { PartialType } from '@nestjs/swagger';
import { IsBoolean, IsObject, IsOptional, ValidateIf } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CreateSpaceDto } from './create-space.dto';

export class UpdateSpaceDto extends PartialType(CreateSpaceDto) {
  @ApiPropertyOptional({
    example: true,
    description: 'Whether the location is active',
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  /**
   * The automatic clock's settings (shared `AutoClockSettings`). Checked
   * STRICTLY in the service — an out-of-range value is a 400
   * `AUTO_CLOCK_SETTING_INVALID` naming the field, never clamped. `null`
   * switches it off; `{ enabled: false, … }` keeps the numbers and switches it off.
   */
  @ApiPropertyOptional({ nullable: true, description: 'AutoClockSettings; null = off' })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsObject()
  autoClock?: Record<string, unknown> | null;
}
