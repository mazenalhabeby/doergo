/** ACCESS_PERMISSION_SCHEMA — moved here unchanged from keys.ts; its entries are in two files, in order. */
import type { AccessPermissionKey, PermissionDomain, PermissionGrantScope } from './keys';
import { SCHEMA_FIRST } from './schema-first';

/** One permission's metadata — moved here unchanged from keys.ts. */
export type PermissionSchemaEntry = {
  key: AccessPermissionKey;
  label: string;
  description: string;
  domain: PermissionDomain;
  /** Scopes where granting this permission is meaningful. */
  scopes: PermissionGrantScope[];
  /**
   * May an EXTERNAL member hold it (in a space)? Opt-in per key, on purpose: a
   * permission added later is refused to outsiders until somebody decides
   * otherwise here, in a diff.
   */
  external?: true;
};

/** Human-facing metadata for every permission — drives the role-builder UI. */
export const ACCESS_PERMISSION_SCHEMA: PermissionSchemaEntry[] = [
  ...SCHEMA_FIRST,
  {
    key: 'crmManageClients',
    label: 'Manage clients',
    description: 'Reassign ownership and delete/archive clients',
    domain: 'crm',
    scopes: ['org', 'space'],
    external: true,
  },
  {
    key: 'canManageInvoices',
    label: 'Customer invoices',
    description: 'Open customer invoicing and see what has been billed',
    domain: 'billing',
    scopes: ['org'],
  },
  {
    key: 'canViewLabourCost',
    label: 'Labour cost and margin',
    description: 'See what an hour costs as well as what it bills at',
    domain: 'billing',
    scopes: ['org'],
  },
  {
    key: 'canViewAssets',
    label: 'View assets',
    description: 'See equipment, vehicles and their history',
    domain: 'assets',
    scopes: ['org', 'space'],
    external: true,
  },
  {
    key: 'canLogAssets',
    label: 'Log asset use',
    description: 'Record use, fuel and expenses against equipment',
    domain: 'assets',
    scopes: ['org', 'space'],
    external: true,
  },
  {
    key: 'canManageAssets',
    label: 'Manage assets',
    description: 'Delete assets and record money against them',
    domain: 'assets',
    scopes: ['org', 'space'],
    external: true,
  },
  {
    key: 'canManageWorkspaces',
    label: 'Manage workspaces',
    description: 'Create, configure, archive and share workspaces',
    domain: 'workspaces',
    scopes: ['org'],
  },
  {
    key: 'canViewPortal',
    label: 'View portal requests',
    description: 'See the requests clients send through the portal',
    domain: 'portal',
    scopes: ['org', 'space'],
    external: true,
  },
  {
    key: 'canAnswerPortal',
    label: 'Answer portal requests',
    description: 'Reply to portal requests and change their status',
    domain: 'portal',
    scopes: ['org', 'space'],
    external: true,
  },
  {
    key: 'canManagePortals',
    label: 'Manage client portals',
    description: 'Create and configure the portals customers log in to',
    domain: 'portal',
    scopes: ['org', 'space'],
    external: true,
  },
  {
    key: 'canManageTaskTypes',
    label: 'Manage task types',
    description: 'Define task types, statuses and how work flows through them',
    domain: 'tasks',
    scopes: ['org'],
  },
  {
    key: 'canViewTracking',
    label: 'View location tracking',
    description: 'See where field staff are and the routes they travelled',
    domain: 'tracking',
    scopes: ['org', 'space'],
    external: true,
  },
  // Personnel file. Org scope only: a document belongs to a PERSON, not to a
  // site, so granting it per space would say "you may read their payslip while
  // they are working in Laakirchen", which is not a thing anyone means.
  {
    key: 'canViewMemberDocuments',
    label: 'See member documents',
    description: 'See that a member has documents — names and dates only, never the ' + 'contents',
    domain: 'documents',
    scopes: ['org'],
  },
  {
    key: 'canOpenMemberDocuments',
    label: 'Open member documents',
    description: 'Open and download another member’s documents, including payslips',
    domain: 'documents',
    scopes: ['org'],
  },
  {
    key: 'canIssueDocuments',
    label: 'Issue documents',
    description: 'Upload and publish documents to members, and withdraw them',
    domain: 'documents',
    scopes: ['org'],
  },
  {
    key: 'canManageDocumentTemplates',
    label: 'Manage document types',
    description: 'Define document types, contract templates and retention rules',
    domain: 'documents',
    scopes: ['org'],
  },
  {
    key: 'canManageDocumentVisibility',
    label: 'Choose who sees a document',
    description: 'Hide a document from the member it belongs to, or limit it to certain ' + 'roles',
    domain: 'documents',
    scopes: ['org'],
  },
  {
    key: 'canReplaceDocuments',
    label: 'Replace documents',
    description: 'Swap a document for a new version and ask for signature again',
    domain: 'documents',
    scopes: ['org'],
  },
  {
    key: 'canDeleteDocuments',
    label: 'Delete documents',
    description: 'Erase documents for good, including signed ones',
    domain: 'documents',
    scopes: ['org'],
  },
];
