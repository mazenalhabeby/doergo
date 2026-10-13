import { IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export class CreateStandInDto {
  @IsString() @Length(1, 128) toUserId!: string;
  @IsString() @Matches(DAY) startsOn!: string;
  @IsString() @Matches(DAY) endsOn!: string;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
  /** Somebody else's decisions — only for whoever manages people (checked in the service). */
  @IsOptional() @IsString() @Length(1, 128) fromUserId?: string;
}
