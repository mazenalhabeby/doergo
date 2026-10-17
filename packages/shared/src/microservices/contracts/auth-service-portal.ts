/** Message contracts for auth-service `portal` handlers (types only — the wire is the cmd string). */
import { rpc } from '../contract';
import type { SpaceScopeIds } from '../../access/space-scope';
import type { CrmCaller } from './auth-service-customers';

export type Scoped = { scopeSpaceIds?: SpaceScopeIds };

export const portalList = rpc<{ organizationId: string; spaceId?: string } & Scoped>('portal_list');
export const portalCreate = rpc<{ organizationId: string; templateKey?: string; name?: string }>('portal_create');
export const portalCreateSpace = rpc<{ organizationId: string; spaceId: string; templateKey?: string; name?: string }>(
  'portal_create_space',
);
export const portalGet = rpc<{ id: string; organizationId: string } & Scoped>('portal_get');
export const portalEnsureForSpace = rpc<{ organizationId: string; spaceId: string; name?: string }>(
  'portal_ensure_for_space',
);
export const portalGetForSpace = rpc<{ organizationId: string; spaceId: string; mayCreate?: boolean }>(
  'portal_get_for_space',
);
export const portalUpdateForSpace = rpc<{ organizationId: string; spaceId: string; templateKey?: string }>(
  'portal_update_for_space',
);
export const portalGetUnit = rpc<{ id: string; organizationId: string; scopeSpaceIds?: string[] }>('portal_get_unit');
export const portalListUnitActivities = rpc<{ id: string; organizationId: string; scopeSpaceIds?: string[] }>(
  'portal_list_unit_activities',
);
export const portalAddUnitActivity = rpc<
  { id: string; organizationId: string; body?: string; authorId?: string } & Scoped
>('portal_add_unit_activity');
export const portalListSpaceUnits = rpc<{ organizationId: string; spaceId: string }>('portal_list_space_units');
export const portalUpdate = rpc<{
  id: string;
  organizationId: string;
  name?: string;
  templateKey?: string;
  reseed?: boolean;
  coverImageUrl?: string | null;
  spaceId?: string | null;
  scopeSpaceIds?: SpaceScopeIds;
}>('portal_update');
export const portalDelete = rpc<{ id: string; organizationId: string } & Scoped>('portal_delete');
export const portalConfigForCustomer = rpc<{ customerId: string }>('portal_config_for_customer');
export const portalListUnits = rpc<{ organizationId: string; customerId: string }>('portal_list_units');
export const portalListAssets = rpc<{ organizationId: string; customerId?: string; assetId?: string | null }>(
  'portal_list_assets',
);
export const portalAdminListUnits = rpc<{ organizationId: string; customerId?: string } & Scoped>(
  'portal_admin_list_units',
);
export const portalCreateUnit = rpc<{
  organizationId: string;
  customerId?: string;
  portalId?: string;
  name: string;
  label?: string;
  address?: string;
  lat?: number | null;
  lng?: number | null;
  isPrimary?: boolean;
  spaceId?: string;
  contactName?: string | null;
  contactPhone?: string | null;
  residentUserId?: string | null;
  details?: any[];
  actorId?: string;
  crmCaller?: CrmCaller; // set by the CRM address routes only — see assertClientAddressesEditable
  scopeSpaceIds?: SpaceScopeIds; // set by the portal routes — the workspaces the caller runs portals in
}>('portal_create_unit');
export const portalUpdateUnit = rpc<{
  id: string;
  organizationId: string;
  name?: string;
  label?: string | null;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  isPrimary?: boolean;
  spaceId?: string | null;
  portalId?: string | null;
  customerId?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  residentUserId?: string | null;
  details?: any[];
  actorId?: string;
  scopeCustomerId?: string; // when set, the unit must belong to this customer
  /**
   * Set by the workspace routes (`spaces/:spaceId/units/:unitId`): the unit
   * must belong to THAT workspace. Checked against the org only, a manager of
   * one workspace could edit any apartment in the organization by putting its
   * id under the path of the workspace they do manage.
   */
  scopeSpaceId?: string;
  crmCaller?: CrmCaller; // set by the CRM address routes only — see assertClientAddressesEditable
  /** The workspaces the caller runs portals in — the unit AND whatever it is moved to must be in them. */
  scopeSpaceIds?: SpaceScopeIds;
}>('portal_update_unit');
export const portalSetPrimaryUnit = rpc<{
  id: string;
  organizationId: string;
  customerId?: string;
  crmCaller?: CrmCaller;
  scopeSpaceId?: string;
}>('portal_set_primary_unit');
export const portalSetMemberApartment = rpc<{
  organizationId: string;
  spaceId: string;
  userId: string;
  unitId?: string | null;
  actorId?: string;
}>('portal_set_member_apartment');
export const portalDeleteUnit = rpc<
  { id: string; organizationId: string; customerId?: string; scopeSpaceId?: string; crmCaller?: CrmCaller } & Scoped
>('portal_delete_unit');
export const portalRemoveClient = rpc<{ organizationId: string; customerId: string } & Scoped>('portal_remove_client');
export const portalListAvailableUnits = rpc<{ organizationId: string; portalId: string } & Scoped>(
  'portal_list_available_units',
);
export const portalListAssignableCustomers = rpc<{ organizationId: string; portalId: string } & Scoped>(
  'portal_list_assignable_customers',
);
export const portalAssertReach = rpc<
  { organizationId: string; portalId?: string; customerId?: string; unitId?: string } & Scoped
>('portal_assert_reach');
export const portalCreateCategory = rpc<{
  organizationId: string;
  portalId: string;
  key: string;
  label: string;
  icon?: string;
  color?: string;
  urgent?: boolean;
  team?: string;
  defaultPriority?: string;
  issues?: string[];
  position?: number;
  spaceId?: string;
  scopeSpaceIds?: SpaceScopeIds;
}>('portal_create_category');
export const portalUpdateCategory = rpc<{
  id: string;
  organizationId: string;
  label?: string;
  icon?: string | null;
  color?: string | null;
  urgent?: boolean;
  team?: string | null;
  defaultPriority?: string | null;
  issues?: string[];
  isActive?: boolean;
  spaceId?: string | null;
  scopeSpaceIds?: SpaceScopeIds;
}>('portal_update_category');
export const portalDeleteCategory = rpc<{ id: string; organizationId: string } & Scoped>('portal_delete_category');
export const portalReorderCategories = rpc<{ organizationId: string; portalId: string; orderedIds: string[] } & Scoped>(
  'portal_reorder_categories',
);
