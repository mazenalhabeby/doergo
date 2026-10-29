import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsBoolean,
  IsIn,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  Matches,
  ValidateNested,
} from 'class-validator';
import { CLOCK_TRIGGERS, type ClockTrigger } from '@hbcfield/shared';
import { Type } from 'class-transformer';
import { CLIENT_ID } from '../../../common/dto/upload.dto';
import { OccurrenceEvidenceDto } from '../../../common/dto/occurrence.dto';

export class ClockInDto {
  // Optional: not needed for a remote clock-in (no fixed site).
  @ApiPropertyOptional({ description: 'Location ID to clock in at (omit for remote)' })
  @IsString()
  @IsOptional()
  locationId?: string;

  /*
    The position is asked only where the place checks it (clock review C2): a workspace with a pin refuses a
    clock-in without one (FIX_MISSING); a workspace with no coordinates, or the Remote bucket, does not need it.
  */
  @ApiPropertyOptional({ description: 'Current latitude (needed at a workspace with a pin)' })
  @IsNumber()
  @Min(-90)
  @Max(90)
  @IsOptional()
  lat?: number;

  @ApiPropertyOptional({ description: 'Current longitude (needed at a workspace with a pin)' })
  @IsNumber()
  @Min(-180)
  @Max(180)
  @IsOptional()
  lng?: number;

  // ⚠️ REQUIRED with a position: a position without its accuracy was judged as a perfect fix (the same ranges
  // as the evidence fix, occurrence.dto.ts).
  @ApiPropertyOptional({ description: 'GPS accuracy in meters — required when lat/lng are sent' })
  @ValidateIf((o: ClockInDto) => o.lat != null || o.lng != null || o.accuracy != null)
  @IsNumber()
  @Min(0)
  @Max(100_000)
  accuracy?: number;

  @ApiPropertyOptional({ description: 'Clock in remotely (WFH/anywhere), geofence-exempt' })
  @IsBoolean()
  @IsOptional()
  isRemote?: boolean;

  /**
   * Why they are away from the site, when they are.
   *
   * Optional, and never load-bearing: the server decides whether this clock-in
   * IS away from its distance to the site, and whether that is permitted from
   * the workspace's ceiling and the member's grant. This is the note a human
   * reads afterwards, not an assertion the server acts on.
   */
  @ApiPropertyOptional({ description: 'Why they are working away from the site', example: 'Visiting a client' })
  @IsString()
  @IsOptional()
  @MaxLength(200)
  awayReason?: string;

  @ApiPropertyOptional({ description: 'Id made on the phone; a resend returns the same record' })
  @IsOptional()
  @IsString()
  @Matches(CLIENT_ID)
  id?: string;

  @ApiPropertyOptional({
    type: OccurrenceEvidenceDto,
    description: 'When and where the tap happened, for an action recorded offline',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => OccurrenceEvidenceDto)
  evidence?: OccurrenceEvidenceDto;

  /**
   * AUTO = made by the phone's automatic clock (shared attendance/auto-clock.ts).
   * A claim, never an authority: the server re-checks consent, the workspace,
   * the member and the window, and records an ordinary step when it does not hold.
   */
  @ApiPropertyOptional({ enum: CLOCK_TRIGGERS, description: 'MANUAL (default) or AUTO — re-checked by the server' })
  @IsOptional()
  @IsIn(CLOCK_TRIGGERS as unknown as string[])
  trigger?: ClockTrigger;
}
