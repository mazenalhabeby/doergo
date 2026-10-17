import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SendMessageDto } from '../dto';

/**
 * Files reach chat through chat's own presign: a message names the KEY it was
 * given. A bare URL the sender typed carries no key and is refused here; a key
 * from another conversation is refused in task-service (chat-files), which also
 * checks the object really exists.
 */
describe('SendMessageDto attachments', () => {
  const errorsFor = async (body: Record<string, unknown>) =>
    validate(plainToInstance(SendMessageDto, body), { whitelist: true, forbidNonWhitelisted: true });
  const file = (n: number) => ({
    fileKey: `org/chat/c1/${n}.jpg`,
    fileName: `${n}.jpg`,
    mimeType: 'image/jpeg',
    fileSize: 10,
  });

  it('refuses an attachment pointing at an arbitrary address, with no key', async () => {
    const errors = await errorsFor({
      body: 'see this',
      attachments: [{ fileName: 'invoice.pdf', fileUrl: 'javascript:alert(1)', mimeType: 'application/pdf' }],
    });
    expect(errors.map((e) => e.property)).toContain('attachments');
  });

  it('accepts uploaded files by key, and a message that is only files', async () => {
    expect(await errorsFor({ body: '', attachments: [file(1), file(2)] })).toHaveLength(0);
  });

  it('refuses more than five files', async () => {
    const errors = await errorsFor({ body: '', attachments: [1, 2, 3, 4, 5, 6].map(file) });
    expect(errors.map((e) => e.property)).toContain('attachments');
  });

  it('accepts a message with no attachments, or an empty list', async () => {
    expect(await errorsFor({ body: 'hello' })).toHaveLength(0);
    expect(await errorsFor({ body: 'hello', attachments: [] })).toHaveLength(0);
  });
});
