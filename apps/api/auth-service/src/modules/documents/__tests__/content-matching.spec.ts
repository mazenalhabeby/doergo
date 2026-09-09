import {
  needsScan,
  matchTextToMember,
  mergeMatch,
  readContent,
  readEmailsFromText,
  readPeriodFromText,
  matchFile,
  type FileMatch,
  type MatchCandidate,
} from '@hbcfield/shared';

/**
 * Reading the document instead of only its name.
 *
 * The case that forced this: a freelancer sends `8.pdf` — the invoice NUMBER —
 * and the page says "DATE 31.08.2026". The filename matcher had nothing to work
 * with, so a monthly document was refused for having no period while the period
 * was printed on the first line of the file.
 *
 * The text below is what a real PDF extractor returns for that invoice, in
 * reading order. It is kept verbatim, including the "DUE DATE 14.09.2026" that
 * is the whole reason these rules are label-driven.
 */
const INVOICE_8 = `
Peter Jedlička
DIČ:1076874215
Business Number 52401448
922 41 Drahovce, Slovakia, Važina 1082/20A
907152935
peterjedlicka0@gmail.com
INVOICE
8
DATE
31.08.2026
DUE DATE
14.09.2026
BALANCE DUE
EUR €7,970.00
BILL TO
HBC GmbH
Kapellenstraße 30
4664 Laakirchen
Austria
office@hbc-group.eu
DESCRIPTION RATE QTY AMOUNT
I am billing you for electrical services for the month of August
€8,470.00 1 €8,470.00
Depozit -€500.00 1 -€500.00
TOTAL €7,970.00
`;

const PETER: MatchCandidate = {
  id: 'u-peter',
  firstName: 'Peter',
  lastName: 'Jedlička',
  email: 'peterjedlicka0@gmail.com',
};
const MONIKA: MatchCandidate = {
  id: 'u-monika',
  firstName: 'Monika',
  lastName: 'Holub',
  email: 'monika@example.com',
};
const CANDIDATES = [PETER, MONIKA];

describe('the period printed on a document', () => {
  it('reads the labelled invoice date, not the due date', () => {
    const p = readPeriodFromText(INVOICE_8);
    expect(p).toEqual({ year: 2026, month: 8, label: 'date' });
  });

  /*
    The single most important assertion here. Taking the due date files
    August's invoice under September, where nobody looks for it and nobody
    notices, because the row still says "Freelancer Invoice".
  */
  it('never takes a due date, even when it is the only date present', () => {
    expect(readPeriodFromText('DUE DATE 14.09.2026')).toBeNull();
    expect(readPeriodFromText('Fällig am 14.09.2026')).toBeNull();
    expect(readPeriodFromText('Payable 14/09/2026')).toBeNull();
  });

  it('ignores a date with no label at all', () => {
    // A number in an address or a reference is not a period.
    expect(readPeriodFromText('Order 31.08.2026 shipped')).toBeNull();
  });

  it('reads German labels', () => {
    expect(readPeriodFromText('Rechnungsdatum: 05.03.2026')).toMatchObject({ year: 2026, month: 3 });
    expect(readPeriodFromText('Leistungszeitraum 08/2026')).toMatchObject({ year: 2026, month: 8 });
  });

  it('reads a month written as a word', () => {
    expect(readPeriodFromText('Billing period August 2026')).toMatchObject({ year: 2026, month: 8 });
  });

  it('reads ISO, which some systems print', () => {
    expect(readPeriodFromText('Invoice date 2026-08-31')).toMatchObject({ year: 2026, month: 8 });
  });

  /*
    Two labelled dates that disagree describe a document these rules do not
    understand. Picking the first would be a coin toss dressed up as an answer.
  */
  it('returns nothing when two labelled dates disagree', () => {
    expect(readPeriodFromText('Invoice date 31.08.2026 ... Period 30.06.2026')).toBeNull();
  });

  it('accepts two labelled dates that agree', () => {
    expect(readPeriodFromText('Datum 31.08.2026 Leistungszeitraum 01.08.2026'))
      .toMatchObject({ year: 2026, month: 8 });
  });

  it('rejects a date of birth, which is labelled but never a period', () => {
    expect(readPeriodFromText('Geburtsdatum 31.08.1986')).toBeNull();
  });
});

describe('whose document it is, according to the document', () => {
  it('matches on an email printed in the file', () => {
    expect(matchTextToMember(INVOICE_8, CANDIDATES)).toEqual({
      userId: 'u-peter',
      reason: 'email in the document',
    });
  });

  it('matches on a full name when no email is recognised', () => {
    const noEmail = { ...PETER, email: 'p.jedlicka@company.test' };
    expect(matchTextToMember(INVOICE_8, [noEmail, MONIKA])?.userId).toBe('u-peter');
  });

  /*
    A surname somewhere in a page of text is nearly no evidence — the filename
    matcher's FUZZY tier exists because a filename is short and deliberate, and
    a document is neither.
  */
  it('refuses a surname-only match, which the filename matcher would allow', () => {
    const text = 'Delivery note. Received by Holub on arrival.';
    expect(matchFile('holub_m.pdf', CANDIDATES).confidence).toBe('FUZZY');
    expect(matchTextToMember(text, CANDIDATES)).toBeNull();
  });

  it('finds every email, folded and deduplicated', () => {
    expect(readEmailsFromText(INVOICE_8)).toEqual([
      'peterjedlicka0@gmail.com',
      'office@hbc-group.eu',
    ]);
  });
});

/*
  The performance half. Opening a PDF costs orders of magnitude more than
  reading its name, and a payroll drop of thirty properly-named files should
  cost exactly nothing extra.
*/
describe('when it is worth opening the file at all', () => {
  const named = (name: string) => matchFile(name, CANDIDATES);

  it('does not open a well-named monthly file', () => {
    expect(needsScan(named('2026-08_jedlicka_peter.pdf'), 'MONTHLY')).toBe(false);
  });

  it('opens 8.pdf, which answers nothing', () => {
    expect(needsScan(named('8.pdf'), 'MONTHLY')).toBe(true);
  });

  it('opens a file that names the person but not the period', () => {
    expect(needsScan(named('jedlicka_peter.pdf'), 'MONTHLY')).toBe(true);
    // …and leaves it shut when the type needs no period.
    expect(needsScan(named('jedlicka_peter.pdf'), 'ONE_OFF')).toBe(false);
  });

  it('opens a file that dates itself but names nobody', () => {
    expect(needsScan(named('2026-08.pdf'), 'ONE_OFF')).toBe(true);
  });

  it('an annual type is satisfied by a bare year', () => {
    expect(needsScan(named('2026_jedlicka_peter.pdf'), 'ANNUAL')).toBe(false);
    expect(needsScan(named('2026_jedlicka_peter.pdf'), 'MONTHLY')).toBe(true);
  });

  /*
    A guess is worth one parse. Confirming "jedlicka_p" costs far less than one
    payslip filed against the wrong person.
  */
  it('opens the file to confirm a surname-and-initial guess', () => {
    expect(named('jedlicka_p.pdf').confidence).toBe('FUZZY');
    expect(needsScan(named('jedlicka_p.pdf'), 'ONE_OFF')).toBe(true);
  });
});

describe('the filename and the document, reconciled', () => {
  const fromName = (name: string): FileMatch => matchFile(name, CANDIDATES);

  it('fills both silences for a file called 8.pdf', () => {
    const name = fromName('8.pdf');
    expect(name.userId).toBeNull();
    expect(name.periodYear).toBeNull();

    const merged = mergeMatch(name, readContent(INVOICE_8, CANDIDATES));
    expect(merged).toMatchObject({
      userId: 'u-peter',
      confidence: 'EXACT',
      periodYear: 2026,
      periodMonth: 8,
      periodSource: 'content',
      memberSource: 'content',
    });
  });

  /*
    A payroll system naming a file `2026-08_...` is making a deliberate
    statement. Text on a page is an inference, and an inference does not
    overrule a statement.
  */
  it('lets the filename win where it speaks', () => {
    const name = fromName('2026-07_jedlicka_peter.pdf');
    const merged = mergeMatch(name, readContent(INVOICE_8, CANDIDATES));
    expect(merged.periodYear).toBe(2026);
    expect(merged.periodMonth).toBe(7);
    expect(merged.periodSource).toBeUndefined();
    // …but it says so, because one of the two is wrong.
    expect(merged.periodConflict).toBe(true);
  });

  it('raises no conflict when they agree', () => {
    const merged = mergeMatch(fromName('2026-08_jedlicka_peter.pdf'), readContent(INVOICE_8, CANDIDATES));
    expect(merged.periodConflict).toBeUndefined();
  });

  /*
    The filename says one person and the page says another. That is not a tie
    to break — it is a renamed file or the wrong PDF, and the row goes back to
    the human.
  */
  it('refuses when the filename and the document name different members', () => {
    const merged = mergeMatch(fromName('holub_monika.pdf'), readContent(INVOICE_8, CANDIDATES));
    expect(merged.userId).toBeNull();
    expect(merged.confidence).toBe('UNMATCHED');
    expect(merged.reason).toBe('the filename and the document name different members');
  });

  it('promotes a fuzzy filename guess the document confirms', () => {
    const name = fromName('jedlicka_p.pdf');
    expect(name.confidence).toBe('FUZZY');
    const merged = mergeMatch(name, readContent(INVOICE_8, CANDIDATES));
    expect(merged.confidence).toBe('EXACT');
    expect(merged.userId).toBe('u-peter');
  });

  it('changes nothing when the document yields nothing', () => {
    const name = fromName('2026-08_jedlicka_peter.pdf');
    expect(mergeMatch(name, readContent('no dates, no names, nothing', CANDIDATES))).toEqual(name);
  });
});
