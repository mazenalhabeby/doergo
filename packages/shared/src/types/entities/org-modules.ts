/** The organization's modules: the catalogue, groups, dependencies, presets, a workspace's effective set, client stages. */

// ==================== ORGANIZATION MODULES ====================

/** Available optional modules that admins can enable per organization or space */
export const AVAILABLE_MODULES = [
  // Task sections
  { key: 'subtasks', label: 'Subtasks', description: 'Break tasks into smaller child tasks', group: 'task' },
  { key: 'checklists', label: 'Checklists', description: 'Add step-by-step checklists to tasks', group: 'task' },
  { key: 'attachments', label: 'Attachments', description: 'Upload files and images to tasks', group: 'task' },
  { key: 'dependencies', label: 'Dependencies', description: 'Define task sequencing and blockers', group: 'task' },
  { key: 'custom_fields', label: 'Custom Fields', description: 'Add custom data fields to tasks', group: 'task' },
  // Field service
  { key: 'tracking', label: 'Route Tracking', description: 'GPS tracking, route visualization, and progress card', group: 'field' },
  { key: 'service_reports', label: 'Service Reports', description: 'Completion reports with photos and signatures', group: 'field' },
  { key: 'time_tracking', label: 'Time Tracking', description: 'Track estimated and actual hours', group: 'field' },
  // Assets belong to a SPACE: each space defines its own kinds (apartments,
  // vehicles, machines) and holds its own. Nothing is shared between spaces.
  { key: 'assets', label: 'Assets', description: 'Track what this space owns — apartments, vehicles, machines', group: 'field' },
  // Agile
  { key: 'sprints', label: 'Sprints', description: 'Organize work into time-boxed iterations', group: 'agile' },
  { key: 'story_points', label: 'Story Points', description: 'Estimate task complexity with fibonacci points', group: 'agile' },
  { key: 'epics', label: 'Epics', description: 'Group related tasks into larger projects', group: 'agile' },
  { key: 'phases', label: 'Phases', description: 'Organize tasks into project phases', group: 'agile' },
  // Clients (customer records + optional app access)
  { key: 'crm', label: 'CRM', description: 'Customer records, info & history; sales works them with tasks (calls, visits)', group: 'clients' },
  { key: 'b2c_portal', label: 'B2C Portal', description: 'Invite a customer to the app to make orders & follow their jobs', group: 'clients' },
  // Collaboration
  { key: 'space_sharing', label: 'Space Sharing', description: 'Share this space with another organisation (view / contribute / control)', group: 'collaboration' },
] as const;

/**
 * Translation keys for the module catalogue.
 *
 * The `label` and `description` on AVAILABLE_MODULES are the ENGLISH SOURCE, not
 * display strings — they were being rendered straight to the screen, so the
 * Modules tab and every module name in the workflow editor read in English
 * whatever language the app was set to.
 *
 * Derived from the key rather than listed, so adding a module cannot forget to
 * add its key, and the English literal is passed as `defaultValue` — a missing
 * translation degrades to English instead of showing `modules.sprints.label`.
 */
export const moduleI18n = {
  label: (key: string) => `modules.${key}.label`,
  description: (key: string) => `modules.${key}.description`,
  groupLabel: (key: string) => `modules.groups.${key}.label`,
  groupDescription: (key: string) => `modules.groups.${key}.description`,
  presetLabel: (key: string) => `modules.presets.${key}`,
} as const;

/** Display groups for the module catalog. */
export const MODULE_GROUPS = [
  { key: 'task', label: 'Task sections', description: 'Extra detail inside a task' },
  { key: 'field', label: 'Field service', description: 'On-site / mobile work' },
  { key: 'agile', label: 'Project / Agile', description: 'Project-style planning' },
  { key: 'clients', label: 'Clients', description: 'Customers & client-facing portal' },
  { key: 'collaboration', label: 'Collaboration', description: 'Work across teams & organisations' },
] as const;

/**
 * Module dependencies: a module can only be enabled if its prerequisites are too
 * (and disabling a prerequisite auto-disables its dependents). Enforced in the
 * space Modules tab UI AND server-side when persisting a space's modules.
 * B2C Portal invites customers, so it requires CRM. It does NOT require Apartments
 * — a portal's entity may be Order/Workspace/etc. Apartments is an independent
 * module (member housing + apartment catalog) and is only auto-enabled when a
 * portal is created/switched to the Apartment (rental) entity (see portal.service).
 */
export const MODULE_DEPENDENCIES: Record<string, string[]> = {
  b2c_portal: ['crm'],
};

/** Prerequisite module keys for a module (empty if none). */
export function moduleRequires(key: string): string[] {
  return MODULE_DEPENDENCIES[key] ?? [];
}

/** CRM customer lifecycle stages (Customer.status). key is stored; label/tone shown. */
export const CUSTOMER_STAGES = [
  { key: 'LEAD', label: 'Lead', tone: 'slate' },
  { key: 'CONTACTED', label: 'Contacted', tone: 'blue' },
  { key: 'QUALIFIED', label: 'Qualified', tone: 'violet' },
  { key: 'CUSTOMER', label: 'Customer', tone: 'green' },
  { key: 'INACTIVE', label: 'Inactive', tone: 'gray' },
] as const;

export type CustomerStageKey = (typeof CUSTOMER_STAGES)[number]['key'];

export function customerStageLabel(key: string): string {
  return CUSTOMER_STAGES.find((s) => s.key === key)?.label ?? key;
}

/**
 * Normalize a set of enabled modules so all dependencies hold: drop any module
 * whose prerequisites aren't all present. Idempotent; used on save (client+server).
 */
export function resolveModuleDependencies(modules: string[]): string[] {
  const set = new Set(modules);
  let changed = true;
  while (changed) {
    changed = false;
    for (const key of Array.from(set)) {
      if (moduleRequires(key).some((req) => !set.has(req))) {
        set.delete(key);
        changed = true;
      }
    }
  }
  return Array.from(set);
}

/**
 * The modules in force for a workspace: its own set when it has one, else the
 * organization's, else none. ONE rule — task-service's effective-modules read,
 * the gateway's module cache and the job report all mean exactly this.
 */
export function effectiveSpaceModules(spaceModules: unknown, orgModules: unknown): string[] {
  if (Array.isArray(spaceModules)) return spaceModules.filter((m): m is string => typeof m === 'string');
  if (Array.isArray(orgModules)) return orgModules.filter((m): m is string => typeof m === 'string');
  return [];
}

/** One-click module bundles by business type. */
export const MODULE_PRESETS: { key: string; label: string; modules: string[] }[] = [
  { key: 'field_service', label: 'Field Service', modules: ['subtasks', 'checklists', 'attachments', 'tracking', 'service_reports', 'time_tracking'] },
  { key: 'logistics', label: 'Logistics', modules: ['subtasks', 'checklists', 'attachments', 'tracking', 'time_tracking'] },
  { key: 'project', label: 'Project / Agile', modules: ['subtasks', 'checklists', 'attachments', 'dependencies', 'custom_fields', 'time_tracking', 'sprints', 'story_points', 'epics', 'phases'] },
  { key: 'minimal', label: 'Minimal', modules: ['checklists', 'attachments'] },
  { key: 'everything', label: 'Everything', modules: ['subtasks', 'checklists', 'attachments', 'dependencies', 'custom_fields', 'tracking', 'service_reports', 'time_tracking', 'sprints', 'story_points', 'epics', 'phases'] },
];

/** Union type of all available module keys */
export type ModuleKey = (typeof AVAILABLE_MODULES)[number]['key'];
