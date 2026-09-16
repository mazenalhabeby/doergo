import { hostOf, socialOf, isSocialLink, readExtra, cardExtras } from '@hbcfield/shared/client';

describe('a social link is not the website', () => {
  it('names the network', () => {
    expect(socialOf('facebook.com/stadt.gmunden')?.key).toBe('facebook');
    expect(socialOf('https://www.linkedin.com/in/jasmin-walther')?.key).toBe('linkedin');
    expect(socialOf('xing.com/profile/Max_Muster')?.key).toBe('xing');
  });

  it('an ordinary domain is NOT social', () => {
    // The real failure: `gmunden.at` and `facebook.com/stadt.gmunden` printed two
    // characters apart. Only the second may leave the website field.
    expect(socialOf('gmunden.at')).toBeNull();
    expect(isSocialLink('gmunden.at')).toBe(false);
    expect(isSocialLink('facebook.com/stadt.gmunden')).toBe(true);
  });

  it('matches the HOST, never a substring', () => {
    // A company's own page ABOUT their Facebook presence is not a Facebook link.
    expect(socialOf('mycompany.com/facebook')).toBeNull();
    expect(socialOf('notfacebook.com/x')).toBeNull();
  });

  it('strips protocol, www, path and port', () => {
    expect(hostOf('https://www.Gmunden.at/kontakt')).toBe('gmunden.at');
    expect(hostOf('gmunden.at:8080/x')).toBe('gmunden.at');
    expect(hostOf('not a url')).toBeNull();
    expect(hostOf('plainword')).toBeNull();
  });
});

describe('what else is worth keeping', () => {
  it('an IBAN, a BIC, opening hours, a Skype handle', () => {
    expect(readExtra('AT61 1904 3002 3457 3201')?.labelKey).toBe('customers.extra.iban');
    expect(readExtra('Mo-Fr 08:00-16:00')?.labelKey).toBe('customers.extra.hours');
    expect(readExtra('Skype: live.jasmin')).toEqual({ labelKey: 'customers.extra.skype', value: 'live.jasmin' });
  });

  it("uses the CARD's own label when it supplied one we do not know", () => {
    expect(readExtra('Notruf: +43 664 000 111')).toEqual({ label: 'Notruf', value: '+43 664 000 111' });
  });

  it('refuses to turn a strapline into a field name', () => {
    // An unbounded "anything before a colon" would create a field called
    // "Unser Versprechen an Sie" out of marketing copy.
    expect(readExtra('Unser Versprechen an Sie ist immer die beste Qualitat: seit 1928')).toBeNull();
  });

  it('drops noise rather than cluttering a record', () => {
    expect(readExtra('—')).toBeNull();
    expect(readExtra('42')).toBeNull();
    expect(readExtra('')).toBeNull();
  });
});

describe('the leftovers of a real card', () => {
  it('keeps the Facebook page the reader used to discard', () => {
    const extras = cardExtras(['facebook.com/stadt.gmunden', 'Mo-Do 07:30-16:00']);
    expect(extras).toEqual([
      { labelKey: 'customers.social.facebook', value: 'facebook.com/stadt.gmunden' },
      { labelKey: 'customers.extra.hours', value: 'Mo-Do 07:30-16:00' },
    ]);
  });

  it('dedupes by value — a card often prints a handle twice', () => {
    const extras = cardExtras(['facebook.com/stadt.gmunden', 'facebook.com/stadt.gmunden']);
    expect(extras).toHaveLength(1);
  });

  it('never throws on whatever the OCR produced', () => {
    expect(() => cardExtras(['', '   ', '###', 'a'.repeat(5000)])).not.toThrow();
  });
});
