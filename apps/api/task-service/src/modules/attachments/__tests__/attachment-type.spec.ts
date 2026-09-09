import * as fs from 'fs';
import * as path from 'path';
import { attachmentTypeOf } from '../attachments.service';
import { AttachmentType } from '@hbcfield/shared';

/**
 * A MIME type is not an AttachmentType.
 *
 * `Attachment.fileType` is a Prisma enum — IMAGE | DOCUMENT | OTHER. Clients
 * send a MIME type, "image/jpeg". `create()` used to declare its parameter as
 * `AttachmentType` and hand it straight to Prisma, and because the value
 * arrives inside a BullMQ payload the annotation was a claim the compiler could
 * never check.
 *
 * The result was not a degraded feature, it was no feature: every upload
 * reached S3 and then died in `prisma.attachment.create()` with "Invalid value
 * for argument `fileType`". Production held ZERO attachment rows — web and
 * mobile alike, since both call the same endpoint.
 */
describe('MIME → AttachmentType', () => {
  it.each([
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif',
  ])('%s is an IMAGE', (mime) => {
    expect(attachmentTypeOf(mime)).toBe(AttachmentType.IMAGE);
  });

  it.each([
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
  ])('%s is a DOCUMENT', (mime) => {
    expect(attachmentTypeOf(mime)).toBe(AttachmentType.DOCUMENT);
  });

  it('anything else is OTHER rather than a throw', () => {
    // The write path refuses unknown types separately; this must still return a
    // valid member, because a function that can produce an invalid enum is the
    // bug being fixed.
    expect(attachmentTypeOf('application/zip')).toBe(AttachmentType.OTHER);
    expect(attachmentTypeOf('')).toBe(AttachmentType.OTHER);
  });

  it('only ever returns a real member of the enum', () => {
    const members = Object.values(AttachmentType);
    for (const mime of ['image/png', 'text/plain', 'application/x-msdownload', 'nonsense']) {
      expect(members).toContain(attachmentTypeOf(mime));
    }
  });
});

/**
 * The guard, because the unit test above cannot fail if somebody stops calling
 * the mapper. What broke production was the ASSIGNMENT, not the mapping.
 */
describe('the write path', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'attachments.service.ts'),
    'utf8',
  ).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('never passes a raw MIME type to prisma.attachment.create', () => {
    const create = src.slice(src.indexOf('this.prisma.attachment.create'));
    const body = create.slice(0, create.indexOf('});'));
    expect(body).toContain('fileType: attachmentTypeOf(');
    expect(body).not.toMatch(/fileType:\s*data\.fileType/);
  });

  it('refuses a file type the presign step would not have allowed', () => {
    expect(src).toContain("ALLOWED_FILE_TYPES.includes(data.fileType)");
    expect(src).toContain("Unsupported file type");
  });

  it('declares the parameter as the MIME string it actually receives', () => {
    // Typing it `AttachmentType` is what made the bug invisible for months.
    const sig = src.slice(src.indexOf('async create('), src.indexOf('async create(') + 400);
    expect(sig).toMatch(/fileType:\s*string/);
  });
});
