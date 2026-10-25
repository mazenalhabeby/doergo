import { closeByOffice } from '../entries/office-close';

/** The office typing a clock-out for a running shift goes through THE close (clock review B9). */
describe('closeByOffice', () => {
  const entry = { id: 'e1', userId: 'w', organizationId: 'o1', clockInAt: new Date('2026-10-25T07:00:00Z') } as any;
  const edit = {
    isEdited: true,
    editedById: 'office',
    editReason: 'Forgot to clock out',
    clockInAt: entry.clockInAt,
    clockOutAt: new Date('2026-10-25T15:30:00Z'),
    status: 'CLOCKED_OUT',
    reminderState: 'RESOLVED',
    paidMinutes: 999,
    flagReasons: ['MISSED_CLOCK_OUT'],
  } as any;
  const prisma = { timeEntry: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'e1' }) } } as any;

  it('closes through the closer with the office’s own fields — never the ones the close works out', async () => {
    const closer = { closeEntry: jest.fn().mockResolvedValue(true) } as any;
    await closeByOffice(closer, prisma, entry, edit, { at: edit.clockOutAt, toleranceMin: 10, include: {} });
    const [, spec] = closer.closeEntry.mock.calls[0];
    expect(spec).toMatchObject({ at: edit.clockOutAt, from: 'OPEN', labels: { closedHow: 'OFFICE' }, announce: true });
    expect(spec.pause.reason).toBe('OFFICE_CLOSE');
    expect(spec.fields).toEqual({
      isEdited: true,
      editedById: 'office',
      editReason: 'Forgot to clock out',
      clockInAt: entry.clockInAt,
      flagReasons: ['MISSED_CLOCK_OUT'],
    });
  });

  it('a shift the member closed meanwhile is a conflict, not an overwrite', async () => {
    const closer = { closeEntry: jest.fn().mockResolvedValue(null) } as any;
    await expect(
      closeByOffice(closer, prisma, entry, edit, { at: edit.clockOutAt, include: {} }),
    ).rejects.toMatchObject({ response: { code: 'ENTRY_ALREADY_CLOSED' } });
  });
});
