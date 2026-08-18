import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

const ok = <T>(data: T) => ({ success: true, data });
const fail = (message: string, statusCode = 400) => ({ success: false, statusCode, message });

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']);

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

/** Public marketing blog: DB-backed posts + images, written via the platform API/MCP. */
@Injectable()
export class BlogService {
  private readonly logger = new Logger(BlogService.name);
  constructor(private readonly prisma: PrismaService) {}

  // ── Public reads ────────────────────────────────────────────────────────────

  async listPublished() {
    const posts = await this.prisma.blogPost.findMany({
      where: { status: 'PUBLISHED' },
      orderBy: { publishedAt: 'desc' },
      select: { slug: true, title: true, description: true, author: true, tags: true, coverUrl: true, publishedAt: true, content: true },
    });
    return ok(posts);
  }

  async getBySlug(data: { slug?: string }) {
    if (!data.slug) return fail('slug required');
    const post = await this.prisma.blogPost.findUnique({ where: { slug: data.slug } });
    if (!post || post.status !== 'PUBLISHED') return fail('Not found', 404);
    return ok(post);
  }

  async getImage(data: { id?: string }) {
    if (!data.id) return fail('id required');
    const img = await this.prisma.blogImage.findUnique({ where: { id: data.id } });
    if (!img) return fail('Not found', 404);
    // Bytes travel over Redis transport as base64.
    return ok({ mime: img.mime, dataBase64: Buffer.from(img.data).toString('base64') });
  }

  // ── Platform-key-guarded writes (MCP / operator) ────────────────────────────

  async listAll() {
    const posts = await this.prisma.blogPost.findMany({
      orderBy: { publishedAt: 'desc' },
      select: { id: true, slug: true, title: true, description: true, status: true, publishedAt: true, updatedAt: true, coverUrl: true, tags: true },
    });
    return ok(posts);
  }

  async create(data: {
    title?: string;
    description?: string;
    content?: string;
    slug?: string;
    coverUrl?: string;
    author?: string;
    tags?: string[];
    status?: string;
    publishedAt?: string;
  }) {
    if (!data.title || !data.description || !data.content) return fail('title, description and content are required');
    const status = data.status === 'DRAFT' ? 'DRAFT' : 'PUBLISHED';
    let slug = slugify(data.slug || data.title);
    if (!slug) return fail('Could not derive a slug');
    // De-duplicate slug rather than erroring — the AI caller shouldn't have to retry.
    const existing = await this.prisma.blogPost.findUnique({ where: { slug } });
    if (existing) slug = `${slug}-${Date.now().toString(36)}`;
    const post = await this.prisma.blogPost.create({
      data: {
        slug,
        title: data.title,
        description: data.description,
        content: data.content,
        coverUrl: data.coverUrl || null,
        author: data.author || 'HBCField Team',
        tags: Array.isArray(data.tags) ? data.tags.filter((t) => typeof t === 'string') : [],
        status,
        publishedAt: data.publishedAt ? new Date(data.publishedAt) : new Date(),
      },
    });
    this.logger.log(`[BLOG] created ${post.slug} (${status})`);
    return ok(post);
  }

  async update(data: { id?: string } & Record<string, unknown>) {
    if (!data.id) return fail('id required');
    const patch: Record<string, unknown> = {};
    for (const k of ['title', 'description', 'content', 'coverUrl', 'author', 'status'] as const) {
      if (typeof data[k] === 'string') patch[k] = data[k];
    }
    if (Array.isArray(data.tags)) patch.tags = (data.tags as unknown[]).filter((t) => typeof t === 'string');
    if (typeof data.slug === 'string') patch.slug = slugify(data.slug);
    if (typeof data.publishedAt === 'string') patch.publishedAt = new Date(data.publishedAt);
    if (patch.status && patch.status !== 'DRAFT' && patch.status !== 'PUBLISHED') delete patch.status;
    try {
      const post = await this.prisma.blogPost.update({ where: { id: data.id }, data: patch });
      this.logger.log(`[BLOG] updated ${post.slug}`);
      return ok(post);
    } catch {
      return fail('Not found', 404);
    }
  }

  async remove(data: { id?: string }) {
    if (!data.id) return fail('id required');
    try {
      const post = await this.prisma.blogPost.delete({ where: { id: data.id } });
      this.logger.warn(`[BLOG] deleted ${post.slug}`);
      return ok({ id: post.id, slug: post.slug });
    } catch {
      return fail('Not found', 404);
    }
  }

  async saveImage(data: { dataBase64?: string; mime?: string; fileName?: string }) {
    if (!data.dataBase64 || !data.mime) return fail('dataBase64 and mime are required');
    if (!ALLOWED_MIME.has(data.mime)) return fail(`Unsupported mime type: ${data.mime}`);
    let buf: Buffer;
    try {
      buf = Buffer.from(data.dataBase64, 'base64');
    } catch {
      return fail('Invalid base64');
    }
    if (buf.length === 0 || buf.length > MAX_IMAGE_BYTES) return fail(`Image must be 1 byte – ${MAX_IMAGE_BYTES / 1024 / 1024}MB`);
    const img = await this.prisma.blogImage.create({
      data: { mime: data.mime, fileName: data.fileName || null, data: new Uint8Array(buf) },
    });
    this.logger.log(`[BLOG] image saved ${img.id} (${data.mime}, ${buf.length}b)`);
    // The public URL the caller should embed in posts.
    return ok({ id: img.id, url: `/api/v1/blog/images/${img.id}` });
  }
}
