import { EmailService } from '../email.service';
import { RecipientLocales } from '../../../i18n/recipient-locales.service';

/*
  A client's portal invitation arrives with its language already decided by
  auth-service (the client rule: account → client record → organization →
  English). The address fallback here — the inviting member's language — must
  not override it: the member who pressed "invite" writing German says nothing
  about what the client reads.
*/
describe('invitation email — a language decided by the sender', () => {
  function setup() {
    const prisma = {
      user: {
        findMany: jest.fn(async ({ where }: any) =>
          where.id ? [{ id: 'boss', locale: 'de' }] : [],
        ),
      },
    };
    const service = new EmailService({ get: (_k: string, f?: unknown) => f } as any, new RecipientLocales(prisma as any));
    const sent: Array<{ subject: string; html: string }> = [];
    jest.spyOn(service, 'sendEmail').mockImplementation(async (_to, subject, html) => {
      sent.push({ subject, html });
      return { success: true };
    });
    return { service, sent, prisma };
  }
  const invite = {
    organizationName: 'Acme',
    invitationCode: 'ABCDE12345',
    targetRole: 'CUSTOMER',
    expiresAt: '2026-09-20T12:00:00Z',
    recipientEmail: 'office@billa.it',
    inviterId: 'boss',
  };

  it('writes in the language the sender decided, without asking about the inviter', async () => {
    const { service, sent, prisma } = setup();
    await service.sendInvitationEmail({ ...invite, locale: 'it' });
    expect(sent[0].html).toContain('<html lang="it" dir="ltr">');
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('falls back to its own rule when the value is missing or unusable', async () => {
    const { service, sent } = setup();
    await service.sendInvitationEmail({ ...invite, locale: 'klingon' });
    await service.sendInvitationEmail({ ...invite });
    expect(sent[0].html).toContain('<html lang="de" dir="ltr">');
    expect(sent[1].html).toContain('<html lang="de" dir="ltr">');
  });
});
