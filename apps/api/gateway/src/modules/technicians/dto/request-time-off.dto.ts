import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsISO8601, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { CLIENT_ID } from '../../../common/dto/upload.dto';

/**
 * A member asks for days off. Typed (the route took a plain `{…}` type, which
 * the global whitelist cannot check), and it may carry the id the phone made,
 * so a request queued offline and sent twice is still one request.
 */
export class RequestTimeOffDto {
  @ApiPropertyOptional({ description: 'Id made on the phone; a resend returns the same request' })
  @IsOptional() @IsString() @Matches(CLIENT_ID)
  id?: string;

  @ApiProperty({ example: '2026-10-01' }) @IsISO8601() startDate: string;
  @ApiProperty({ example: '2026-10-05' }) @IsISO8601() endDate: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) reason?: string;

  /** Only VACATION is deducted from the allowance. Defaults to VACATION in the service. */
  @ApiPropertyOptional({ enum: ['VACATION', 'SICK', 'FAMILY', 'OTHER'] }) @IsOptional() @IsIn(['VACATION', 'SICK', 'FAMILY', 'OTHER']) type?: string;
}
