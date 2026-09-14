import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, MaxLength, Matches, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CLIENT_ID } from '../../../common/dto/upload.dto';
import { OccurrenceEvidenceDto } from '../../../common/dto/occurrence.dto';

export class ClockOutDto {
  // Optional: clock-out is allowed without a GPS fix. When absent the geofence
  // check is skipped and coords are stored null (no spurious (0,0) point).
  @ApiPropertyOptional({ description: 'Current latitude' })
  @IsNumber()
  @IsOptional()
  lat?: number;

  @ApiPropertyOptional({ description: 'Current longitude' })
  @IsNumber()
  @IsOptional()
  lng?: number;

  @ApiPropertyOptional({ description: 'GPS accuracy in meters' })
  @IsNumber()
  @IsOptional()
  accuracy?: number;

  @ApiPropertyOptional({ description: 'Notes about the shift' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  notes?: string;

  /**
   * Why they are leaving before the shift ends.
   *
   * Optional, and the clock-out is never refused for want of it: a person may
   * always stop working, and a time system that blocks a clock-out is one people
   * work around. The server decides whether the shift was actually short — the
   * client asking the question is a courtesy, not the check.
   */
  @ApiPropertyOptional({ description: 'Reason for leaving before the shift ends' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  earlyReason?: string;

  @ApiPropertyOptional({ description: 'Why they stayed past the shift end — becomes an overtime request for a leader' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  overtimeReason?: string;

  @ApiPropertyOptional({ description: 'The shift this closes — a phone that clocked in offline names the entry it made' })
  @IsOptional()
  @IsString()
  @Matches(CLIENT_ID)
  entryId?: string;

  @ApiPropertyOptional({ type: OccurrenceEvidenceDto, description: 'When and where the tap happened, for an action recorded offline' })
  @IsOptional()
  @ValidateNested()
  @Type(() => OccurrenceEvidenceDto)
  evidence?: OccurrenceEvidenceDto;
}
