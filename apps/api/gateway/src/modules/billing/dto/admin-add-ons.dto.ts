import { OptString, OptStrings } from '../../../common/dto/body-fields';

/** POST /billing/admin/org-add-ons (operator, platform key) — no addOns = every add-on, as before. */
export class AdminOrgAddOnsDto {
  @OptString() organizationId?: string;
  @OptStrings() addOns?: string[];
}
