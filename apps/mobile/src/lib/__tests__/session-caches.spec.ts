/**
 * In-memory caches that outlive a screen are per member, and gone at the end of a session.
 */
import * as fs from 'fs';
import * as path from 'path';
import { calendarPageKey, calendarPages } from '../../features/calendar/calendar-pages';
import { registeredCleaners, runSessionEndCleaners } from '../session/session-registry';

const range = (who: string) => ({ from: '2026-10-05', to: '2026-10-11', who } as never);

describe('calendar pages', () => {
  beforeEach(() => calendarPages.forget());

  it('are keyed by member — the next person never draws the last one\'s week', () => {
    const mike = calendarPageKey('mike', '2026-10-05', '2026-10-11', null, '', 'en');
    const karim = calendarPageKey('karim', '2026-10-05', '2026-10-11', null, '', 'en');
    expect(mike).not.toBe(karim);
    calendarPages.remember(mike, range('mike'));
    expect(calendarPages.get(karim)).toBeUndefined();
  });

  it('are forgotten when the session ends', async () => {
    calendarPages.remember(calendarPageKey('mike', 'a', 'b', null, '', 'en'), range('mike'));
    expect(registeredCleaners()).toContain('calendar-pages');
    await runSessionEndCleaners();
    expect(calendarPages.size()).toBe(0);
  });
});

describe('the customer portal\'s query client', () => {
  it('is one per signed-in person and cleared at the end of a session (the AppQueryProvider rule)', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../../../app/(customer)/_layout.tsx'), 'utf8');
    expect(src).not.toMatch(/^const queryClient = new QueryClient/m);
    expect(src).toMatch(/useMemo\(\(\) => createPortalQueryClient\(\), \[userId\]\)/);
    expect(src).toMatch(/onSessionEnd\('portal-query-client', \(\) => queryClient\.clear\(\)\)/);
  });
});
