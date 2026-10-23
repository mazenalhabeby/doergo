import type { Portal } from '@prisma/client';
import { DEFAULT_PORTAL_FEATURES } from '@hbcfield/shared';
import { sanitizeLabelValueRows, UNIT_DETAIL_LIMITS } from '../../common/records/label-value-rows';

// Keep only well-formed { label, value } detail rows — the one sanitizer the
// CRM also uses, with an address's own limits.
const sanitizeUnitDetails = (details: unknown) => sanitizeLabelValueRows(details, UNIT_DETAIL_LIMITS);

// Per-portal TTL cache for the intake config (read on every customer submit +
// GET config, which the mobile fans out across screens). Keyed by portalId.
const CONFIG_TTL_MS = 30_000;

const CONFIG_CACHE_MAX = 1000; // bound memory: sweep expired, then hard-cap

const configCache = new Map<string, { data: unknown; exp: number }>();

function cacheConfig(portalId: string, data: unknown) {
  // Memory hygiene: when the map grows past the cap, drop expired entries first,
  // then evict oldest insertions until under cap (Map preserves insertion order).
  if (configCache.size >= CONFIG_CACHE_MAX) {
    const now = Date.now();
    for (const [k, v] of configCache) if (v.exp <= now) configCache.delete(k);
    while (configCache.size >= CONFIG_CACHE_MAX) {
      const oldest = configCache.keys().next().value;
      if (oldest === undefined) break;
      configCache.delete(oldest);
    }
  }
  configCache.set(portalId, { data, exp: Date.now() + CONFIG_TTL_MS });
}

/** A portal and its categories in the shape every config read returns. */
function shapeConfig<C>(
  portal: Pick<
    Portal,
    | 'id'
    | 'name'
    | 'isActive'
    | 'templateKey'
    | 'entityLabel'
    | 'contactLabel'
    | 'accent'
    | 'coverImageUrl'
    | 'spaceId'
    | 'features'
  >,
  categories: C[],
) {
  return {
    id: portal.id,
    name: portal.name,
    enabled: portal.isActive,
    templateKey: portal.templateKey,
    entityLabel: portal.entityLabel ?? 'Unit',
    contactLabel: portal.contactLabel ?? 'Support',
    accent: portal.accent ?? 'emerald',
    coverImageUrl: portal.coverImageUrl ?? null,
    spaceId: portal.spaceId ?? null,
    features: { ...DEFAULT_PORTAL_FEATURES, ...((portal.features as Record<string, boolean>) || {}) },
    categories,
  };
}

export { shapeConfig, sanitizeUnitDetails, CONFIG_TTL_MS, CONFIG_CACHE_MAX, configCache, cacheConfig };
