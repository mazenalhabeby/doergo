import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsNumber, IsOptional, IsBoolean, MaxLength, Matches, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CLIENT_ID } from '../../../common/dto/upload.dto';
import { OccurrenceEvidenceDto } from '../../../common/dto/occurrence.dto';

export class ClockInDto {
  // Optional: not needed for a remote clock-in (no fixed site).
  @ApiPropertyOptional({ description: 'Location ID to clock in at (omit for remote)' })
  @IsString()
  @IsOptional()
  locationId?: string;

  @ApiProperty({ description: 'Current latitude' })
  @IsNumber()
  @IsNotEmpty()
  lat: number;

  @ApiProperty({ description: 'Current longitude' })
  @IsNumber()
  @IsNotEmpty()
  lng: number;

  @ApiPropertyOptional({ description: 'GPS accuracy in meters' })
  @IsNumber()
  @IsOptional()
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

  @ApiPropertyOptional({ type: OccurrenceEvidenceDto, description: 'When and where the tap happened, for an action recorded offline' })
  @IsOptional()
  @ValidateNested()
  @Type(() => OccurrenceEvidenceDto)
  evidence?: OccurrenceEvidenceDto;
}
