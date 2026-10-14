/**
 * The member's own choice with several workspaces (`User.clockInPick`): clock in
 * where they stand, or always choose. The shared rule both apps use.
 */
import { chooseClockInLocation, offersClockInPick, parseClockInPick } from '@hbcfield/shared/client';

const office = { id: 'office', lat: 47.9813, lng: 13.8269, geofenceRadius: 50 };
const site = { id: 'site', lat: 48.0037, lng: 13.6577, geofenceRadius: 40 };
const inOffice = { lat: 47.9813, lng: 13.8269, accuracy: 5 };

describe('clock in where I stand, or always choose', () => {
  it('AUTO (the default): inside one area clocks in there without asking', () => {
    expect(chooseClockInLocation([office, site], inOffice)).toMatchObject({ kind: 'auto', why: 'INSIDE_AREA', location: { id: 'office' } });
    expect(chooseClockInLocation([office, site], inOffice, 'AUTO').kind).toBe('auto');
  });

  it('ASK: the list is shown even inside the office, with the office first', () => {
    const choice = chooseClockInLocation([site, office], inOffice, 'ASK');
    expect(choice.kind).toBe('ask');
    if (choice.kind === 'ask') {
      expect(choice.ranked[0]!.location.id).toBe('office');
      expect(choice.ranked[0]!.inside).toBe(true);
    }
  });

  it('one workspace never asks, whatever the setting', () => {
    expect(chooseClockInLocation([office], inOffice, 'ASK')).toMatchObject({ kind: 'auto', why: 'ONLY_ONE' });
  });

  it('is offered only to somebody with more than one workspace', () => {
    expect(offersClockInPick(0)).toBe(false);
    expect(offersClockInPick(1)).toBe(false);
    expect(offersClockInPick(2)).toBe(true);
  });

  it('anything unknown reads as the default', () => {
    expect(parseClockInPick('ASK')).toBe('ASK');
    expect(parseClockInPick(undefined)).toBe('AUTO');
    expect(parseClockInPick('ask')).toBe('AUTO');
  });
});
