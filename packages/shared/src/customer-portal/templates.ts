/**
 * @hbcfield/shared — customer-portal seed templates.
 *
 * The single source of truth for the built-in intake presets. Enabling the
 * portal for an org seeds its IntakeCategory rows from one of these; the office
 * can then edit freely. Adding a vertical = adding one object here (DRY).
 *
 * icon / color values mirror the mobile icon set + semantic palette so the same
 * config renders identically on web and mobile.
 */
import type { PortalTemplate } from './types';

export const PORTAL_TEMPLATES: Record<string, PortalTemplate> = {
  rental: {
    key: 'rental',
    vertical: 'Rental / Property',
    entityLabel: 'Apartment',
    contactLabel: 'Leasing Office',
    accent: 'emerald',
    features: { photos: true, access: true, preferredTime: true, location: false, contact: false, community: true, messages: true, ratings: true },
    categories: [
      { key: 'air_conditioning', label: 'Air Conditioning', icon: 'snowflake', color: 'cyan', urgent: false, team: 'HVAC team', defaultPriority: null, issues: ['Not cooling', 'No power', 'Strange noise', 'Water leaking'], position: 0 },
      { key: 'plumbing', label: 'Plumbing', icon: 'droplet', color: 'blue', urgent: false, team: 'Plumbing team', defaultPriority: null, issues: ['Leak', 'No hot water', 'Clogged drain', 'Low pressure'], position: 1 },
      { key: 'electrical', label: 'Electrical', icon: 'zap', color: 'amber', urgent: false, team: 'Electrical team', defaultPriority: null, issues: ['Outlet dead', 'Breaker trips', 'Flickering lights'], position: 2 },
      { key: 'door_window', label: 'Door / Window', icon: 'door', color: 'purple', urgent: false, team: 'Maintenance', defaultPriority: null, issues: ['Won’t lock', 'Broken handle', 'Draft'], position: 3 },
      { key: 'appliances', label: 'Appliances', icon: 'appliance', color: 'emerald', urgent: false, team: 'Appliance team', defaultPriority: null, issues: ['Not starting', 'Leaking', 'Error code'], position: 4 },
      { key: 'emergency', label: 'Emergency', icon: 'alert', color: 'red', urgent: true, team: 'On-call team', defaultPriority: 'URGENT', issues: ['Flood', 'Gas smell', 'No power', 'Lockout'], position: 5 },
      { key: 'other', label: 'Other', icon: 'plus', color: 'slate', urgent: false, team: 'Front office', defaultPriority: null, issues: [], position: 6 },
    ],
  },
  logistics: {
    key: 'logistics',
    vertical: 'Logistics / Delivery',
    entityLabel: 'Order',
    contactLabel: 'Support',
    accent: 'orange',
    features: { photos: true, access: false, preferredTime: false, location: false, contact: true, community: true, messages: true, ratings: true },
    categories: [
      { key: 'not_arrived', label: 'Not Arrived', icon: 'inbox', color: 'red', urgent: true, team: 'Dispatch', defaultPriority: 'HIGH', issues: ['Marked delivered, not received', 'Still in transit', 'Never shipped'], position: 0 },
      { key: 'damaged', label: 'Damaged Item', icon: 'package', color: 'amber', urgent: false, team: 'Claims team', defaultPriority: null, issues: ['Crushed box', 'Broken item', 'Water damage'], position: 1 },
      { key: 'wrong_item', label: 'Wrong Item', icon: 'shuffle', color: 'purple', urgent: false, team: 'Claims team', defaultPriority: null, issues: ['Different product', 'Wrong size', 'Wrong colour'], position: 2 },
      { key: 'missing_item', label: 'Missing Item', icon: 'help', color: 'blue', urgent: false, team: 'Claims team', defaultPriority: null, issues: ['Part of order missing', 'Empty package'], position: 3 },
      { key: 'late', label: 'Late Delivery', icon: 'clock', color: 'cyan', urgent: false, team: 'Dispatch', defaultPriority: null, issues: ['Past the window', 'No update'], position: 4 },
      { key: 'other', label: 'Other', icon: 'plus', color: 'slate', urgent: false, team: 'Support', defaultPriority: null, issues: [], position: 5 },
    ],
  },
  workplace: {
    key: 'workplace',
    vertical: 'Workplace / Facilities',
    entityLabel: 'Workspace',
    contactLabel: 'Facilities',
    accent: 'cyan',
    features: { photos: true, access: false, preferredTime: true, location: true, contact: false, community: true, messages: true, ratings: true },
    categories: [
      { key: 'hvac', label: 'HVAC', icon: 'thermometer', color: 'cyan', urgent: false, team: 'Facilities', defaultPriority: null, issues: ['Too hot', 'Too cold', 'No airflow'], position: 0 },
      { key: 'lighting', label: 'Lighting', icon: 'bulb', color: 'amber', urgent: false, team: 'Electrical', defaultPriority: null, issues: ['Flickering', 'Out', 'Too dim'], position: 1 },
      { key: 'restroom', label: 'Restroom', icon: 'shower', color: 'blue', urgent: false, team: 'Cleaning', defaultPriority: null, issues: ['Out of supplies', 'Leak', 'Not clean'], position: 2 },
      { key: 'safety', label: 'Safety', icon: 'shield', color: 'red', urgent: true, team: 'EHS', defaultPriority: 'URGENT', issues: ['Blocked exit', 'Spill', 'Alarm fault'], position: 3 },
      { key: 'it_network', label: 'IT / Network', icon: 'monitor', color: 'indigo', urgent: false, team: 'IT desk', defaultPriority: null, issues: ['No Wi-Fi', 'Monitor dead', 'Cable missing'], position: 4 },
      { key: 'other', label: 'Other', icon: 'plus', color: 'slate', urgent: false, team: 'Facilities', defaultPriority: null, issues: [], position: 5 },
    ],
  },
};

export const PORTAL_TEMPLATE_KEYS = Object.keys(PORTAL_TEMPLATES);
