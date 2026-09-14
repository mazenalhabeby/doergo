import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * A planned rest, as a workspace configures it.
 *
 * Every field here ends up deciding when somebody stops working and how much of
 * their day is paid, so the bounds are not decoration: the service clamps these
 * again on the way in, because a DTO describes what a well-behaved client sends
 * and the service has to survive one that is not.
 */
export class BreakRuleDto {
  @ApiPropertyOptional({ description: 'The workspace these rests belong to' })
  @IsString()
  @IsOptional()
  spaceId?: string;

  @ApiPropertyOptional({ description: 'Set to override the workspace rests for one shift' })
  @IsString()
  @IsOptional()
  shiftId?: string;

  @ApiPropertyOptional({ example: 'Lunch' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({
    enum: ['LOCAL_WINDOW', 'AFTER_WORKED'],
    description: 'At a wall-clock time, or a number of minutes into the shift',
  })
  @IsIn(['LOCAL_WINDOW', 'AFTER_WORKED'])
  @IsOptional()
  trigger?: string;

  @ApiPropertyOptional({ description: 'AFTER_WORKED: minutes into the shift', example: 300 })
  @IsInt()
  @Min(1)
  @Max(1440)
  @IsOptional()
  afterMinutes?: number;

  @ApiPropertyOptional({ description: 'LOCAL_WINDOW: when it becomes due, HH:MM', example: '11:30' })
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'earliestLocal must be HH:MM' })
  @IsOptional()
  earliestLocal?: string;

  @ApiPropertyOptional({ description: 'LOCAL_WINDOW: after this it is missed, HH:MM', example: '13:30' })
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'latestLocal must be HH:MM' })
  @IsOptional()
  latestLocal?: string;

  @ApiPropertyOptional({ example: 30 })
  @IsInt()
  @Min(1)
  @Max(480)
  @IsOptional()
  durationMinutes?: number;

  @ApiPropertyOptional({ description: 'Paid rests do not come off the counted time' })
  @IsBoolean()
  @IsOptional()
  isPaid?: boolean;

  @ApiPropertyOptional({ description: 'A required rest that is missed flags the entry — it never deducts' })
  @IsBoolean()
  @IsOptional()
  isRequired?: boolean;

  @ApiPropertyOptional({ description: 'Ask the member when it falls due' })
  @IsBoolean()
  @IsOptional()
  remind?: boolean;

  @ApiPropertyOptional({ description: 'Minutes between reminders when they answer "later"', example: 15 })
  @IsInt()
  @Min(5)
  @Max(120)
  @IsOptional()
  snoozeMin?: number;

  @ApiPropertyOptional({ description: 'How many times "later" may be answered before it is recorded as missed' })
  @IsInt()
  @Min(0)
  @Max(10)
  @IsOptional()
  maxSnoozes?: number;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsInt()
  @Min(0)
  @Max(99)
  @IsOptional()
  position?: number;
}

/** "Later" — which rest, when the member has more than one outstanding. */
export class SnoozeBreakDto {
  @ApiPropertyOptional({ description: 'Omit to postpone whichever rest is next' })
  @IsString()
  @IsOptional()
  ruleId?: string;
}

/**
 * A leader granting more time.
 *
 * The signature is a data URL of a PNG the approver drew. Capped hard: this
 * lands in a database column, and an uncapped base64 field on an authenticated
 * endpoint is a way to fill a disk one request at a time.
 */
export class ApproveExtraTimeDto {
  @ApiPropertyOptional({ description: 'Minutes of overtime granted', example: 90 })
  @IsInt()
  @Min(1)
  @Max(1440)
  minutes!: number;

  @ApiPropertyOptional({ description: 'base64 PNG data URL of the approver’s signature' })
  @IsString()
  @IsOptional()
  @MaxLength(200_000)
  @Matches(/^data:image\/png;base64,/, { message: 'signature must be a PNG data URL' })
  signature?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(500)
  notes?: string;
}

/** A manager adding overtime to a closed shift nobody asked about. */
export class AddOvertimeDto {
  @ApiPropertyOptional({ description: 'Minutes of overtime after the shift end', example: 90 })
  @IsInt()
  @Min(1)
  @Max(1440)
  minutes!: number;

  @ApiPropertyOptional({ description: 'Why — recorded with the approval' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  reason?: string;
}

/** A leader refusing it. The reason reaches the member, so it is worth asking for. */
export class RejectExtraTimeDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(500)
  reason?: string;
}
