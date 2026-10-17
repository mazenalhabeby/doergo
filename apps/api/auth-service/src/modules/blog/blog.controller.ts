import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { BlogService } from './blog.service';

import {
  pattern,
  blogListPublished,
  blogGetBySlug,
  blogImageGet,
  blogListAll,
  blogCreate,
  blogUpdate,
  blogDelete,
  blogImageSave,
  type RpcRequest,
} from '@hbcfield/shared/microservices';
@Controller()
export class BlogController {
  constructor(private readonly svc: BlogService) {}

  // Public reads
  @MessagePattern(pattern(blogListPublished))
  listPublished() {
    return this.svc.listPublished();
  }

  @MessagePattern(pattern(blogGetBySlug))
  getBySlug(@Payload() d: RpcRequest<typeof blogGetBySlug>) {
    return this.svc.getBySlug(d);
  }

  @MessagePattern(pattern(blogImageGet))
  getImage(@Payload() d: RpcRequest<typeof blogImageGet>) {
    return this.svc.getImage(d);
  }

  // Platform-key-guarded writes (guarded at the gateway)
  @MessagePattern(pattern(blogListAll))
  listAll() {
    return this.svc.listAll();
  }

  @MessagePattern(pattern(blogCreate))
  create(@Payload() d: RpcRequest<typeof blogCreate>) {
    return this.svc.create(d);
  }

  @MessagePattern(pattern(blogUpdate))
  update(@Payload() d: RpcRequest<typeof blogUpdate>) {
    return this.svc.update(d);
  }

  @MessagePattern(pattern(blogDelete))
  remove(@Payload() d: RpcRequest<typeof blogDelete>) {
    return this.svc.remove(d);
  }

  @MessagePattern(pattern(blogImageSave))
  saveImage(@Payload() d: RpcRequest<typeof blogImageSave>) {
    return this.svc.saveImage(d);
  }
}
