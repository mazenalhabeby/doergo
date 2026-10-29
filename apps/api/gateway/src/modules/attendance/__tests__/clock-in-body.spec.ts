import { validateBody } from '../../../common/testing/validate-body';
import { ClockInDto } from '../dto/clock-in.dto';

/*
  A clock-in's position is judged as a fix only with its accuracy: lat/lng alone used to pass as a perfect fix
  (audit 2026-10-29). Ranges are the evidence fix's (occurrence.dto.ts).
*/
describe('the clock-in body', () => {
  it.each([
    ['a GPS clock-in (web, phone)', { locationId: 'loc', lat: 47.98, lng: 13.82, accuracy: 12 }],
    ['no position at all (a workspace without a pin, or remote)', { locationId: 'loc' }],
    ['remote with a position', { isRemote: true, lat: 47.98, lng: 13.82, accuracy: 30 }],
  ])('accepts %s', async (_what, payload) => {
    expect(await validateBody(ClockInDto, payload)).toMatchObject({ ok: true });
  });

  it.each([
    ['lat/lng without an accuracy', { locationId: 'loc', lat: 47.98, lng: 13.82 }],
    ['a negative accuracy', { locationId: 'loc', lat: 47.98, lng: 13.82, accuracy: -1 }],
    ['a latitude past the pole', { locationId: 'loc', lat: 91, lng: 13.82, accuracy: 10 }],
    ['a longitude past the date line', { locationId: 'loc', lat: 47.98, lng: -181, accuracy: 10 }],
  ])('refuses %s', async (_what, payload) => {
    expect(await validateBody(ClockInDto, payload)).toMatchObject({ ok: false });
  });
});
