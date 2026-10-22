import 'reflect-metadata';
import { ATTENDANCE_SERVICE_PARTS } from '../attendance-service-parts';
import { BREAK_SERVICES } from '../rests/break-services';
import { ClockOutService } from '../clock-out/clock-out.service';

/*
  Nest finds a constructor's dependencies through the type metadata TypeScript emits.
  A parameter typed as a UNION (`AutoClockService | undefined`) is emitted as `Object`,
  so Nest cannot see the class: an @Optional() one is then silently injected as nothing.
  That happened once when ClockOutService got its own constructor — the automatic
  clock-out stopped being automatic, and only the live e2e noticed (the unit fixtures
  pass arguments by position). Write optional dependencies as `dep?: Class`.
*/
describe('attendance providers declare every dependency by its class', () => {
  const providers = [...new Set([...ATTENDANCE_SERVICE_PARTS, ...BREAK_SERVICES, ClockOutService])];

  it.each(providers.map((p) => [p.name, p] as const))('%s', (_name, provider) => {
    const types: unknown[] = Reflect.getMetadata('design:paramtypes', provider) ?? [];
    const lost = types.map((t, i) => (t === Object || t === undefined ? i : -1)).filter((i) => i >= 0);
    expect(lost).toEqual([]);
  });
});
