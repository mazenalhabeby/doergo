import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { PortalService } from './portal.service';

@Controller()
export class PortalController {
  constructor(private readonly portalService: PortalService) {}

  // ── Portals (office) ──

  @MessagePattern({ cmd: 'portal_list' })
  listPortals(@Payload() data: { organizationId: string }) {
    return this.portalService.listPortals(data);
  }

  @MessagePattern({ cmd: 'portal_create' })
  createPortal(@Payload() data: { organizationId: string; templateKey?: string; name?: string }) {
    return this.portalService.createPortal(data);
  }

  @MessagePattern({ cmd: 'portal_get' })
  getPortal(@Payload() data: { id: string; organizationId: string }) {
    return this.portalService.getPortal(data);
  }

  @MessagePattern({ cmd: 'portal_ensure_for_space' })
  ensurePortalForSpace(@Payload() data: { organizationId: string; spaceId: string; name?: string }) {
    return this.portalService.ensurePortalForSpace(data);
  }

  @MessagePattern({ cmd: 'portal_update' })
  updatePortal(@Payload() data: any) {
    return this.portalService.updatePortal(data);
  }

  @MessagePattern({ cmd: 'portal_delete' })
  deletePortal(@Payload() data: { id: string; organizationId: string }) {
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
    return this.portalService.listCustomerUnits(data);
  }

  @MessagePattern({ cmd: 'portal_admin_list_units' })
  adminListUnits(@Payload() data: { organizationId: string; customerId?: string }) {
    return this.portalService.listUnits(data);
  }

  @MessagePattern({ cmd: 'portal_create_unit' })
  createUnit(@Payload() data: any) {
    return this.portalService.createUnit(data);
  }

  @MessagePattern({ cmd: 'portal_update_unit' })
  updateUnit(@Payload() data: any) {
    return this.portalService.updateUnit(data);
  }

  @MessagePattern({ cmd: 'portal_delete_unit' })
  deleteUnit(@Payload() data: { id: string; organizationId: string }) {
    return this.portalService.deleteUnit(data);
  }

  // ── Intake category editor (per portal) ──

  @MessagePattern({ cmd: 'portal_create_category' })
  createCategory(@Payload() data: any) {
    return this.portalService.createCategory(data);
  }

  @MessagePattern({ cmd: 'portal_update_category' })
  updateCategory(@Payload() data: any) {
    return this.portalService.updateCategory(data);
  }

  @MessagePattern({ cmd: 'portal_delete_category' })
  deleteCategory(@Payload() data: { id: string; organizationId: string }) {
    return this.portalService.deleteCategory(data);
  }

  @MessagePattern({ cmd: 'portal_reorder_categories' })
  reorderCategories(@Payload() data: { organizationId: string; portalId: string; orderedIds: string[] }) {
    return this.portalService.reorderCategories(data);
  }
}
