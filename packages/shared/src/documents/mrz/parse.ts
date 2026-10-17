/** Repairing an OCR'd line and reading each layout (TD1, TD2, TD3, visa). */
import { checks, mrzDate, mrzLines, mrzNames, type MrzFormat, type MrzResult } from './fields';

/**
 * Positional repair: fix the characters OCR confuses, where the format forbids
 * the one it chose.
 *
 * A zone is not free text. Every position has a type — the expiry is six digits,
 * the nationality three letters — and an engine that returns a Q where only a
 * digit may appear has made a mistake the standard itself can correct. Real
 * reads produce exactly this: 0/Q/O, 1/I, 5/S, 8/B.
 *
 * This CANNOT launder a forgery, which is the property that makes it safe. It
 * only ever swaps a character for one of the same shape in a position whose
 * type is fixed, so a forger who changed one digit to another digit is
 * untouched — and if a repair guesses wrong, the check digit still fails. It
 * turns "photograph it again" into a correct read, and nothing else.
 */
const TO_DIGIT: Record<string, string> = {
  O: '0', Q: '0', D: '0', U: '0',
  I: '1', L: '1', T: '7',
  Z: '2', S: '5', B: '8', G: '6', A: '4',
};

const TO_ALPHA: Record<string, string> = {
  '0': 'O', '1': 'I', '2': 'Z', '5': 'S', '8': 'B', '6': 'G', '4': 'A',
};

type Slot = 'n' | 'a' | 'x';

/** The type of every position, by format and line. */
const LAYOUT: Record<string, Slot[]> = {
  // Passports.
  'TD3:1': slots('aa', 'aaa', 'x'.repeat(39)),
  'TD3:2': slots('xxxxxxxxx', 'n', 'aaa', 'nnnnnn', 'n', 'a', 'nnnnnn', 'n', 'x'.repeat(14), 'n', 'n'),
  // ID cards.
  'TD1:1': slots('aa', 'aaa', 'xxxxxxxxx', 'n', 'x'.repeat(15)),
  'TD1:2': slots('nnnnnn', 'n', 'a', 'nnnnnn', 'n', 'aaa', 'x'.repeat(11), 'n'),
  'TD1:3': slots('x'.repeat(30)),
  'TD2:1': slots('aa', 'aaa', 'x'.repeat(31)),
  'TD2:2': slots('xxxxxxxxx', 'n', 'aaa', 'nnnnnn', 'n', 'a', 'nnnnnn', 'n', 'x'.repeat(7), 'n'),
  // Visas: the passport and old-ID layouts, with optional data where the
  // composite would be — so nothing past the expiry digit is forced to a digit.
  'MRVA:1': slots('aa', 'aaa', 'x'.repeat(39)),
  'MRVA:2': slots('xxxxxxxxx', 'n', 'aaa', 'nnnnnn', 'n', 'a', 'nnnnnn', 'n', 'x'.repeat(16)),
  'MRVB:1': slots('aa', 'aaa', 'x'.repeat(31)),
  'MRVB:2': slots('xxxxxxxxx', 'n', 'aaa', 'nnnnnn', 'n', 'a', 'nnnnnn', 'n', 'x'.repeat(8)),
};

function slots(...parts: string[]): Slot[] {
  return parts.join('').split('') as Slot[];
}

/** One line, repaired against the layout its format gives it. */
export function repairMrzLine(line: string, format: MrzFormat, lineNumber: 1 | 2 | 3): string {
  const layout = LAYOUT[`${format}:${lineNumber}`];
  if (!layout || layout.length !== line.length) return line;

  return line
    .split('')
    .map((c, i) => {
      const slot = layout[i];
      if (slot === 'n' && !/[0-9]/.test(c)) return TO_DIGIT[c] ?? c;
      if (slot === 'a' && !/[A-Z<]/.test(c)) return TO_ALPHA[c] ?? c;
      return c;
    })
    .join('');
}

/**
 * Parse and check a zone.
 *
 * Returns null only when the input is not an MRZ at all. A zone that IS one but
 * fails its digits comes back with `allChecksPassed: false` and the reasons —
 * refusing to parse it would leave a reviewer with nothing to look at.
 */
export function parseMrz(raw: string, now: Date = new Date()): MrzResult | null {
  const lines = mrzLines(raw);

  const repair = (fmt: MrzFormat, take: number) =>
    lines.slice(0, take).map((l, i) => repairMrzLine(l, fmt, (i + 1) as 1 | 2 | 3));

  if (lines.length >= 3 && lines.every((l) => l.length === 30)) {
    return parseTd1(repair('TD1', 3) as [string, string, string], now);
  }
  // A visa announces itself with its document code. Checked before the
  // passport and ID layouts, which it would otherwise be mistaken for.
  const isVisa = lines.length >= 2 && lines[0]![0] === 'V';
  if (isVisa && lines[0]!.length === 44 && lines[1]!.length === 44) {
    return parseMrv('MRVA', repair('MRVA', 2) as [string, string], now);
  }
  if (isVisa && lines[0]!.length === 36 && lines[1]!.length === 36) {
    return parseMrv('MRVB', repair('MRVB', 2) as [string, string], now);
  }
  if (lines.length >= 2 && lines[0]!.length === 44 && lines[1]!.length === 44) {
    return parseTd3(repair('TD3', 2) as [string, string], now);
  }
  if (lines.length >= 2 && lines[0]!.length === 36 && lines[1]!.length === 36) {
    return parseTd2(repair('TD2', 2) as [string, string], now);
  }
  return null;
}

/** ID cards: three lines of thirty. */
function parseTd1([l1, l2, l3]: [string, string, string], now: Date): MrzResult {
  const documentNumber = l1.slice(5, 14);
  const documentNumberCheck = l1[14]!;
  const birth = l2.slice(0, 6);
  const birthCheck = l2[6]!;
  const expiry = l2.slice(8, 14);
  const expiryCheck = l2[14]!;

  // The composite runs over the parts of lines one and two the standard names.
  const composite = l1.slice(5, 30) + l2.slice(0, 7) + l2.slice(8, 15) + l2.slice(18, 29);
  const compositeValid = checks(composite, l2[29]!);

  return finish({
    format: 'TD1',
    documentCode: l1.slice(0, 2).replace(/</g, ''),
    issuingState: l1.slice(2, 5).replace(/</g, ''),
    documentNumber: {
      value: documentNumber.replace(/</g, ''),
      checkDigitValid: checks(documentNumber, documentNumberCheck),
    },
    nationality: l2.slice(15, 18).replace(/</g, ''),
    dateOfBirth: { value: mrzDate(birth, 'birth', now), checkDigitValid: checks(birth, birthCheck) },
    sex: l2[7]!.replace(/</g, ''),
    dateOfExpiry: { value: mrzDate(expiry, 'expiry', now), checkDigitValid: checks(expiry, expiryCheck) },
    ...mrzNames(l3),
    compositeValid,
  });
}

/** Older ID cards and some visas: two lines of thirty-six. */
function parseTd2([l1, l2]: [string, string], now: Date): MrzResult {
  const documentNumber = l2.slice(0, 9);
  const birth = l2.slice(13, 19);
  const expiry = l2.slice(21, 27);

  return finish({
    format: 'TD2',
    documentCode: l1.slice(0, 2).replace(/</g, ''),
    issuingState: l1.slice(2, 5).replace(/</g, ''),
    documentNumber: { value: documentNumber.replace(/</g, ''), checkDigitValid: checks(documentNumber, l2[9]!) },
    nationality: l2.slice(10, 13).replace(/</g, ''),
    dateOfBirth: { value: mrzDate(birth, 'birth', now), checkDigitValid: checks(birth, l2[19]!) },
    sex: l2[20]!.replace(/</g, ''),
    dateOfExpiry: { value: mrzDate(expiry, 'expiry', now), checkDigitValid: checks(expiry, l2[27]!) },
    ...mrzNames(l1.slice(5)),
    // TD2 defines a composite over line two, ending at 35.
    compositeValid: checks(
      l2.slice(0, 10) + l2.slice(13, 20) + l2.slice(21, 35),
      l2[35]!,
    ),
  });
}

/** Passports: two lines of forty-four. */
function parseTd3([l1, l2]: [string, string], now: Date): MrzResult {
  const documentNumber = l2.slice(0, 9);
  const birth = l2.slice(13, 19);
  const expiry = l2.slice(21, 27);

  return finish({
    format: 'TD3',
    documentCode: l1.slice(0, 2).replace(/</g, ''),
    issuingState: l1.slice(2, 5).replace(/</g, ''),
    documentNumber: { value: documentNumber.replace(/</g, ''), checkDigitValid: checks(documentNumber, l2[9]!) },
    nationality: l2.slice(10, 13).replace(/</g, ''),
    dateOfBirth: { value: mrzDate(birth, 'birth', now), checkDigitValid: checks(birth, l2[19]!) },
    sex: l2[20]!.replace(/</g, ''),
    dateOfExpiry: { value: mrzDate(expiry, 'expiry', now), checkDigitValid: checks(expiry, l2[27]!) },
    ...mrzNames(l1.slice(5)),
    compositeValid: checks(
      l2.slice(0, 10) + l2.slice(13, 20) + l2.slice(21, 43),
      l2[43]!,
    ),
  });
}

/**
 * Visas: line two carries the same fields at the same places as a passport's,
 * each with its own check digit — and no composite. `compositeValid: null`
 * says "this format has none", which `finish` does not count as a failure.
 */
function parseMrv(format: 'MRVA' | 'MRVB', [l1, l2]: [string, string], now: Date): MrzResult {
  const documentNumber = l2.slice(0, 9);
  const birth = l2.slice(13, 19);
  const expiry = l2.slice(21, 27);

  return finish({
    format,
    documentCode: l1.slice(0, 2).replace(/</g, ''),
    issuingState: l1.slice(2, 5).replace(/</g, ''),
    documentNumber: { value: documentNumber.replace(/</g, ''), checkDigitValid: checks(documentNumber, l2[9]!) },
    nationality: l2.slice(10, 13).replace(/</g, ''),
    dateOfBirth: { value: mrzDate(birth, 'birth', now), checkDigitValid: checks(birth, l2[19]!) },
    sex: l2[20]!.replace(/</g, ''),
    dateOfExpiry: { value: mrzDate(expiry, 'expiry', now), checkDigitValid: checks(expiry, l2[27]!) },
    ...mrzNames(l1.slice(5)),
    compositeValid: null,
  });
}

/** Collect the failures once, so every format reports them the same way. */
function finish(
  partial: Omit<MrzResult, 'allChecksPassed' | 'failures'>,
): MrzResult {
  const failures: string[] = [];
  if (partial.documentNumber.checkDigitValid === false) failures.push('documentNumber');
  if (partial.dateOfBirth.checkDigitValid === false) failures.push('dateOfBirth');
  if (partial.dateOfExpiry.checkDigitValid === false) failures.push('dateOfExpiry');
  if (partial.compositeValid === false) failures.push('composite');
  // A date that does not exist is as much a failure as a digit that disagrees.
  if (partial.dateOfBirth.value === null) failures.push('dateOfBirthUnreadable');
  if (partial.dateOfExpiry.value === null) failures.push('dateOfExpiryUnreadable');

  return { ...partial, allChecksPassed: failures.length === 0, failures };
}
