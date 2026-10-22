import { BlogService } from '../blog.service';

/**
 * The public blog. The public reads show PUBLISHED posts only; the writes come
 * from the operator's platform key (guarded at the gateway). The rules here:
 * a slug is derived and de-duplicated rather than refused, a status is DRAFT or
 * PUBLISHED and nothing else, an update writes only known fields, and an image
 * is a bitmap of at most 5 MB — never SVG, which our own origin would serve as
 * script.
 */
function setup() {
  const prisma: any = {
    blogPost: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn(async ({ data }: any) => ({ id: 'p1', ...data })),
      update: jest.fn(async ({ data }: any) => ({ id: 'p1', slug: 'x', ...data })),
      delete: jest.fn(async () => ({ id: 'p1', slug: 'x' })),
    },
    blogImage: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn(async ({ data }: any) => ({ id: 'img1', ...data })),
    },
  };
  return { prisma, blog: new BlogService(prisma) };
}

const post = { title: 'Ten tips: Field Service!', description: 'd', content: 'c' };

describe('public reads', () => {
  it('lists only published posts, newest first', async () => {
    const { prisma, blog } = setup();
    await blog.listPublished();
    const args = prisma.blogPost.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ status: 'PUBLISHED' });
    expect(args.orderBy).toEqual({ publishedAt: 'desc' });
  });

  it('a draft reads as not found', async () => {
    const { prisma, blog } = setup();
    prisma.blogPost.findUnique.mockResolvedValueOnce({ slug: 's', status: 'DRAFT' });
    expect(await blog.getBySlug({ slug: 's' })).toMatchObject({ success: false, statusCode: 404 });
    expect(await blog.getBySlug({})).toMatchObject({ success: false, statusCode: 400 });
  });

  it('an image travels as base64 with its type', async () => {
    const { prisma, blog } = setup();
    prisma.blogImage.findUnique.mockResolvedValueOnce({ mime: 'image/png', data: Buffer.from('png!') });
    expect(await blog.getImage({ id: 'img1' })).toEqual({
      success: true,
      data: { mime: 'image/png', dataBase64: Buffer.from('png!').toString('base64') },
    });
  });
});

describe('writing a post', () => {
  it('needs a title, a description and content', async () => {
    const { prisma, blog } = setup();
    expect(await blog.create({ title: 't', description: 'd' })).toMatchObject({ success: false, statusCode: 400 });
    expect(prisma.blogPost.create).not.toHaveBeenCalled();
  });

  it('derives the slug from the title and fills the defaults', async () => {
    const { prisma, blog } = setup();
    await blog.create({ ...post, tags: ['crm', 3 as any, 'ops'] });
    expect(prisma.blogPost.create.mock.calls[0][0].data).toMatchObject({
      slug: 'ten-tips-field-service',
      author: 'HBCField Team',
      coverUrl: null,
      tags: ['crm', 'ops'],
      status: 'PUBLISHED',
    });
  });

  it('a slug already taken gets a suffix instead of an error', async () => {
    const { prisma, blog } = setup();
    prisma.blogPost.findUnique.mockResolvedValueOnce({ id: 'old' });
    await blog.create({ ...post, slug: 'Ten Tips' });
    expect(prisma.blogPost.create.mock.calls[0][0].data.slug).toMatch(/^ten-tips-[a-z0-9]+$/);
  });

  it('a title with no letters or digits cannot make a slug', async () => {
    const { blog } = setup();
    expect(await blog.create({ ...post, title: '!!!' })).toMatchObject({
      success: false,
      message: 'Could not derive a slug',
    });
  });

  it('only DRAFT stays a draft — any other status publishes', async () => {
    const { prisma, blog } = setup();
    await blog.create({ ...post, status: 'DRAFT' });
    await blog.create({ ...post, status: 'SCHEDULED' });
    expect(prisma.blogPost.create.mock.calls.map((c: any) => c[0].data.status)).toEqual(['DRAFT', 'PUBLISHED']);
  });

  it('an update writes only known fields, re-slugs, and drops an unknown status', async () => {
    const { prisma, blog } = setup();
    await blog.update({ id: 'p1', title: 'New', slug: 'New Slug!', status: 'ARCHIVED', id2: 'x', views: 9 });
    expect(prisma.blogPost.update.mock.calls[0][0]).toEqual({
      where: { id: 'p1' },
      data: { title: 'New', slug: 'new-slug' },
    });
  });

  it('a missing post is a 404 for update and delete', async () => {
    const { prisma, blog } = setup();
    prisma.blogPost.update.mockRejectedValueOnce(new Error('P2025'));
    prisma.blogPost.delete.mockRejectedValueOnce(new Error('P2025'));
    expect(await blog.update({ id: 'gone', title: 'x' })).toMatchObject({ statusCode: 404 });
    expect(await blog.remove({ id: 'gone' })).toMatchObject({ statusCode: 404 });
  });
});

describe('images', () => {
  const b64 = (n: number) => Buffer.alloc(n, 1).toString('base64');

  it.each(['image/svg+xml', 'text/html', 'application/pdf'])(
    'refuses %s — never served from our origin',
    async (mime) => {
      const { prisma, blog } = setup();
      expect(await blog.saveImage({ dataBase64: b64(10), mime })).toMatchObject({ success: false });
      expect(prisma.blogImage.create).not.toHaveBeenCalled();
    },
  );

  it('an empty image or one over 5 MB is refused', async () => {
    const { prisma, blog } = setup();
    expect(await blog.saveImage({ dataBase64: '', mime: 'image/png' })).toMatchObject({ success: false });
    expect(await blog.saveImage({ dataBase64: b64(5 * 1024 * 1024 + 1), mime: 'image/png' })).toMatchObject({
      success: false,
    });
    expect(prisma.blogImage.create).not.toHaveBeenCalled();
  });

  it('a stored image answers the public URL to embed', async () => {
    const { blog } = setup();
    expect(await blog.saveImage({ dataBase64: b64(10), mime: 'image/webp', fileName: 'a.webp' })).toEqual({
      success: true,
      data: { id: 'img1', url: '/api/v1/blog/images/img1' },
    });
  });
});
