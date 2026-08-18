import { Injectable, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { SERVICE_NAMES, BaseGatewayService } from '@hbcfield/shared';

/** Gateway → auth-service proxy for the public marketing blog. */
@Injectable()
export class BlogGatewayService extends BaseGatewayService {
  constructor(@Inject(SERVICE_NAMES.AUTH) authClient: ClientProxy) {
    super(authClient, BlogGatewayService.name);
  }

  // Public reads
  listPublished() { return this.send({ cmd: 'blog_list_published' }, {}); }
  getBySlug(slug: string) { return this.send({ cmd: 'blog_get_by_slug' }, { slug }); }
  getImage(id: string) { return this.send({ cmd: 'blog_image_get' }, { id }); }

  // Platform-key-guarded writes
  listAll() { return this.send({ cmd: 'blog_list_all' }, {}); }
  create(data: any) { return this.send({ cmd: 'blog_create' }, data); }
  update(data: any) { return this.send({ cmd: 'blog_update' }, data); }
  remove(id: string) { return this.send({ cmd: 'blog_delete' }, { id }); }
  saveImage(data: any) { return this.send({ cmd: 'blog_image_save' }, data); }
}
