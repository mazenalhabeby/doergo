import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { OccurrenceEvidenceDto } from '../../../common/dto/occurrence.dto';

/** The member's own consent to the automatic clock (ArbVG §96). */
export class AutoClockConsentDto {
  @ApiProperty({ description: 'true gives consent (kept from the first time); false withdraws it and the phone disarms' })
  @IsBoolean()
  consent: boolean;
}

/**
 * Undo an automatic clock-in / skip the automatic rest. The evidence carries
 * WHEN the member tapped — an action recorded offline is judged at that moment.
 */
export class AutoClockActionDto {
  @ApiPropertyOptional({ type: OccurrenceEvidenceDto, description: 'When the tap happened, for an action recorded offline' })
  @IsOptional()
  @ValidateNested()
  @Type(() => OccurrenceEvidenceDto)
  evidence?: OccurrenceEvidenceDto;
}
