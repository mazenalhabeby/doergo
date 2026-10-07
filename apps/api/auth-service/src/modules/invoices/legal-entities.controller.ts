import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { LegalEntitiesService } from './legal-entities.service';

/** Companies (legal entities). The gateway gates every call; organizationId always comes from the token. */
@Controller()
export class LegalEntitiesController {
  constructor(private readonly entities: LegalEntitiesService) {}

  @MessagePattern({ cmd: 'legal_entity_list' })
  list(@Payload() data: { organizationId: string; withBank?: boolean; includeInactive?: boolean }) {
    return this.entities.list(data);
  }

  @MessagePattern({ cmd: 'legal_entity_create' })
  create(@Payload() data: { organizationId: string; input: Record<string, unknown> }) {
    return this.entities.create(data);
  }

  @MessagePattern({ cmd: 'legal_entity_update' })
  update(@Payload() data: { organizationId: string; id: string; input: Record<string, unknown> }) {
    return this.entities.update(data);
  }

  @MessagePattern({ cmd: 'legal_entity_set_main' })
  setMain(@Payload() data: { organizationId: string; id: string }) {
    return this.entities.setMain(data);
  }

  @MessagePattern({ cmd: 'legal_entity_set_active' })
  setActive(@Payload() data: { organizationId: string; id: string; active: boolean }) {
    return this.entities.setActive(data);
  }
}
