/**
 * Today's route is what is still to drive today (2026-09-27): carried-over
 * stops count, later days wait, and an empty day says the next driving day.
 */
import { routeDayOf } from '../route-day';

const ME = 'me';
const NOW = new Date(2026, 8, 27, 11, 0); // Sun 27 Sep, local
const job = (id: string, over: Record<string, unknown> = {}) => ({
  id, title: id, status: 'ASSIGNED', assignedToId: ME, locationLat: 48.2, locationLng: 16.37, locationAddress: 'Wien',
  dueDate: new Date(2026, 8, 27, 14, 0).toISOString(), ...over,
}) as never;

describe('routeDayOf', () => {
  it('BUG FIXED: yesterday\'s deliveries still count today, marked as carried', () => {
    const d = routeDayOf([job('billa', { dueDate: new Date(2026, 8, 26, 22).toISOString() }), job('today')], ME, NOW);
    expect(d.stops.map((s) => s.id).sort()).toEqual(['billa', 'today']);
    expect(d.carried).toBe(1);
  });

  it('the job under way counts whatever its date, and is not "carried"', () => {
    const d = routeDayOf([job('rewe', { status: 'EN_ROUTE', dueDate: new Date(2026, 8, 9).toISOString() })], ME, NOW);
    expect(d.stops.map((s) => s.id)).toEqual(['rewe']);
    expect(d.carried).toBe(0);
  });

  it('BUG FIXED: a stop dated a later day is not on today\'s route — it is the next driving day', () => {
    const mon1 = job('mon1', { dueDate: new Date(2026, 8, 29, 8, 30).toISOString() });
    const mon2 = job('mon2', { dueDate: new Date(2026, 8, 29, 11, 0).toISOString() });
    const wed = job('wed', { dueDate: new Date(2026, 9, 1, 9, 0).toISOString() });
    const d = routeDayOf([wed, mon2, mon1], ME, NOW);
    expect(d.stops).toEqual([]);
    expect(d.nextDay?.day.getDate()).toBe(29);
    expect(d.nextDay?.stops.map((s) => s.id)).toEqual(['mon1', 'mon2']);
  });

  it('an open stop with no date is today\'s (nothing says it is not)', () => {
    expect(routeDayOf([job('x', { dueDate: null })], ME, NOW).stops.map((s) => s.id)).toEqual(['x']);
  });

  it('nothing at all: no stops, no next day', () => {
    expect(routeDayOf([], ME, NOW)).toEqual({ stops: [], carried: 0, nextDay: null });
  });
});
