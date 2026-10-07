import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { cleanPhone, meetingFieldsFor, meetingProvider, telHref } from '@hbcfield/shared';
import { EventsService } from '../events.service';

/*
  How and where an appointment happens. The server decides what is saved: a workspace address is
  read from the workspace, an office must be yours, a client site needs CRM, and a mode switch
  clears the fields of the old mode.
*/

const caller = { userId: 'me', organizationId: 'org', role: 'EMPLOYEE' };
const soon = () => new Date(Date.now() + 3 * 86400000);
const input = (extra: Record<string, unknown> = {}) => {
  const s = soon();
  return { title: 'Visit', startAt: s.toISOString(), endAt: new Date(s.getTime() + 3600000).toISOString(), ...extra };
};

function make() {
  const prisma: any = {
    organization: { findUnique: jest.fn().mockResolvedValue({ timezone: 'Europe/Vienna' }) },
    user: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn().mockResolvedValue({ firstName: 'A', lastName: 'B' }) },
    spaceAssignment: { findMany: jest.fn().mockResolvedValue([]) },
    companyLocation: { findFirst: jest.fn().mockResolvedValue({ id: 'office', name: 'Main Office', address: 'Arbeiterheimstraße 32, Laakirchen' }) },
    customer: { findFirst: jest.fn().mockResolvedValue({ id: 'c1' }) },
    calendarEvent: { create: jest.fn().mockResolvedValue({ id: 'e1' }), findFirst: jest.fn().mockResolvedValue(null), findUnique: jest.fn().mockResolvedValue(null) },
    calendarAttendee: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const rules: any = { workspacesOf: jest.fn().mockResolvedValue(['office']) };
  const svc = new EventsService(prisma, rules, { emit: jest.fn() } as any);
  // The read-back after create is not under test here.
  jest.spyOn(svc, 'get').mockResolvedValue({ data: {} } as any);
  return { svc, prisma, rules };
}
const saved = (prisma: any) => prisma.calendarEvent.create.mock.calls[0][0].data;

describe('shared meeting rules', () => {
  it('a mode keeps only its own fields', () => {
    const all = { mode: 'ONLINE' as const, place: 'OFFICE' as const, placeSpaceId: 's', room: 'R1', location: 'Street 1', meetingUrl: 'https://x', phone: '+43 1', callDirection: 'INCOMING' as const };
    expect(meetingFieldsFor(all)).toMatchObject({ meetingUrl: 'https://x', location: null, phone: null, placeSpaceId: null, room: null });
    expect(meetingFieldsFor({ ...all, mode: 'PHONE' })).toMatchObject({ phone: '+43 1', callDirection: 'INCOMING', meetingUrl: null, location: null });
    expect(meetingFieldsFor({ ...all, mode: 'IN_PERSON', place: 'ADDRESS' })).toMatchObject({ location: 'Street 1', placeSpaceId: null, room: null, meetingUrl: null });
    expect(meetingFieldsFor({ ...all, mode: 'IN_PERSON', place: 'OFFICE' })).toMatchObject({ placeSpaceId: 's', room: 'R1', meetingUrl: null, phone: null });
  });

  it('recognises meeting services by host only', () => {
    expect(meetingProvider('https://teams.microsoft.com/l/meetup-join/19')).toBe('TEAMS');
    expect(meetingProvider('https://meet.google.com/abc-defg-hij')).toBe('MEET');
    expect(meetingProvider('https://us02web.zoom.us/j/123')).toBe('ZOOM');
    expect(meetingProvider('https://evil.example/teams.microsoft.com')).toBeNull();
    expect(meetingProvider('not a url')).toBeNull();
  });

  it('a phone number is checked and dialled as digits', () => {
    expect(cleanPhone('+43 1 234 56-78')).toBe('+43 1 234 56-78');
    expect(cleanPhone('call me')).toBeNull();
    expect(cleanPhone('12')).toBeNull();
    expect(telHref('+43 (1) 234-5678')).toBe('tel:+4312345678');
  });
});

describe('the server decides what is saved', () => {
  it('at our office: the address comes from the workspace, never from the form', async () => {
    const { svc, prisma } = make();
    await svc.create({ ...caller, input: input({ meetingMode: 'IN_PERSON', placeKind: 'OFFICE', placeSpaceId: 'office', room: 'Room 1', location: 'somewhere else entirely' }) });
    expect(saved(prisma)).toMatchObject({ meetingMode: 'IN_PERSON', placeKind: 'OFFICE', placeSpaceId: 'office', room: 'Room 1', location: 'Arbeiterheimstraße 32, Laakirchen', meetingUrl: null });
  });

  it('an office the caller does not work in is refused', async () => {
    const { svc, rules, prisma } = make();
    rules.workspacesOf.mockResolvedValue(['elsewhere']);
    const err = await svc.create({ ...caller, input: input({ meetingMode: 'IN_PERSON', placeKind: 'OFFICE', placeSpaceId: 'office' }) }).catch((e) => e);
    expect(err).toBeInstanceOf(ForbiddenException);
    expect(err.getResponse()).toMatchObject({ code: 'EVENT_OFFICE_NOT_YOURS' });
    expect(prisma.calendarEvent.create).not.toHaveBeenCalled();
  });

  it("the client's site needs a client — and so CRM access", async () => {
    const { svc } = make();
    const noClient = await svc.create({ ...caller, crm: true, input: input({ meetingMode: 'IN_PERSON', placeKind: 'CLIENT_SITE', location: 'Favoritenstraße 12' }) }).catch((e) => e);
    expect(noClient.getResponse()).toMatchObject({ code: 'EVENT_CLIENT_REQUIRED' });
    const noCrm = await svc.create({ ...caller, input: input({ meetingMode: 'IN_PERSON', placeKind: 'CLIENT_SITE', customerId: 'c1', location: 'Favoritenstraße 12' }) }).catch((e) => e);
    expect(noCrm).toBeInstanceOf(ForbiddenException);
  });

  it('online keeps the link and drops a stale address; phone checks the number', async () => {
    const { svc, prisma } = make();
    await svc.create({ ...caller, input: input({ meetingMode: 'ONLINE', meetingUrl: 'https://meet.google.com/abc', location: 'old address' }) });
    expect(saved(prisma)).toMatchObject({ meetingMode: 'ONLINE', meetingUrl: 'https://meet.google.com/abc', location: null });
    const bad = await svc.create({ ...caller, input: input({ meetingMode: 'PHONE', phone: 'tomorrow' }) }).catch((e) => e);
    expect(bad).toBeInstanceOf(BadRequestException);
    expect(bad.getResponse()).toMatchObject({ code: 'EVENT_PHONE_INVALID' });
  });

  it('a reminder has no place, whatever the form sent', async () => {
    const { svc, prisma } = make();
    await svc.create({ ...caller, input: input({ kind: 'REMINDER', meetingMode: 'ONLINE', meetingUrl: 'https://meet.google.com/abc', location: 'x' }) });
    expect(saved(prisma)).toMatchObject({ kind: 'REMINDER', meetingMode: null, meetingUrl: null, location: null });
  });
});
