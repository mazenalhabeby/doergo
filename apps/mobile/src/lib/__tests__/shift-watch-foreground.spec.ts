/**
 * While on the clock: the foreground heartbeat runs only in front; behind
 * another app the background heartbeat (15 min / 150 m) and native
 * geofencing carry the shift — the server receives the same call from them.
 */
import * as fs from 'fs';
import * as path from 'path';
import { FOREGROUND_HEARTBEAT_MS, graceCountdown, heartbeatDue } from '../../components/time/time-logic';

describe('the foreground heartbeat', () => {
  it('is due every five minutes while the app is in front', () => {
    expect(heartbeatDue(0, FOREGROUND_HEARTBEAT_MS - 1, true)).toBe(false);
    expect(heartbeatDue(0, FOREGROUND_HEARTBEAT_MS, true)).toBe(true);
  });

  it('is never due in the background — no fresh GPS fix behind another app', () => {
    expect(heartbeatDue(0, 60 * 60_000, false)).toBe(false);
  });

  it('on the way back it beats at once if five minutes have gone, never more often', () => {
    expect(heartbeatDue(0, 20 * 60_000, true)).toBe(true);
    expect(heartbeatDue(19 * 60_000, 20 * 60_000, true)).toBe(false);
  });
});

describe('the grace countdown', () => {
  it('reads minutes:seconds, then hours', () => {
    expect(graceCountdown(245_000, 0)).toBe('4:05');
    expect(graceCountdown(3_729_000, 0)).toBe('1:02:09');
    expect(graceCountdown(0, 10_000)).toBe('0:00');
  });
});

describe('the wiring', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../../components/time/use-shift-watch.ts'), 'utf8');
  it('asks heartbeatDue with whether the app is in front — and keeps the background heartbeat armed', () => {
    expect(src).toMatch(/heartbeatDue\(lastBeat\.current, Date\.now\(\), isAppActive\(\)\)/);
    expect(src).toMatch(/startBackgroundHeartbeat\(\)/);
    expect(src).not.toMatch(/setInterval\(\(\) => void heartbeat\(\), 5 \* 60 \* 1000\)/);
  });
  it('the one-second grace clock is useNow, paused in the background', () => {
    expect(src).toMatch(/useNow\(1000, graceRunning\)/);
  });
});
