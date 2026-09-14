import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, Matches, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CLIENT_ID } from '../../../common/dto/upload.dto';
import { OccurrenceEvidenceDto } from '../../../common/dto/occurrence.dto';

export class EndBreakDto {
  @ApiPropertyOptional({ description: 'Optional notes about the break' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  notes?: string;

  @ApiPropertyOptional({ description: 'The break this ends — named by a phone that started it offline' })
  @IsOptional()
  @IsString()
  @Matches(CLIENT_ID)
  breakId?: string;

  @ApiPropertyOptional({ type: OccurrenceEvidenceDto, description: 'When and where the tap happened, for an action recorded offline' })
  @IsOptional()
  @ValidateNested()
  @Type(() => OccurrenceEvidenceDto)
  evidence?: OccurrenceEvidenceDto;
}
