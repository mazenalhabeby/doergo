import { BadRequestException } from '@nestjs/common';
import { BlogController, blogImageMime } from '../blog.controller';

/** A blog image is served from our own origin: SVG/HTML would be stored XSS. */
describe('blog image types', () => {
  it.each(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'IMAGE/PNG', 'image/jpg', 'image/png; charset=x'])('accepts %s', (m) => {
    expect(blogImageMime(m)).not.toBeNull();
  });
  it.each(['image/svg+xml', 'text/html', 'application/xhtml+xml', '', undefined, 42])('refuses %s', (m) => {
    expect(blogImageMime(m)).toBeNull();
  });

  it('the upload route refuses an SVG before it reaches the store', async () => {
    const svc = { saveImage: jest.fn() };
    const c = new BlogController(svc as any);
    await expect(c.uploadImage({ dataBase64: 'PHN2Zz4=', mime: 'image/svg+xml' })).rejects.toBeInstanceOf(BadRequestException);
    expect(svc.saveImage).not.toHaveBeenCalled();
  });

  it('stores the normalised type', async () => {
    const svc = { saveImage: jest.fn().mockResolvedValue({ success: true, data: { id: 'i1' } }) };
    const c = new BlogController(svc as any);
    await c.uploadImage({ dataBase64: 'AA==', mime: 'image/JPG' });
    expect(svc.saveImage).toHaveBeenCalledWith(expect.objectContaining({ mime: 'image/jpeg' }));
  });
});
