import { MaterialCommunityIcons } from '@expo/vector-icons';

/**
 * Maps the customer-portal template icon/color keys (shared, backend-neutral)
 * to concrete MaterialCommunityIcons names + the HBCField semantic palette, so
 * the same intake config renders identically on web and mobile.
 */
export const PORTAL_COLORS: Record<string, string> = {
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

const ICON_MAP: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = {
  snowflake: 'snowflake',
  droplet: 'water',
  zap: 'flash',
  door: 'door',
  appliance: 'washing-machine',
  alert: 'alert',
  plus: 'plus',
  inbox: 'inbox',
  package: 'package-variant',
  shuffle: 'shuffle-variant',
  help: 'help-circle-outline',
  clock: 'clock-outline',
  thermometer: 'thermometer',
  bulb: 'lightbulb-outline',
  shower: 'shower',
  shield: 'shield-outline',
  monitor: 'monitor',
  tool: 'wrench',
  truck: 'truck',
  building: 'office-building',
};

export function portalIcon(key?: string | null): keyof typeof MaterialCommunityIcons.glyphMap {
  return ICON_MAP[key || ''] || 'help-circle-outline';
}
