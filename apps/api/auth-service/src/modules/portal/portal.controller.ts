import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { PortalService } from './portal.service';
import { SpacePortalService } from './space-portal.service';
import { PortalUnitsService } from './portal-units.service';
import { UnitWriteService } from './unit-write.service';
import { PortalClientsService } from './portal-clients.service';
import { PortalCategoriesService } from './portal-categories.service';

import {
  pattern,
  portalList,
  portalCreate,
  portalCreateSpace,
  portalGet,
  portalEnsureForSpace,
  portalGetForSpace,
  portalUpdateForSpace,
  portalGetUnit,
  portalListUnitActivities,
  portalAddUnitActivity,
  portalListSpaceUnits,
  portalUpdate,
  portalDelete,
  portalConfigForCustomer,
  portalListUnits,
  portalListAssets,
  portalAdminListUnits,
  portalCreateUnit,
  portalUpdateUnit,
  portalSetPrimaryUnit,
  portalSetMemberApartment,
  portalDeleteUnit,
  portalRemoveClient,
  portalListAvailableUnits,
  portalListAssignableCustomers,
  portalAssertReach,
  portalCreateCategory,
  portalUpdateCategory,
  portalDeleteCategory,
  portalReorderCategories,
  type RpcRequest,
} from '@hbcfield/shared/microservices';
/*
  `scopeSpaceIds` on an office payload = the workspaces in which the caller holds
  the portal key the gateway route asked for (undefined/null = org-wide, [] =
  nowhere). It is built from the verified session in the gateway
  (`portalScope`), never from a request body, and the service narrows every
  query to it — the guard alone only knows the key is held SOMEWHERE.
*/

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

  @MessagePattern(pattern(portalList))
  listPortals(@Payload() data: RpcRequest<typeof portalList>) {
    return this.portalService.listPortals(data);
  }

  @MessagePattern(pattern(portalCreate))
  createPortal(@Payload() data: RpcRequest<typeof portalCreate>) {
    return this.spacePortals.createPortal(data);
  }

  @MessagePattern(pattern(portalCreateSpace))
  createSpacePortal(@Payload() data: RpcRequest<typeof portalCreateSpace>) {
    return this.spacePortals.createSpacePortal(data);
  }

  @MessagePattern(pattern(portalGet))
  getPortal(@Payload() data: RpcRequest<typeof portalGet>) {
    return this.portalService.getPortal(data);
  }

  @MessagePattern(pattern(portalEnsureForSpace))
  ensurePortalForSpace(@Payload() data: RpcRequest<typeof portalEnsureForSpace>) {
    return this.spacePortals.ensurePortalForSpace(data);
  }

  @MessagePattern(pattern(portalGetForSpace))
  getSpacePortal(@Payload() data: RpcRequest<typeof portalGetForSpace>) {
    return this.spacePortals.getSpacePortal(data);
  }

  @MessagePattern(pattern(portalUpdateForSpace))
  updateSpacePortal(@Payload() data: RpcRequest<typeof portalUpdateForSpace>) {
    return this.spacePortals.updateSpacePortal(data);
  }

  @MessagePattern(pattern(portalGetUnit))
  getUnit(@Payload() data: RpcRequest<typeof portalGetUnit>) {
    return this.units.getUnit(data);
  }

  @MessagePattern(pattern(portalListUnitActivities))
  listUnitActivities(@Payload() data: RpcRequest<typeof portalListUnitActivities>) {
    return this.units.listUnitActivities(data);
  }

  @MessagePattern(pattern(portalAddUnitActivity))
  addUnitActivity(@Payload() data: RpcRequest<typeof portalAddUnitActivity>) {
    return this.units.addUnitActivity(data);
  }

  @MessagePattern(pattern(portalListSpaceUnits))
  listSpaceUnits(@Payload() data: RpcRequest<typeof portalListSpaceUnits>) {
    return this.spacePortals.listSpaceUnits(data);
  }

  @MessagePattern(pattern(portalUpdate))
  updatePortal(@Payload() data: RpcRequest<typeof portalUpdate>) {
    return this.portalService.updatePortal(data);
  }

  @MessagePattern(pattern(portalDelete))
  deletePortal(@Payload() data: RpcRequest<typeof portalDelete>) {
    return this.portalService.deletePortal(data);
  }

  // ── Config for the mobile customer (their own portal) ──

  @MessagePattern(pattern(portalConfigForCustomer))
  getConfigForCustomer(@Payload() data: RpcRequest<typeof portalConfigForCustomer>) {
    return this.portalService.getConfigForCustomer(data);
  }

  // ── Units ──

  @MessagePattern(pattern(portalListUnits))
  listUnits(@Payload() data: RpcRequest<typeof portalListUnits>) {
    return this.units.listCustomerUnits(data);
  }

  @MessagePattern(pattern(portalListAssets))
  async listAssets(@Payload() data: RpcRequest<typeof portalListAssets>) {
    return this.units.listAssets(data);
  }

  @MessagePattern(pattern(portalAdminListUnits))
  adminListUnits(@Payload() data: RpcRequest<typeof portalAdminListUnits>) {
    return this.units.listUnits(data);
  }

  @MessagePattern(pattern(portalCreateUnit))
  createUnit(@Payload() data: RpcRequest<typeof portalCreateUnit>) {
    return this.unitWrite.createUnit(data);
  }

  @MessagePattern(pattern(portalUpdateUnit))
  updateUnit(@Payload() data: RpcRequest<typeof portalUpdateUnit>) {
    return this.unitWrite.updateUnit(data);
  }

  @MessagePattern(pattern(portalSetPrimaryUnit))
  setPrimaryUnit(@Payload() data: RpcRequest<typeof portalSetPrimaryUnit>) {
    return this.units.setPrimaryUnit(data);
  }

  @MessagePattern(pattern(portalSetMemberApartment))
  setMemberApartment(@Payload() data: RpcRequest<typeof portalSetMemberApartment>) {
    return this.unitWrite.setMemberApartment(data);
  }

  @MessagePattern(pattern(portalDeleteUnit))
  deleteUnit(@Payload() data: RpcRequest<typeof portalDeleteUnit>) {
    return this.unitWrite.deleteUnit(data);
  }

  @MessagePattern(pattern(portalRemoveClient))
  removePortalClient(@Payload() data: RpcRequest<typeof portalRemoveClient>) {
    return this.portalClients.removePortalClient(data);
  }

  @MessagePattern(pattern(portalListAvailableUnits))
  listAvailableUnitsForPortal(@Payload() data: RpcRequest<typeof portalListAvailableUnits>) {
    return this.portalClients.listAvailableUnitsForPortal(data);
  }

  @MessagePattern(pattern(portalListAssignableCustomers))
  listAssignableCustomersForPortal(@Payload() data: RpcRequest<typeof portalListAssignableCustomers>) {
    return this.portalClients.listAssignableCustomersForPortal(data);
  }

  /** Is this portal / client / unit in the caller's reach? 404 when not (see the service). */
  @MessagePattern(pattern(portalAssertReach))
  assertPortalReach(@Payload() data: RpcRequest<typeof portalAssertReach>) {
    return this.portalService.assertPortalReach(data);
  }

  // ── Intake category editor (per portal) ──

  @MessagePattern(pattern(portalCreateCategory))
  createCategory(@Payload() data: RpcRequest<typeof portalCreateCategory>) {
    return this.categories.createCategory(data);
  }

  @MessagePattern(pattern(portalUpdateCategory))
  updateCategory(@Payload() data: RpcRequest<typeof portalUpdateCategory>) {
    return this.categories.updateCategory(data);
  }

  @MessagePattern(pattern(portalDeleteCategory))
  deleteCategory(@Payload() data: RpcRequest<typeof portalDeleteCategory>) {
    return this.categories.deleteCategory(data);
  }

  @MessagePattern(pattern(portalReorderCategories))
  reorderCategories(@Payload() data: RpcRequest<typeof portalReorderCategories>) {
    return this.categories.reorderCategories(data);
  }
}
