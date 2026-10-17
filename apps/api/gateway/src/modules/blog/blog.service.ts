import { Injectable, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { SERVICE_NAMES, BaseGatewayService } from '@hbcfield/shared';
import {
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

/** Gateway → auth-service proxy for the public marketing blog. */
@Injectable()
export class BlogGatewayService extends BaseGatewayService {
  constructor(@Inject(SERVICE_NAMES.AUTH) authClient: ClientProxy) {
    super(authClient, BlogGatewayService.name);
  }

  // Public reads
  listPublished() {
    return this.call(blogListPublished, {});
  }
  getBySlug(slug: string) {
    return this.call(blogGetBySlug, { slug });
  }
  getImage(id: string) {
    return this.call(blogImageGet, { id });
  }

  // Platform-key-guarded writes
  listAll() {
    return this.call(blogListAll, {});
  }
  create(data: RpcRequest<typeof blogCreate>) {
    return this.call(blogCreate, data);
  }
  update(data: RpcRequest<typeof blogUpdate>) {
    return this.call(blogUpdate, data);
  }
  remove(id: string) {
    return this.call(blogDelete, { id });
  }
  saveImage(data: RpcRequest<typeof blogImageSave>) {
    return this.call(blogImageSave, data);
  }
}
