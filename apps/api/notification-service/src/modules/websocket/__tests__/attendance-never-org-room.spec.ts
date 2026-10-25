import * as fs from 'fs';
import * as path from 'path';

/**
 * Clock events never reach the organization room (clock review A1): every staff socket joins it, external
 * members included, while the API lets only attendance viewers read those hours. This reads the handlers and
 * fails when an attendance / break / no-show / excursion event is sent with `emitToOrganization` again.
 */
describe('attendance events stay out of org:{id}', () => {
  const dir = path.join(__dirname, '../../events/attendance');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'));

  it.each(files)('%s sends no clock event to the whole organization', (file) => {
    const src = fs.readFileSync(path.join(dir, file), 'utf8');
    const orgEmits = [...src.matchAll(/emitToOrganization\([^,]+,\s*['"`]([^'"`]+)/g)].map((m) => m[1]);
    const clock = orgEmits.filter((e) => /attendance|break|noshow|shift|geofence|excursion/i.test(e));
    expect(clock).toEqual([]);
  });

  it('the member events never target the organization room', () => {
    const src = fs.readFileSync(path.join(__dirname, '../member-events.ts'), 'utf8');
    const attendanceHalf = src.slice(src.indexOf('ATTENDANCE EVENTS'));
    expect(attendanceHalf).not.toMatch(/`org:\$\{/);
  });
});
