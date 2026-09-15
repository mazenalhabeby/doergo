import { EmailService } from '../email.service';
import { RecipientLocales } from '../../../i18n/recipient-locales.service';

/**
 * Who reads which language is decided here; what they read is the template's.
 */
function setup(users: Array<{ id: string; email: string; locale: string | null }>) {
  const prisma = {
    user: {
      findMany: jest.fn(async ({ where }: any) => {
        if (where.id) return users.filter((u) => where.id.in.includes(u.id)).map(({ id, locale }) => ({ id, locale }));
        return users.filter((u) => where.email.in.includes(u.email)).map(({ email, locale }) => ({ email, locale }));
      }),
    },
  };
  const locales = new RecipientLocales(prisma as any);
  const config = { get: (_key: string, fallback?: unknown) => fallback };
  const service = new EmailService(config as any, locales);
  const sent: Array<{ to: string; subject: string; html: string }> = [];
  jest.spyOn(service, 'sendEmail').mockImplementation(async (to, subject, html) => {
    sent.push({ to, subject, html });
    return { success: true };
  });
  return { service, prisma, sent };
}

const geofence = { userName: 'Mira', locationName: 'Lager', distance: 140, allowedRadius: 50, action: 'clock_in' as const };

describe('EmailService', () => {
  it('writes a batch in each reader’s language with ONE locale query', async () => {
    const { service, prisma, sent } = setup([
      { id: 'u1', email: 'anna@x.at', locale: 'de' },
      { id: 'u2', email: 'luc@x.fr', locale: 'fr' },
      { id: 'u3', email: 'jo@x.com', locale: null },
      { id: 'u4', email: 'max@x.at', locale: 'de-AT' },
    ]);

    await service.sendGeofenceAlertEmail({
      ...geofence,
      recipients: [
        { id: 'u1', email: 'anna@x.at' },
        { id: 'u2', email: 'luc@x.fr' },
        { id: 'u3', email: 'jo@x.com' },
        { id: 'u4', email: 'max@x.at' },
      ],
    });

    expect(prisma.user.findMany).toHaveBeenCalledTimes(1);
    const subjectFor = (to: string) => sent.find((s) => s.to === to)!.subject;
    expect(subjectFor('anna@x.at')).toBe('Geofence-Warnung: Mira – Einstempeln');
    expect(subjectFor('max@x.at')).toBe('Geofence-Warnung: Mira – Einstempeln');
    expect(subjectFor('luc@x.fr')).toBe('Alerte de zone : Mira – arrivée');
    expect(subjectFor('jo@x.com')).toBe('Geofence alert: Mira – clock in');
    expect(sent.find((s) => s.to === 'anna@x.at')!.html).toContain('<html lang="de" dir="ltr">');
  });

  it('renders each language once, however many read it', async () => {
    const { service } = setup([
      { id: 'a', email: 'a@x', locale: 'es' },
      { id: 'b', email: 'b@x', locale: 'es' },
      { id: 'c', email: 'c@x', locale: 'it' },
    ]);
    const render = jest.fn((locale: string) => ({ locale: locale as any, subject: locale, html: locale }));
    await service.sendToMembers(
      [
        { id: 'a', email: 'a@x' },
        { id: 'b', email: 'b@x' },
        { id: 'c', email: 'c@x' },
      ],
      render,
    );
    expect(render.mock.calls.map((c) => c[0]).sort()).toEqual(['es', 'it']);
  });

  it('sends one email per address and nothing for an empty list', async () => {
    const { service, prisma, sent } = setup([{ id: 'a', email: 'a@x', locale: 'it' }]);
    await service.sendGeofenceAlertEmail({ ...geofence, recipients: [] });
    expect(prisma.user.findMany).not.toHaveBeenCalled();

    await service.sendGeofenceAlertEmail({
      ...geofence,
      recipients: [
        { id: 'a', email: 'a@x' },
        { id: 'a', email: 'A@x ' },
      ],
    });
    expect(sent).toHaveLength(1);
  });

  it('writes English to somebody with no id, and when the language lookup fails', async () => {
    const { service, prisma, sent } = setup([]);
    await service.sendTaskCompletedEmail({ title: 'Pumpe' }, { id: null, email: 'x@x' });
    expect(sent[0].subject).toBe('Task completed: Pumpe');

    prisma.user.findMany.mockRejectedValueOnce(new Error('down'));
    await service.sendTaskAssignedEmail({ title: 'Pumpe' }, { id: 'u9', email: 'y@x' });
    expect(sent[1].subject).toBe('Task assigned: Pumpe');
  });

  describe('an invitation, to an address', () => {
    const invite = { organizationName: 'Acme', invitationCode: 'ABCDE12345', targetRole: 'EMPLOYEE', expiresAt: '2026-09-20T12:00:00Z' };

    it('is written in the language of the account behind the address, when there is one', async () => {
      const { service, sent } = setup([
        { id: 'boss', email: 'boss@acme.at', locale: 'de' },
        { id: 'orphan', email: 'new@person.es', locale: 'es' },
      ]);
      await service.sendInvitationEmail({ ...invite, recipientEmail: 'New@Person.es', inviterId: 'boss' });
      expect(sent[0].subject).toBe('Te han invitado a unirte a Acme en HBCField');
    });

    it('otherwise in the inviting member’s language', async () => {
      const { service, sent } = setup([{ id: 'boss', email: 'boss@acme.at', locale: 'de' }]);
      await service.sendInvitationEmail({ ...invite, recipientEmail: 'stranger@x.com', inviterId: 'boss' });
      expect(sent[0].subject).toBe('Einladung zu Acme auf HBCField');
      expect(sent[0].html).toContain('„Einladung verwenden“');
    });

    it('otherwise in English', async () => {
      const { service, sent } = setup([]);
      await service.sendInvitationEmail({ ...invite, recipientEmail: 'stranger@x.com' });
      expect(sent[0].subject).toBe('You’re invited to join Acme on HBCField');
    });
  });
});
