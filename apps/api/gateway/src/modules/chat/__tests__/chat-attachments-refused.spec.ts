import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SendMessageDto } from '../dto';

/**
 * Chat has no upload path, so an attachment could only ever be a URL the
 * sender typed — shown to everybody else as if we had stored it. Refused until
 * files reach chat through our own storage.
 */
describe('SendMessageDto attachments', () => {
  const errorsFor = async (body: Record<string, unknown>) =>
    validate(plainToInstance(SendMessageDto, body), { whitelist: true, forbidNonWhitelisted: true });

  it('refuses an attachment pointing at an arbitrary address', async () => {
    const errors = await errorsFor({
      body: 'see this',
      attachments: [{ fileName: 'invoice.pdf', fileUrl: 'https://evil.example/invoice.pdf', fileType: 'application/pdf' }],
    });
    expect(errors.map((e) => e.property)).toContain('attachments');
  });

  it('accepts a message with no attachments, or an empty list', async () => {
    expect(await errorsFor({ body: 'hello' })).toHaveLength(0);
    expect(await errorsFor({ body: 'hello', attachments: [] })).toHaveLength(0);
  });
});
