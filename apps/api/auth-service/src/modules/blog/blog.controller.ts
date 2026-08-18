import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { BlogService } from './blog.service';

@Controller()
export class BlogController {
  constructor(private readonly svc: BlogService) {}

  // Public reads
  @MessagePattern({ cmd: 'blog_list_published' })
  listPublished() { return this.svc.listPublished(); }

  @MessagePattern({ cmd: 'blog_get_by_slug' })
  getBySlug(@Payload() d: any) { return this.svc.getBySlug(d); }

  @MessagePattern({ cmd: 'blog_image_get' })
  getImage(@Payload() d: any) { return this.svc.getImage(d); }

  // Platform-key-guarded writes (guarded at the gateway)
  @MessagePattern({ cmd: 'blog_list_all' })
  listAll() { return this.svc.listAll(); }

  @MessagePattern({ cmd: 'blog_create' })
  create(@Payload() d: any) { return this.svc.create(d); }

  @MessagePattern({ cmd: 'blog_update' })
  update(@Payload() d: any) { return this.svc.update(d); }

  @MessagePattern({ cmd: 'blog_delete' })
  remove(@Payload() d: any) { return this.svc.remove(d); }

  @MessagePattern({ cmd: 'blog_image_save' })
  saveImage(@Payload() d: any) { return this.svc.saveImage(d); }
}
