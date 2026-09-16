import {
  CARD_FRAMES, CARD_FRAME_GAP_MS, CARD_FRAME_BUDGET_MS,
  frameGapAfter, parseCardPasses, wantsAnotherFrame,
} from '../card-scan';
import type { CardLine } from '@hbcfield/shared/client';

/**
 * HOW LONG THE MEMBER WAITS, decided here rather than inside a capture loop.
 *
 * Looking at a card two or three times is the largest accuracy win available
 * on-device — a line lost to glare in one frame is usually present in the next.
 * It is also the easiest way to make a scanner feel slow, and a scanner that
 * feels slow is one people stop using, which costs every line rather than one.
 * So the two rules that bound it are pure and tested: when to stop, and how
 * long to pause.
 */

const L = (text: string, y: number): CardLine => ({ text, y, height: 0.06, x: 0.05, width: 0.9 });

describe('when to stop looking', () => {
  it('takes more than one look', () => {
    expect(CARD_FRAMES).toBeGreaterThan(1);
    expect(wantsAnotherFrame(1, 0)).toBe(true);
  });

  it('stops at the frame count', () => {
    expect(wantsAnotherFrame(CARD_FRAMES, 0)).toBe(false);
  });

  it('stops early on a phone that is being slow about it', () => {
    // The member is holding a card out in front of a camera. Two passes now
    // beat three passes in four seconds.
    expect(wantsAnotherFrame(1, CARD_FRAME_BUDGET_MS + 1)).toBe(false);
  });

  it('never runs before the first look has happened', () => {
    // The first frame is always awaited in full — it is the whole answer if
    // the others fail — so "another" is meaningless before it.
    expect(wantsAnotherFrame(0, 0)).toBe(false);
  });
});

describe('how long to pause between looks', () => {
  it('pauses when the last frame was quick', () => {
    // Consecutive frames of a STILL card must actually differ, or the merge
    // has nothing to recover: three copies of one mistake is one mistake.
    expect(frameGapAfter(0)).toBe(CARD_FRAME_GAP_MS);
  });

  it('does NOT pause when the last frame already took that long', () => {
    /*
      The gap exists to let the picture change, not to pass time. A frame that
      took a quarter of a second has had its quarter second — the sensor went
      on metering and focusing while the recogniser worked. Sleeping anyway is
      how "look twice" turns into "the scanner got slower".
    */
    expect(frameGapAfter(CARD_FRAME_GAP_MS)).toBe(0);
    expect(frameGapAfter(CARD_FRAME_GAP_MS * 4)).toBe(0);
  });

  it('keeps the whole extra cost under the budget', () => {
    // Worst case: every frame instant, so every gap is paid in full.
    const gaps = (CARD_FRAMES - 1) * CARD_FRAME_GAP_MS;
    expect(gaps).toBeLessThan(CARD_FRAME_BUDGET_MS);
  });
});

describe('several looks become one card', () => {
  it('recovers a line one frame missed — the whole point', () => {
    // The real failure: a shadow across the half of the card carrying the
    // email, so the first frame never produced it.
    const { card } = parseCardPasses([
      [L('Gasthaus Seeblick', 0.12), L('Seepromenade 4, 4810 Gmunden', 0.5)],
      [L('Gasthaus Seeblick', 0.12), L('office@seeblick.at', 0.72)],
    ]);
    expect(card.email?.value).toBe('office@seeblick.at');
    expect(card.address?.value).toContain('Seepromenade 4');
  });

  it('is not broken by a frame that read nothing', () => {
    // A shot taken while the camera was still focusing contributes nothing and
    // must cost the scan that frame, not the card.
    const good = [L('Gasthaus Seeblick', 0.12), L('office@seeblick.at', 0.72)];
    expect(parseCardPasses([good, [], []]).card.email?.value).toBe('office@seeblick.at');
    expect(parseCardPasses([[], good]).card.email?.value).toBe('office@seeblick.at');
  });

  it('says so when the look was bad', () => {
    // Two lines off a business card means something was missed, whatever the
    // recogniser's own confidence says. Presenting them as a finished answer
    // is what makes a reader feel broken.
    expect(parseCardPasses([[L('Anna Gruber', 0.2), L('+43 664 1 2345', 0.5)]]).quality.poor).toBe(true);
  });

  it('does not cry wolf on a card that came through', () => {
    const full = [
      L('Gasthaus Seeblick', 0.12), L('Anna Gruber', 0.32),
      L('Seepromenade 4, 4810 Gmunden', 0.5), L('+43 7612 123 45', 0.62),
      L('office@seeblick.at', 0.72), L('www.seeblick.at', 0.84),
    ];
    expect(parseCardPasses([full, full]).quality.poor).toBe(false);
  });

  it('survives being handed nothing at all', () => {
    // A camera that fumbled every frame. The screen has its own message for
    // this; what it must not get is a throw on a screen somebody is waiting on.
    const { card, quality } = parseCardPasses([[], []]);
    expect(card.lines).toEqual([]);
    expect(quality.poor).toBe(true);
  });
});
