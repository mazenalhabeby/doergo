import { IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

const SELF_SERVE_TIERS = ['starter', 'professional', 'business'] as const;
const INTERVALS = ['monthly', 'annual'] as const;

export class CheckoutDto {
  @ApiProperty({ enum: SELF_SERVE_TIERS })
  @IsIn(SELF_SERVE_TIERS as unknown as string[])
  tier!: (typeof SELF_SERVE_TIERS)[number];

  @ApiProperty({ enum: INTERVALS })
  @IsIn(INTERVALS as unknown as string[])
  interval!: (typeof INTERVALS)[number];
}

export class ChangePlanDto extends CheckoutDto {}
