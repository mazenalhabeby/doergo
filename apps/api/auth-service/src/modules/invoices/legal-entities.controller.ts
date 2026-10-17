import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { LegalEntitiesService } from './legal-entities.service';

import {
  pattern,
  legalEntityList,
  legalEntityCreate,
  legalEntityUpdate,
  legalEntitySetMain,
  legalEntitySetActive,
  type RpcRequest,
} from '@hbcfield/shared/microservices';
/** Companies (legal entities). The gateway gates every call; organizationId always comes from the token. */
@Controller()
export class LegalEntitiesController {
  constructor(private readonly entities: LegalEntitiesService) {}

  @MessagePattern(pattern(legalEntityList))
  list(@Payload() data: RpcRequest<typeof legalEntityList>) {
    return this.entities.list(data);
  }

  @MessagePattern(pattern(legalEntityCreate))
  create(@Payload() data: RpcRequest<typeof legalEntityCreate>) {
    return this.entities.create(data);
  }

  @MessagePattern(pattern(legalEntityUpdate))
  update(@Payload() data: RpcRequest<typeof legalEntityUpdate>) {
    return this.entities.update(data);
  }

  @MessagePattern(pattern(legalEntitySetMain))
  setMain(@Payload() data: RpcRequest<typeof legalEntitySetMain>) {
    return this.entities.setMain(data);
  }

  @MessagePattern(pattern(legalEntitySetActive))
  setActive(@Payload() data: RpcRequest<typeof legalEntitySetActive>) {
    return this.entities.setActive(data);
  }
}
