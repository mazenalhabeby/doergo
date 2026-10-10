import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { CLIENT_ID } from '../../../common/dto/upload.dto';

/**
 * What every entry filed against an asset carries — a logbook entry and an
 * expense alike: the phone's own id for it, a note, and the slip it was filed
 * with. One definition, so the two forms cannot bound the same field two ways.
 */
export class AssetEntryBaseDto {
  /**
   * Made on the phone: an entry filed twice is one entry. Not `id` — the route
   * already calls the ASSET that, and the two would overwrite each other.
   */
  @ApiPropertyOptional({ description: 'Id made on the phone for this entry' })
  @IsOptional()
  @IsString()
  @Matches(CLIENT_ID)
  entryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @ApiPropertyOptional({ description: 'The key returned by presign. Checked against this asset.' })
  @IsOptional()
  @IsString()
  @MaxLength(400)
  receiptKey?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  receiptName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  receiptMime?: string;
}
