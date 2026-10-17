import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { SearchService } from './search.service';

import { pattern, searchPeopleAndCustomers, type RpcRequest } from '@hbcfield/shared/microservices';
@Controller()
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @MessagePattern(pattern(searchPeopleAndCustomers))
  search(@Payload() data: RpcRequest<typeof searchPeopleAndCustomers>) {
    return this.searchService.search(data);
  }
}
