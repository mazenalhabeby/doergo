import { IsIn, IsArray, ArrayUnique, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ADD_ON_KEYS } from '@hbcfield/shared';

const INTERVALS = ['monthly', 'annual'] as const;

/**
 * Checkout no longer takes a tier — there are none.
 *
 * The purchase is whatever the organization already has switched on, computed
 * server-side at the moment of checkout. A body that could name its own lines
 * would let a customer subscribe to a cheaper bill than the one they are using.
 * Monthly or annual is the only choice left.
 */
export class CheckoutDto {
  @ApiProperty({ enum: INTERVALS })
  @IsIn(INTERVALS as unknown as string[])
  interval!: (typeof INTERVALS)[number];
}

export class ChangePlanDto extends CheckoutDto {}

/**
 * Which capabilities the organization is buying.
 *
 * The whole list, not a delta: "these are the add-ons I want" is one decision on
 * one screen, and a merge-only shape would make removing one impossible through
 * the call that adds one.
 *
 * Validated against the catalogue HERE as well as in the service. The global
 * pipe runs with `forbidNonWhitelisted`, so a body carrying anything else is a
 * 400 before it reaches a service — and `@IsIn` means an unknown key is refused
 * rather than stored, which matters because a stored unknown key sits on the
 * organization looking like an entitlement until somebody ships a real add-on
 * with that name.
 */
export class SetAddOnsDto {
  @ApiProperty({ isArray: true, enum: ADD_ON_KEYS, example: ['invoicing', 'workflows'] })
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @IsIn(ADD_ON_KEYS, { each: true })
  addOns!: string[];
}
