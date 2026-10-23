import { readFileSync } from 'fs';
import { join } from 'path';
import { personName, personNameById } from '@hbcfield/shared';

/**
 * ONE rule for a person's name. Three private `nameOf` copies existed, two of
 * which printed "John null" into pushes and calendar invitations.
 */
describe('personName', () => {
  it.each([
    [{ firstName: 'John', lastName: null }, 'John'],
    [{ firstName: null, lastName: 'Weber' }, 'Weber'],
    [{ firstName: ' Anna ', lastName: 'Müller' }, 'Anna Müller'],
    [null, ''],
  ])('%j → %s', (person, expected) => {
    expect(personName(person as never)).toBe(expected);
  });

  it('looks the member up only when there is an id', async () => {
    const findUnique = jest.fn().mockResolvedValue({ firstName: 'John', lastName: null });
    expect(await personNameById({ user: { findUnique } }, null)).toBe('');
    expect(findUnique).not.toHaveBeenCalled();
    expect(await personNameById({ user: { findUnique } }, 'u1')).toBe('John');
  });

  it.each([
    'modules/shift-issues/shift-issue-notices.service.ts', // the shift issues' name helper
    'modules/tasks/handover/crew-reader.service.ts', // the crew's name helper
    'modules/calendar/event-notices.service.ts', // the events' name helper
  ])('%s names people through the shared rule', (file) => {
    const src = readFileSync(join(__dirname, '..', '..', file), 'utf8');
    expect(src).toMatch(/personNameById\(/);
    expect(src).not.toMatch(/\$\{u\.firstName/);
  });
});
