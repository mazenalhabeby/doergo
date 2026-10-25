import { BadRequestException } from '@nestjs/common';

// tz-lookup: offline coords → IANA timezone (single in-memory lookup, no types pkg).
const tzlookup: (lat: number, lon: number) => string = require('tz-lookup');

/**
 * A clock-in with no shift where the workspace only works with shifts — the ONE no-shift refusal left: past
 * the daily hours a clock-in is kept and flagged, never refused (time counting model; clock review B3).
 */
function noShiftRefusal(spaceName: string): BadRequestException {
  return new BadRequestException({
    message: `You have no shift today. ${spaceName} only allows clocking in with a shift.`,
    code: 'NO_SHIFT_TODAY',
  });
}

export { tzlookup, noShiftRefusal };
