import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength, Matches, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CLIENT_ID } from '../../../common/dto/upload.dto';
import { OccurrenceEvidenceDto } from '../../../common/dto/occurrence.dto';

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

  @ApiPropertyOptional({ description: 'The planned rest this satisfies; omit for whichever is next' })
  @IsString()
  @IsOptional()
  ruleId?: string;

  @ApiPropertyOptional({ description: 'Optional notes about the break' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  notes?: string;

  @ApiPropertyOptional({ description: 'Id made on the phone; a resend returns the same record' })
  @IsOptional()
  @IsString()
  @Matches(CLIENT_ID)
  id?: string;

  @ApiPropertyOptional({ description: 'The shift this break belongs to' })
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
