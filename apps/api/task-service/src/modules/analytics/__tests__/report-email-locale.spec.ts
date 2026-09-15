import { ReportScheduleService } from '../report-schedule.service';

/*
  A scheduled report goes to ADDRESSES. Each is written in the language of the
  account behind it, or else the language of the member who set the schedule
  up; the report is run once, the frame rendered once per language, and every
  address looked up in one query.
*/
describe('scheduled report email language', () => {
  function setup(accounts: Array<{ email: string; locale: string | null }>) {
    const prisma = {
      user: { findMany: jest.fn(async ({ where }: any) => accounts.filter((a) => where.email.in.includes(a.email))) },
    };
    const analytics = {
      run: jest.fn().mockResolvedValue({
        data: {
          columns: [
            { key: 'name', labelKey: 'col.technician', label: 'Technician', kind: 'dimension' },
            { key: 'hours', labelKey: 'col.hoursWorked', label: 'Hours worked', kind: 'measure', format: 'hours' },
            // A column the catalogue does not know keeps the name it came with.
            { key: 'cf', label: 'Zählerstand', kind: 'dimension' },
          ],
          rows: [{ name: '<b>Ana</b>', hours: 8.5 }],
        },
      }),
    };
    const emit = jest.fn();
    const service = new ReportScheduleService(prisma as any, analytics as any, { emit } as any);
    return { service, prisma, analytics, emit };
  }

  const schedule = (recipients: string[], creatorLocale: string | null) => ({
    organizationId: 'org',
    recipients,
    reportDefinition: { name: 'Weekly hours', config: {} },
    createdBy: { locale: creatorLocale },
  });

  it('sends one email per language, each to the addresses that read it', async () => {
    const { service, prisma, analytics, emit } = setup([
      { email: 'anna@x.at', locale: 'de' },
      { email: 'luc@x.fr', locale: 'fr' },
      { email: 'max@x.at', locale: 'de' },
    ]);
    await (service as any).deliver(schedule(['anna@x.at', 'Luc@x.fr', 'max@x.at', 'outside@firm.com'], 'it'));

    expect(prisma.user.findMany).toHaveBeenCalledTimes(1);
    expect(analytics.run).toHaveBeenCalledTimes(1);
    const sends = emit.mock.calls.map(([, payload]) => payload);
    expect(emit.mock.calls.every(([pattern]) => pattern === 'report_email')).toBe(true);

    const bySubject = Object.fromEntries(sends.map((s) => [s.subject, s.recipients]));
    expect(bySubject).toEqual({
      'Bericht: Weekly hours': ['anna@x.at', 'max@x.at'],
      'Rapport : Weekly hours': ['Luc@x.fr'],
      // No account behind it: the schedule author's language.
      'Report: Weekly hours': ['outside@firm.com'],
    });
    const german = sends.find((s) => s.subject.startsWith('Bericht'))!;
    expect(german.html).toContain('<html lang="de" dir="ltr">');
    expect(german.html).toContain('8,5h');
    expect(german.html).toContain('&lt;b&gt;Ana&lt;/b&gt;');
    // Column names in each group's language, from the catalogue the web table reads.
    expect(german.html).toContain('Gearbeitete Stunden');
    expect(german.html).not.toContain('Hours worked');
    expect(german.html).toContain('Zählerstand');
    expect(sends.find((s) => s.subject.startsWith('Rapport'))!.html).toContain('Heures travaillées');
    const italian = sends.find((s) => s.recipients.includes('outside@firm.com'))!;
    expect(italian.html).toContain('<html lang="it"');
    expect(italian.html).toContain('Ore lavorate');
  });

  it('falls back to English when neither the address nor the author has a language', async () => {
    const { service, emit } = setup([]);
    await (service as any).deliver(schedule(['a@x', 'b@x'], null));
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls[0][1]).toMatchObject({ subject: 'Report: Weekly hours', recipients: ['a@x', 'b@x'] });
  });
});
