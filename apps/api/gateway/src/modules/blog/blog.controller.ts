import { assertServiceOk } from '@hbcfield/shared';
import { Body, Controller, Delete, Get, HttpStatus, Param, Patch, Post, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { Public } from '../../common/decorators';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import { BlogGatewayService } from './blog.service';

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

  private unwrap<T>(result: any): T {
    return assertServiceOk(result) as T;
  }

  // ── Public reads ────────────────────────────────────────────────────────────

  @Get('blog/posts')
  async list() { return this.unwrap(await this.svc.listPublished()); }

  @Get('blog/posts/:slug')
  async bySlug(@Param('slug') slug: string) { return this.unwrap(await this.svc.getBySlug(slug)); }

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
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Length', String(buf.length));
    // Image ids are immutable — cache hard so the DB is hit rarely.
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.end(buf);
  }

  // ── Platform-key-guarded writes (blog MCP / operator) ───────────────────────

  @Get('platform/blog/posts')
  @UseGuards(PlatformAdminGuard)
  async listAll() { return this.unwrap(await this.svc.listAll()); }

  @Post('platform/blog/posts')
  @UseGuards(PlatformAdminGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async create(@Body() body: any) { return this.unwrap(await this.svc.create(body ?? {})); }

  @Patch('platform/blog/posts/:id')
  @UseGuards(PlatformAdminGuard)
  async update(@Param('id') id: string, @Body() body: any) {
    return this.unwrap(await this.svc.update({ ...(body ?? {}), id }));
  }

  @Delete('platform/blog/posts/:id')
  @UseGuards(PlatformAdminGuard)
  async remove(@Param('id') id: string) { return this.unwrap(await this.svc.remove(id)); }

  @Post('platform/blog/images')
  @UseGuards(PlatformAdminGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async uploadImage(@Body() body: { dataBase64?: string; mime?: string; fileName?: string }) {
    return this.unwrap(await this.svc.saveImage(body ?? {}));
  }
}
