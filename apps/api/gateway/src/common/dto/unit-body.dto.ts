import { OptArray, OptBoolean, OptNumber, OptString } from './body-fields';

/**
 * An address / unit body — every field `pickUnitFields` reads (UNIT_ADDRESS_FIELDS +
 * UNIT_RELATION_FIELDS in packages/shared/src/customer-portal/unit-fields.ts), so the
 * whitelist and the pick agree. Whether the relation fields are USED is still the route's
 * choice (`relations: false` drops them on the CRM address surface, as before).
 */
export class UnitBodyDto {
  @OptString() name?: string;
  @OptString() label?: string | null;
  @OptString() address?: string;
  @OptNumber() lat?: number;
  @OptNumber() lng?: number;
  @OptBoolean() isPrimary?: boolean;
  @OptString() contactName?: string | null;
  @OptString() contactPhone?: string | null;
  @OptArray() details?: { label: string; value: string }[] | null;
  @OptString() spaceId?: string | null;
  @OptString() portalId?: string | null;
  @OptString() customerId?: string | null;
  @OptString() residentUserId?: string | null;
}
