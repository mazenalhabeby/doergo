import { mergeCardPasses, cardReadQuality } from '@hbcfield/shared/client';

const line = (text: string, y: number, over: Record<string, number> = {}) => ({
  text, y, height: 0.06, x: 0.05, width: 0.9, ...over,
});

describe('looking twice at one card', () => {
  it('recovers a line one pass missed — the whole point', () => {
    // The real failure: a shadow across the half of the card carrying the
    // email, so the first frame never produced it.
    const a = [line('Jasmin Walther', 0.1), line('Rathausplatz 1', 0.3)];
    const b = [line('Jasmin Walther', 0.1), line('jasmin.walther@gmunden.ooe.gv.at', 0.2)];
    const merged = mergeCardPasses([a, b]);
    expect(merged.map((l) => l.text)).toContain('jasmin.walther@gmunden.ooe.gv.at');
  });

  it('keeps a line seen only ONCE', () => {
    // Demanding a majority reads as rigorous and deletes the VAT number and the
    // mobile — the small print only the best frame catches.
    const merged = mergeCardPasses([
      [line('BILLA AG', 0.1)],
      [line('BILLA AG', 0.1)],
      [line('ATU12345678', 0.5)],
    ]);
    expect(merged.map((l) => l.text)).toContain('ATU12345678');
    expect(merged.find((l) => l.text === 'ATU12345678')?.seen).toBe(1);
    expect(merged.find((l) => l.text === 'BILLA AG')?.seen).toBe(2);
  });

  it('does not show one fact three times', () => {
    // Two readings of one line differ exactly where it does not matter.
    const merged = mergeCardPasses([
      [line('Rathausplatz 1, 4810 Gmunden', 0.3)],
      [line('Rathausplatz 1 , 4810 Gmunden', 0.3)],
      [line('Rathausplatz 1, 481O Gmunden', 0.3)],
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.seen).toBe(3);
  });

  it('heals a truncated line rather than showing both halves', () => {
    // A lost TLD is the characteristic OCR tail failure. The two fold to
    // DIFFERENT keys, so this needs its own prefix rule, not a tie-break.
    const merged = mergeCardPasses([
      [line('dvd-personal', 0.4)],
      [line('dvd-personal.com', 0.4)],
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.text).toBe('dvd-personal.com');
    expect(merged[0]!.seen).toBe(2);
  });

  it('does NOT merge two real places that share a prefix', () => {
    // `wien` is a prefix of `wienerneustadt`; merging them loses a town.
    const merged = mergeCardPasses([[line('Wien', 0.4)], [line('Wiener Neustadt', 0.5)]]);
    expect(merged.map((l) => l.text).sort()).toEqual(['Wien', 'Wiener Neustadt']);
  });

  it('does NOT merge a first name into a full name', () => {
    const merged = mergeCardPasses([[line('Anna', 0.1)], [line('Anna Gruber', 0.2)]]);
    expect(merged).toHaveLength(2);
  });

  it('prefers the reading seen most often over a longer stray', () => {
    const merged = mergeCardPasses([
      [line('Siemens AG', 0.1)],
      [line('Siemens AG', 0.1)],
      [line('Siemens AG .', 0.1)],
    ]);
    expect(merged[0]!.text).toBe('Siemens AG');
  });

  it('restores reading order regardless of which pass found what', () => {
    const merged = mergeCardPasses([
      [line('bottom', 0.9)],
      [line('top', 0.1), line('middle', 0.5)],
    ]);
    expect(merged.map((l) => l.text)).toEqual(['top', 'middle', 'bottom']);
  });

  it('survives an out-of-focus frame that produced nothing', () => {
    const merged = mergeCardPasses([[], [line('BILLA AG', 0.1)], []]);
    expect(merged.map((l) => l.text)).toEqual(['BILLA AG']);
    expect(merged[0]!.passes).toBe(1);
  });

  it('never throws on whatever the recogniser produced', () => {
    expect(() => mergeCardPasses([])).not.toThrow();
    expect(mergeCardPasses([])).toEqual([]);
    expect(() => mergeCardPasses([[line('', 0.1), line('   ', 0.2), line('—', 0.3)]])).not.toThrow();
  });

  it('a single pass is passed through, marked as such', () => {
    const merged = mergeCardPasses([[line('BILLA AG', 0.1)]]);
    expect(merged[0]).toMatchObject({ text: 'BILLA AG', seen: 1, passes: 1 });
  });
});

describe('was that a good look at the card', () => {
  const many = (n: number, seen: number, passes: number) =>
    Array.from({ length: n }, (_, i) => ({ ...line(`line ${i}`, i / n), seen, passes }));

  it('calls a card that barely read POOR, so the member can try again', () => {
    // Four confident fields from a photograph that half failed is what makes a
    // reader feel broken: the member cannot tell anything is missing.
    expect(cardReadQuality(many(2, 2, 2)).poor).toBe(true);
    expect(cardReadQuality([]).poor).toBe(true);
  });

  it('is happy with a full card the passes agreed on', () => {
    expect(cardReadQuality(many(6, 2, 2))).toMatchObject({ lines: 6, agreement: 1, poor: false });
  });

  it('flags a card the passes mostly disagreed about', () => {
    expect(cardReadQuality(many(6, 1, 2)).poor).toBe(true);
  });

  it('does not punish a single pass for agreeing with itself', () => {
    // With one pass, agreement is meaningless — applying the floor would mark
    // every single-pass scan poor.
    expect(cardReadQuality(many(6, 1, 1)).poor).toBe(false);
  });
});
