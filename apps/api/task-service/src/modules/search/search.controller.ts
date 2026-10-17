import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { SearchService } from './search.service';
import {
  pattern,
  type RpcRequest,
  searchTasksAndSpaces,
} from '@hbcfield/shared/microservices';

@Controller()
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @MessagePattern(pattern(searchTasksAndSpaces))
  search(@Payload() data: RpcRequest<typeof searchTasksAndSpaces>) {
    return this.searchService.search(data);
  }
}
