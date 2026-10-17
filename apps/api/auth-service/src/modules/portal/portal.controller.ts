import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import type { SpaceScopeIds } from '@hbcfield/shared';
import { PortalService } from './portal.service';
import { SpacePortalService } from './space-portal.service';
import { PortalUnitsService } from './portal-units.service';
import { UnitWriteService } from './unit-write.service';
import { PortalClientsService } from './portal-clients.service';
import { PortalCategoriesService } from './portal-categories.service';

/*
  `scopeSpaceIds` on an office payload = the workspaces in which the caller holds
  the portal key the gateway route asked for (undefined/null = org-wide, [] =
  nowhere). It is built from the verified session in the gateway
  (`portalScope`), never from a request body, and the service narrows every
  query to it — the guard alone only knows the key is held SOMEWHERE.
*/
type Scoped = { scopeSpaceIds?: SpaceScopeIds };

@Controller()
export class PortalController {
  constructor(
    private readonly portalService: PortalService,
    private readonly categories: PortalCategoriesService,
    private readonly portalClients: PortalClientsService,
    private readonly unitWrite: UnitWriteService,
    private readonly units: PortalUnitsService,
    private readonly spacePortals: SpacePortalService,
  ) {}

  // ── Portals (office) ──

  @MessagePattern({ cmd: 'portal_list' })
  listPortals(@Payload() data: { organizationId: string; spaceId?: string } & Scoped) {
    return this.portalService.listPortals(data);
  }

  @MessagePattern({ cmd: 'portal_create' })
  createPortal(@Payload() data: { organizationId: string; templateKey?: string; name?: string }) {
    return this.spacePortals.createPortal(data);
  }

  @MessagePattern({ cmd: 'portal_create_space' })
  createSpacePortal(@Payload() data: { organizationId: string; spaceId: string; templateKey?: string; name?: string }) {
    return this.spacePortals.createSpacePortal(data);
  }

  @MessagePattern({ cmd: 'portal_get' })
  getPortal(@Payload() data: { id: string; organizationId: string } & Scoped) {
    return this.portalService.getPortal(data);
  }

  @MessagePattern({ cmd: 'portal_ensure_for_space' })
  ensurePortalForSpace(@Payload() data: { organizationId: string; spaceId: string; name?: string }) {
    return this.spacePortals.ensurePortalForSpace(data);
  }

  @MessagePattern({ cmd: 'portal_get_for_space' })
  getSpacePortal(@Payload() data: { organizationId: string; spaceId: string; mayCreate?: boolean }) {
    return this.spacePortals.getSpacePortal(data);
  }

  @MessagePattern({ cmd: 'portal_update_for_space' })
  updateSpacePortal(@Payload() data: { organizationId: string; spaceId: string; templateKey?: string }) {
    return this.spacePortals.updateSpacePortal(data);
  }

  @MessagePattern({ cmd: 'portal_get_unit' })
  getUnit(@Payload() data: { id: string; organizationId: string; scopeSpaceIds?: string[] }) {
    return this.units.getUnit(data);
  }

  @MessagePattern({ cmd: 'portal_list_unit_activities' })
  listUnitActivities(@Payload() data: { id: string; organizationId: string; scopeSpaceIds?: string[] }) {
    return this.units.listUnitActivities(data);
  }

  @MessagePattern({ cmd: 'portal_add_unit_activity' })
  addUnitActivity(@Payload() data: { id: string; organizationId: string; body?: string; authorId?: string } & Scoped) {
    return this.units.addUnitActivity(data);
  }

  @MessagePattern({ cmd: 'portal_list_space_units' })
  listSpaceUnits(@Payload() data: { organizationId: string; spaceId: string }) {
    return this.spacePortals.listSpaceUnits(data);
  }

  @MessagePattern({ cmd: 'portal_update' })
  updatePortal(@Payload() data: any) {
    return this.portalService.updatePortal(data);
  }

  @MessagePattern({ cmd: 'portal_delete' })
  deletePortal(@Payload() data: { id: string; organizationId: string } & Scoped) {
    return this.portalService.deletePortal(data);
  }

  // ── Config for the mobile customer (their own portal) ──

  @MessagePattern({ cmd: 'portal_config_for_customer' })
  getConfigForCustomer(@Payload() data: { customerId: string }) {
    return this.portalService.getConfigForCustomer(data);
  }

  // ── Units ──

  @MessagePattern({ cmd: 'portal_list_units' })
  listUnits(@Payload() data: { organizationId: string; customerId: string }) {
    return this.units.listCustomerUnits(data);
  }

  @MessagePattern({ cmd: 'portal_list_assets' })
  async listAssets(@Payload() data: any) {
    return this.units.listAssets(data);
  }

  @MessagePattern({ cmd: 'portal_admin_list_units' })
  adminListUnits(@Payload() data: { organizationId: string; customerId?: string } & Scoped) {
    return this.units.listUnits(data);
  }

  @MessagePattern({ cmd: 'portal_create_unit' })
  createUnit(@Payload() data: any) {
    return this.unitWrite.createUnit(data);
  }

  @MessagePattern({ cmd: 'portal_update_unit' })
  updateUnit(@Payload() data: any) {
    return this.unitWrite.updateUnit(data);
  }

  @MessagePattern({ cmd: 'portal_set_primary_unit' })
  setPrimaryUnit(@Payload() data: { id: string; organizationId: string; scopeSpaceId?: string }) {
    return this.units.setPrimaryUnit(data);
  }

  @MessagePattern({ cmd: 'portal_set_member_apartment' })
  setMemberApartment(@Payload() data: { organizationId: string; spaceId: string; userId: string; unitId?: string | null; actorId?: string }) {
    return this.unitWrite.setMemberApartment(data);
  }

  @MessagePattern({ cmd: 'portal_delete_unit' })
  deleteUnit(@Payload() data: { id: string; organizationId: string; scopeSpaceId?: string } & Scoped) {
    return this.unitWrite.deleteUnit(data);
  }

  @MessagePattern({ cmd: 'portal_remove_client' })
  removePortalClient(@Payload() data: { organizationId: string; customerId: string } & Scoped) {
    return this.portalClients.removePortalClient(data);
  }

  @MessagePattern({ cmd: 'portal_list_available_units' })
  listAvailableUnitsForPortal(@Payload() data: { organizationId: string; portalId: string } & Scoped) {
    return this.portalClients.listAvailableUnitsForPortal(data);
  }

  @MessagePattern({ cmd: 'portal_list_assignable_customers' })
  listAssignableCustomersForPortal(@Payload() data: { organizationId: string; portalId: string } & Scoped) {
    return this.portalClients.listAssignableCustomersForPortal(data);
  }

  /** Is this portal / client / unit in the caller's reach? 404 when not (see the service). */
  @MessagePattern({ cmd: 'portal_assert_reach' })
  assertPortalReach(
    @Payload() data: { organizationId: string; portalId?: string; customerId?: string; unitId?: string } & Scoped,
  ) {
    return this.portalService.assertPortalReach(data);
  }

  // ── Intake category editor (per portal) ──

  @MessagePattern({ cmd: 'portal_create_category' })
  createCategory(@Payload() data: any) {
    return this.categories.createCategory(data);
  }

  @MessagePattern({ cmd: 'portal_update_category' })
  updateCategory(@Payload() data: any) {
    return this.categories.updateCategory(data);
  }

  @MessagePattern({ cmd: 'portal_delete_category' })
  deleteCategory(@Payload() data: { id: string; organizationId: string } & Scoped) {
    return this.categories.deleteCategory(data);
  }

  @MessagePattern({ cmd: 'portal_reorder_categories' })
  reorderCategories(@Payload() data: { organizationId: string; portalId: string; orderedIds: string[] } & Scoped) {
    return this.categories.reorderCategories(data);
  }
}
