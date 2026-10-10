import { AttendanceReportService } from '../attendance-report.service';

/*
  The attendance export is opened in a spreadsheet on an office PC. A note or a
  location name a member typed that starts with "=" must arrive as TEXT, never
  as a formula, and every cell (header row too) is quoted.
*/
describe('AttendanceReportService.exportToCSV', () => {
  const entry = (over: Record<string, unknown> = {}) => ({
    clockInAt: new Date('2026-10-01T07:00:00Z'),
    clockOutAt: new Date('2026-10-01T15:00:00Z'),
    status: 'CLOCKED_OUT',
    totalMinutes: 480,
    clockInWithinGeofence: true,
    clockOutWithinGeofence: null,
    notes: null,
    user: { firstName: 'Ann', lastName: 'Lee', email: 'ann@example.com' },
    location: { name: 'Main', timezone: 'Europe/Vienna' },
    ...over,
  });

  function serviceWith(entries: unknown[]) {
    const prisma = { timeEntry: { findMany: jest.fn().mockResolvedValue(entries) } };
    return new AttendanceReportService(prisma as never);
  }

  it('defuses formula cells and quotes everything', async () => {
    const svc = serviceWith([
      entry({ notes: '=HYPERLINK("http://evil","x")', location: { name: '+SUM(A1)', timezone: null } }),
      entry({ notes: 'a, "quoted" note', user: { firstName: '@cmd', lastName: '-1', email: 'x@y.z' } }),
    ]);
    const res: any = await svc.exportToCSV({ organizationId: 'o', startDate: '2026-10-01', endDate: '2026-10-02' });
    const csv: string = res.data.content;
    const [head, row1, row2] = csv.split('\r\n');

    expect(head.startsWith('"Date","Technician","Email"')).toBe(true);
    expect(row1).toContain(`"'=HYPERLINK(""http://evil"",""x"")"`);
    expect(row1).toContain(`"'+SUM(A1)"`);
    expect(row2).toContain(`"'@cmd -1"`);
    expect(row2).toContain(`"a, ""quoted"" note"`);
    // No cell left unquoted.
    for (const line of [head, row1, row2]) expect(line.startsWith('"') && line.endsWith('"')).toBe(true);
  });
});
