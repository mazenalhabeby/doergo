/**
 * What a request body may change on a unit (an address / an apartment).
 *
 * ⚠️ WHITELIST, NEVER SPREAD. Three gateway routes edit a unit, and two of them
 * built their payload as `{ id, organizationId: <token>, ..., ...rest }` from an
 * untyped body — the spread came LAST, so a body carrying `organizationId`
 * replaced the token's, and `portal.service.updateUnit` scoped its lookup by
 * whatever organization it was handed: a cross-tenant write. `@Body() body: any`
 * carries no validation metadata, so the global whitelist never applied.
 *
 * One pick for every route, so a field added to the unit is added once and an
 * identity field (`id`, `organizationId`, `actorId`, `scopeCustomerId`, a CRM
 * caller) can never ride in from a body. The route puts identity AFTER the pick.
 *
 * `relations: false` is the CRM address surface: a client's address edits its
 * own text and pin, and does not move the unit to another client, space, portal
 * or resident — that is the portal manager's job, on the portal routes.
 */
export const UNIT_ADDRESS_FIELDS = [
  'name', 'label', 'address', 'lat', 'lng', 'isPrimary', 'contactName', 'contactPhone', 'details',
] as const;
export const UNIT_RELATION_FIELDS = ['spaceId', 'portalId', 'customerId', 'residentUserId'] as const;

export type UnitEditableField = (typeof UNIT_ADDRESS_FIELDS)[number] | (typeof UNIT_RELATION_FIELDS)[number];
export type UnitFields = Partial<Record<UnitEditableField, unknown>>;

export function pickUnitFields(body: unknown, opts: { relations?: boolean } = {}): UnitFields {
  const src = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  const keys: readonly UnitEditableField[] = opts.relations === false
    ? UNIT_ADDRESS_FIELDS
    : [...UNIT_ADDRESS_FIELDS, ...UNIT_RELATION_FIELDS];
  const out: UnitFields = {};
  // Own properties only: `__proto__`/inherited keys never become a field.
  for (const k of keys) if (Object.prototype.hasOwnProperty.call(src, k) && src[k] !== undefined) out[k] = src[k];
  return out;
}
