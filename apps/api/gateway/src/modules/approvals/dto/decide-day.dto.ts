import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { DAY_KINDS, MAX_DAY_ITEMS, type WorkDayKind } from '@hbcfield/shared';

class DayMemberDto {
  @ApiProperty({ enum: DAY_KINDS })
  @IsIn(DAY_KINDS as unknown as string[])
  kind!: WorkDayKind;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  id!: string;
}

/** "Approve day": the day's member items — each still decided through its own route. */
export class DecideDayDto {
  @ApiProperty({ type: [DayMemberDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_DAY_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => DayMemberDto)
  members!: DayMemberDto[];
}
