import { IsIn, IsArray, ArrayUnique, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ADD_ON_KEYS } from '@hbcfield/shared';

/*
  There is no CheckoutDto, and no ChangePlanDto.

  Checkout takes no body at all. It never took a tier — there are none — and it
  no longer takes an interval either, because billing is monthly and nothing
  else. The purchase is whatever the organization already has switched on,
  computed server-side at the moment of checkout, so a client cannot subscribe
  itself to a cheaper bill than the one it is using.

  ChangePlanDto existed to carry that interval and had no other field, so the
  endpoint went with it.
*/

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
