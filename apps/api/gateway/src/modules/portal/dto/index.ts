import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean, IsIn, MaxLength } from 'class-validator';

/** A customer submitting a request from the portal. */
export class SubmitRequestDto {
  @ApiProperty({ description: 'Intake category key (from the portal config)' })
  @IsString()
  categoryKey: string;

  @ApiPropertyOptional({ description: 'Selected sub-issue label' })
  @IsString()
  @IsOptional()
  @MaxLength(200)
  issue?: string;

  @ApiPropertyOptional({ description: 'Free-text description' })
  @IsString()
  @IsOptional()
  @MaxLength(5000)
  description?: string;

  @ApiPropertyOptional({ description: 'Which of the customer’s units the request is about (defaults to the linked unit)' })
  @IsString()
  @IsOptional()
  unitId?: string;

  @ApiPropertyOptional({ description: 'Which of the customer’s assets the request is about (defaults to the linked asset)' })
  @IsString()
  @IsOptional()
  assetId?: string;

  @ApiPropertyOptional({ description: 'Whether staff may enter if the customer is out' })
  @IsBoolean()
  @IsOptional()
  accessPermitted?: boolean;

  @ApiPropertyOptional({ enum: ['MORNING', 'AFTERNOON', 'EVENING'] })
  @IsString()
  @IsOptional()
  @IsIn(['MORNING', 'AFTERNOON', 'EVENING'])
  preferredTime?: string;

  @ApiPropertyOptional({ enum: ['PUSH', 'EMAIL', 'PHONE'] })
  @IsString()
  @IsOptional()
  @IsIn(['PUSH', 'EMAIL', 'PHONE'])
  contactPreference?: string;

  // NOTE: photo attachments are a follow-up — intentionally NOT accepted here yet
  // so the API doesn't imply support and silently drop them.
}
