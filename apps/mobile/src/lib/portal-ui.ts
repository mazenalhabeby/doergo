import type { IconName } from '@hbcfield/shared/client';

/**
 * Maps the customer-portal template icon/color keys (shared, backend-neutral)
 * to marks in the shared icon library + the HBCField semantic palette, so
 * the same intake config renders identically on web and mobile.
 */
const PORTAL_COLORS: Record<string, string> = {
  emerald: '#059669',
  blue: '#3B82F6',
  amber: '#D97706',
  purple: '#8B5CF6',
  cyan: '#0891B2',
  indigo: '#4F46E5',
  red: '#EF4444',
  orange: '#F97316',
  slate: '#64748B',
};

export function portalColor(key?: string | null): string {
  return PORTAL_COLORS[key || 'slate'] || PORTAL_COLORS.slate;
}

/** Translucent chip background from a base color — reads well in light & dark. */
export function portalTint(key?: string | null): string {
  return `${portalColor(key)}22`;
}

const ICON_MAP: Record<string, IconName> = {
  snowflake: 'snowflake',
  droplet: 'water',
  zap: 'bolt',
  door: 'door',
  appliance: 'appliance',
  alert: 'alert',
  plus: 'plus',
  inbox: 'inbox',
  package: 'assets',
  shuffle: 'shuffle',
  help: 'help',
  clock: 'time',
  thermometer: 'thermometer',
  bulb: 'bulb',
  shower: 'shower',
  shield: 'shieldPlain',
  monitor: 'monitor',
  tool: 'toolbox',
  truck: 'truck',
  building: 'workspaces',
};

export function portalIcon(key?: string | null): IconName {
  return ICON_MAP[key || ''] || 'help';
}
