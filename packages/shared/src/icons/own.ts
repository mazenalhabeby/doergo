/**
 * Our own marks — drawn for HBC Field on Solar's grid and in its manner (24×24, currentColor, the soft layer at
 * half strength), for what no Solar mark says. Approved on the clock-icons board (2026-10-26).
 *
 * The clock is a STOPWATCH: play starts the time, stop ends it, and while it runs a hand turns in the dial.
 * The LAST element of each is the part that moves (the web's globals.css keys on `> :last-child`): the play /
 * stop glyph pops on hover, the running hand sweeps. Keep it last.
 */
const DIAL =
  '<circle cx="12" cy="13.5" r="8.5" fill="currentColor" opacity=".5"/>' +
  '<g fill="currentColor"><rect x="9.5" y="1.75" width="5" height="2" rx="1"/><rect x="11.25" y="3.4" width="1.5" height="1.8"/></g>' +
  '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.75" d="M18.4 5.6l1.5 1.5"/>';

export const HBC_ICONS = {
  /** stopwatch + play — start the clock */
  clockIn:
    DIAL +
    '<path fill="currentColor" d="M10.4 10.6v5.8c0 .62.7.98 1.2.62l4.1-2.9a.76.76 0 0 0 0-1.24l-4.1-2.9a.76.76 0 0 0-1.2.62Z"/>',
  /** stopwatch + stop — end the clock */
  clockOut: DIAL + '<rect fill="currentColor" x="9.2" y="10.7" width="5.6" height="5.6" rx="1.4"/>',
  /** stopwatch with its hand — the clock is running */
  clockRunning:
    DIAL +
    '<circle cx="12" cy="13.5" r="1.3" fill="currentColor"/>' +
    '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.75" d="M12 13.5V8.2"/>',
} as const;
