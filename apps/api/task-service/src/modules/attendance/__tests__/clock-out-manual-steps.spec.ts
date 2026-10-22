import { BadRequestException, ConflictException } from '@nestjs/common';
import { alreadyClosedAnswer, clockOutMessage, geofenceAtOut, notesWithEarlyReason } from '../clock-out/clock-out-steps';
import {
  assertManualRangeShape,
  manualBreakPlacement,
  manualEntryRow,
  manualTargetDates,
} from '../entries/manual-entries-steps';

describe('clock-out steps', () => {
  const closed = { id: 'e1', status: 'CLOCKED_OUT', clockOutAt: new Date('2026-10-01T16:00:00Z') };

  it('the same tap sent twice gets the same answer; another close is a conflict', () => {
    const again = alreadyClosedAnswer(closed, { occurredAt: '2026-10-01T16:00:00Z' } as never);
    expect(again).toMatchObject({ message: 'Already clocked out' });
    expect(() => alreadyClosedAnswer(closed, undefined)).toThrow(ConflictException);
  });

  it('no GPS fix is "unknown", never outside', () => {
    const site = { lat: 48, lng: 13, geofenceRadius: 50, geofencePolygon: null };
    expect(geofenceAtOut(site, {})).toMatchObject({ geofenceEvaluable: false, withinGeofence: true, distance: 0 });
    expect(geofenceAtOut({ ...site, lat: null }, { lat: 48, lng: 13 }).geofenceEvaluable).toBe(false);
    expect(geofenceAtOut(site, { lat: 49, lng: 13 }).withinGeofence).toBe(false);
  });

  it('notes and the message', () => {
    expect(notesWithEarlyReason('x', 'sick')).toBe('x · Left early: sick');
    expect(notesWithEarlyReason(undefined, '')).toBeUndefined();
    expect(clockOutMessage('Depot', { paidMinutes: 450 }, 480, 0)).toBe('Clocked out from Depot. 7h 30m counted.');
    expect(clockOutMessage('Depot', { breakMinutes: 30 }, 400, 90)).toBe(
      'Clocked out from Depot. 6h 10m counted — 1h 30m short of your shift.',
    );
  });
});

describe('manual entries steps', () => {
  const base = {
    editorId: 'boss',
    organizationId: 'o',
    userId: 'u',
    locationId: 'l',
    startDate: '2026-09-01',
    endDate: '2026-09-01',
    startTime: '08:00',
    endTime: '16:00',
  };

  it('refuses a malformed or backwards range', () => {
    expect(() => assertManualRangeShape({ ...base, startDate: '1.9.2026' })).toThrow('Invalid date range');
    expect(() => assertManualRangeShape({ ...base, endTime: '8' })).toThrow('Invalid time');
    expect(() => assertManualRangeShape({ ...base, endDate: '2026-08-31' })).toThrow(
      'End date is before the start date',
    );
  });

  it('places the rest: given times, centred minutes, refused when it does not fit', () => {
    expect(manualBreakPlacement({ ...base, breakStart: '12:00', breakEnd: '12:30' })).toEqual({
      breakOffsetMin: 240,
      breakMin: 30,
    });
    expect(manualBreakPlacement({ ...base, breakMinutes: 60 })).toEqual({ breakOffsetMin: 210, breakMin: 60 });
    expect(() => manualBreakPlacement({ ...base, breakMinutes: 480 })).toThrow(BadRequestException);
    expect(() => manualBreakPlacement({ ...base, breakStart: '17:00', breakEnd: '17:30' })).toThrow(
      'The break must sit inside the shift.',
    );
  });

  it('weekdays by default for a range, a year at most', () => {
    expect(manualTargetDates({ ...base, endDate: '2026-09-07' })).toEqual([
      '2026-09-01',
      '2026-09-02',
      '2026-09-03',
      '2026-09-04',
      '2026-09-07',
    ]);
    expect(() => manualTargetDates({ ...base, endDate: '2027-09-07' })).toThrow('Date range too large');
    expect(() => manualTargetDates({ ...base, startDate: '2026-09-05', endDate: '2026-09-06' })).toThrow(
      'No matching days',
    );
  });

  it('an overnight row rolls the clock-out over; a future one is refused', () => {
    const ctx = {
      ymd: '2026-09-01',
      now: new Date('2026-10-01T00:00:00Z'),
      tz: 'UTC',
      loc: { lat: null, lng: null },
      breakMin: 60,
      reason: 'r',
    };
    const row = manualEntryRow(
      { ...base, startTime: '18:00', endTime: '06:00' },
      {
        ...ctx,
        clockIn: new Date('2026-09-01T18:00:00Z'),
        clockOut: new Date('2026-09-01T06:00:00Z'),
      },
    );
    expect(row).toMatchObject({ totalMinutes: 720, breakMinutes: 60, unpaidBreakMinutes: 60, clockInLat: 0 });
    expect(() =>
      manualEntryRow(base, {
        ...ctx,
        clockIn: new Date('2026-12-01T08:00:00Z'),
        clockOut: new Date('2026-12-01T16:00:00Z'),
      }),
    ).toThrow(BadRequestException);
  });
});
