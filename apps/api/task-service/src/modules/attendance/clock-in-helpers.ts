import { BadRequestException } from '@nestjs/common';
import { type NoShiftAllowance } from '@hbcfield/shared';

// tz-lookup: offline coords → IANA timezone (single in-memory lookup, no types pkg).
const tzlookup: (lat: number, lon: number) => string = require('tz-lookup');

/** Why a clock-in with no shift was refused, in words and a code the phone translates. */
function noShiftRefusal(allowance: Extract<NoShiftAllowance, { kind: 'refused' }>, spaceName: string): BadRequestException {
  if (allowance.reason === 'SHIFT_ONLY') {
    return new BadRequestException({
      message: `You have no shift today. ${spaceName} only allows clocking in with a shift.`,
      code: 'NO_SHIFT_TODAY',
    });
  }
  const hours = Math.round(((allowance.dailyMinutes ?? 0) / 60) * 10) / 10;
  return new BadRequestException({
    message: `No hours left today. ${spaceName} allows ${hours} h a day without a shift, and you have worked them. Ask your leader for a shift.`,
    code: 'NO_HOURS_LEFT',
  });
}

export { tzlookup, noShiftRefusal };
