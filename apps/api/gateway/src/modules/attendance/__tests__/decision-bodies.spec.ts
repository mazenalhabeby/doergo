import { validateBody } from '../../../common/testing/validate-body';
import {
  ApproveExcursionDto,
  DecisionNotesDto,
  EditEntryDto,
  ForgotClockOutDto,
  RejectEntryDto,
  ReportExcursionDto,
  ResolveNoShowDto,
} from '../dto/decision-bodies.dto';

/*
  B3: the attendance decision bodies are classes now, run through the server's own pipe
  (whitelist + forbidNonWhitelisted + implicit conversion). Each case is what a real client
  sends — web lib/api, the phone's lib/api, and the approvals inbox (kind-routes.ts).
*/
describe('attendance decision bodies', () => {
  it.each([
    [
      'no-show excuse from the inbox',
      ResolveNoShowDto,
      { action: 'excuse', reasonCode: 'SICK', reason: 'flu', wholeRun: true },
    ],
    ['no-show absent from the inbox', ResolveNoShowDto, { action: 'absent' }],
    ['no-show from the web (reason undefined → absent)', ResolveNoShowDto, { action: 'reopen' }],
    ['end a break / approve an entry', DecisionNotesDto, { notes: 'ok' }],
    ['approve with no body', DecisionNotesDto, {}],
    ['reject an entry', RejectEntryDto, { reason: 'wrong day' }],
    ['report an excursion (phone)', ReportExcursionDto, { reason: 'supplier run', requestedMinutes: 30 }],
    ['approve an excursion, adjusted', ApproveExcursionDto, { grantedMinutes: 20 }],
    ['approve an excursion, as asked', ApproveExcursionDto, {}],
    ['forgotten clock-out', ForgotClockOutDto, { clockOutAt: '2026-10-17T16:00:00.000Z' }],
    [
      'edit an entry (web dialog and phone sheet)',
      EditEntryDto,
      {
        clockInAt: '2026-10-17T07:00:00.000Z',
        clockOutAt: '2026-10-17T15:00:00.000Z',
        notes: 'n',
        timezone: 'Europe/Vienna',
        reason: 'forgot',
      },
    ],
  ])('accepts %s', async (_what, dto, payload) => {
    const r = await validateBody(dto as new () => object, payload);
    expect(r).toMatchObject({ ok: true });
  });

  it('a missing required field still reaches the service (its own coded refusal)', async () => {
    expect(await validateBody(RejectEntryDto, {})).toMatchObject({ ok: true });
    expect(await validateBody(ForgotClockOutDto, {})).toMatchObject({ ok: true });
  });

  it('a numeric string is read as the number it was (Number() did the same before)', async () => {
    const r = await validateBody(ReportExcursionDto, { reason: 'x', requestedMinutes: '30' });
    expect(r).toEqual({ ok: true, body: expect.objectContaining({ requestedMinutes: 30 }) });
  });

  it('null stays null — implicit conversion does not turn it into 0', async () => {
    const r = await validateBody(ApproveExcursionDto, { grantedMinutes: null });
    expect(r).toEqual({ ok: true, body: expect.objectContaining({ grantedMinutes: null }) });
  });

  it('refuses a wrong type and an unknown key', async () => {
    expect(await validateBody(ReportExcursionDto, { reason: 'x', requestedMinutes: 'half an hour' })).toMatchObject({
      ok: false,
    });
    expect(await validateBody(ResolveNoShowDto, { action: 'delete' })).toMatchObject({ ok: false });
    expect(await validateBody(DecisionNotesDto, { notes: 'x', approvedBy: 'me' })).toMatchObject({ ok: false });
  });
});
