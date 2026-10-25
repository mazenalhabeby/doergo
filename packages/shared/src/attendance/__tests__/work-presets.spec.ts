import { effectiveClockRules, presetOfWorkspace, PRESET_RULES } from '../work-presets';

/** One question per workspace, and a worker's own way of working there (clock review D1). */
describe('work presets', () => {
  it('a workspace whose columns match a preset reads as it; changed details read as CUSTOM', () => {
    expect(presetOfWorkspace(PRESET_RULES.FIXED_SHIFTS)).toBe('FIXED_SHIFTS');
    expect(presetOfWorkspace(PRESET_RULES.IN_THE_FIELD)).toBe('IN_THE_FIELD');
    expect(presetOfWorkspace({ workModel: 'NONE', geofencePolicy: 'STRICT', noShiftPolicy: 'LIMIT' })).toBe('CUSTOM');
  });

  it('defaults (a workspace nobody set up) are flexible hours — today’s behaviour', () => {
    expect(presetOfWorkspace({})).toBe('FLEXIBLE_HOURS');
  });

  it('no override → the workspace’s own rules', () => {
    const ws = { ...PRESET_RULES.FIXED_SHIFTS, noShiftDailyMinutes: 480 };
    expect(effectiveClockRules(ws, null)).toEqual({ ...ws, ownRules: false });
  });

  it('a flexible worker in a fixed-shift workspace: no rota needed, own daily hours', () => {
    const ws = { ...PRESET_RULES.FIXED_SHIFTS, noShiftDailyMinutes: 480 };
    const r = effectiveClockRules(ws, { workAs: 'FLEXIBLE_HOURS', workDailyMinutes: 510 });
    expect(r).toMatchObject({
      workModel: 'NONE',
      noShiftPolicy: 'ALLOW',
      geofencePolicy: 'STRICT',
      noShiftDailyMinutes: 510,
      ownRules: true,
    });
  });

  it('own hours only (same way of working) still count as own rules; hours are clamped', () => {
    const r = effectiveClockRules({ noShiftDailyMinutes: 480 }, { workDailyMinutes: 5000 });
    expect(r.noShiftDailyMinutes).toBe(1440);
    expect(r.ownRules).toBe(true);
  });

  it('an unknown value is ignored, never trusted', () => {
    expect(effectiveClockRules({ geofencePolicy: 'STRICT' }, { workAs: 'ROOT' }).ownRules).toBe(false);
  });
});
