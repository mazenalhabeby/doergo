import { assertServiceOk } from '@hbcfield/shared';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  Patch,
  Post,
  Res,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { PlatformAuditInterceptor } from '../../common/interceptors/platform-audit.interceptor';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { Public } from '../../common/decorators';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import { BlogGatewayService } from './blog.service';
import type { RpcRequest, blogCreate } from '@hbcfield/shared/microservices';

/**
 * The only kinds of picture a blog post may carry.
 *
 * ⚠️ No SVG and no HTML: the image is served from our own origin, and an SVG is
 * a document that runs script. One uploaded "image" would be stored XSS on
 * hbcfield.com for every visitor who opened its URL.
 */
export const BLOG_IMAGE_MIMES: ReadonlySet<string> = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

/** The declared type, normalised — or null when it is not a picture we serve. */
export function blogImageMime(mime: unknown): string | null {
  const m = typeof mime === 'string' ? mime.split(';')[0].trim().toLowerCase() : '';
  const normal = m === 'image/jpg' ? 'image/jpeg' : m;
  return BLOG_IMAGE_MIMES.has(normal) ? normal : null;
}

/**
 * Public marketing blog.
 * - `/blog/*` reads are public (the marketing site + anyone).
 * - `/platform/blog/*` writes are gated by the shared PLATFORM_ADMIN_KEY header
 *   (same break-glass credential as the operator console) — this is what the
 *   blog MCP server authenticates with.
 */
@Controller()
@Public()
export class BlogController {
  constructor(private readonly svc: BlogGatewayService) {}

  private unwrap<T>(result: unknown): T {
    return assertServiceOk(result) as T;
  }

  // ── Public reads ────────────────────────────────────────────────────────────

  @Get('blog/posts')
  async list() {
    return this.unwrap(await this.svc.listPublished());
  }

  @Get('blog/posts/:slug')
  async bySlug(@Param('slug') slug: string) {
    return this.unwrap(await this.svc.getBySlug(slug));
  }

  @Get('blog/images/:id')
  async image(@Param('id') id: string, @Res() res: Response) {
    /*
      Thrown before a byte is written, so the exception filter still answers it
      as JSON even though this route streams through `res` — one mapping for a
      refusal, here too. 404 is the default: an unknown image id is not found.
    */
    const r: any = assertServiceOk(await this.svc.getImage(id), HttpStatus.NOT_FOUND);
    const { mime, dataBase64 } = r.data;
    const buf = Buffer.from(dataBase64, 'base64');
    // Anything stored before the upload allow-list is served as a download, never rendered.
    const safe = blogImageMime(mime);
    res.setHeader('Content-Type', safe ?? 'application/octet-stream');
    if (!safe) res.setHeader('Content-Disposition', 'attachment');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Length', String(buf.length));
    // Image ids are immutable — cache hard so the DB is hit rarely.
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.end(buf);
  }

  // ── Platform-key-guarded writes (blog MCP / operator) ───────────────────────

  @Get('platform/blog/posts')
  @UseGuards(PlatformAdminGuard)
  @UseInterceptors(PlatformAuditInterceptor)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async listAll() {
    return this.unwrap(await this.svc.listAll());
  }

  @Post('platform/blog/posts')
  @UseGuards(PlatformAdminGuard)
  @UseInterceptors(PlatformAuditInterceptor)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async create(@Body() body: RpcRequest<typeof blogCreate>) {
    return this.unwrap(await this.svc.create(body ?? {}));
  }

  @Patch('platform/blog/posts/:id')
  @UseGuards(PlatformAdminGuard)
  @UseInterceptors(PlatformAuditInterceptor)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.unwrap(await this.svc.update({ ...(body ?? {}), id }));
  }

  @Delete('platform/blog/posts/:id')
  @UseGuards(PlatformAdminGuard)
  @UseInterceptors(PlatformAuditInterceptor)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async remove(@Param('id') id: string) {
    return this.unwrap(await this.svc.remove(id));
  }

  @Post('platform/blog/images')
  @UseGuards(PlatformAdminGuard)
  @UseInterceptors(PlatformAuditInterceptor)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async uploadImage(@Body() body: { dataBase64?: string; mime?: string; fileName?: string }) {
    const mime = blogImageMime(body?.mime);
    if (!mime) throw new BadRequestException('A blog image must be PNG, JPEG, WebP or GIF.');
    return this.unwrap(await this.svc.saveImage({ ...(body ?? {}), mime }));
  }
}
