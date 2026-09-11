import { STARTER_TEMPLATES, renderTemplate, unknownTokens, tokensUsed } from '@hbcfield/shared';

/**
 * An invitation letter, filled from the member.
 *
 * This was a Word file somebody edited by hand for each person travelling: the
 * name in five places, a passport number retyped off a scan, a site address,
 * and a signer whose job title had changed since the last one. Every one of
 * those is a place to get it wrong on a document presented at a border.
 *
 * The letter is a template now. These assert the two things that make it worth
 * having: every token it uses is one the system can fill, and nothing in it has
 * to be typed twice.
 */
describe('the invitation letter template', () => {
  const letter = STARTER_TEMPLATES.find((s) => s.key === 'invitation_letter')!;

  it('exists, and asks for no signature', () => {
    /*
      It is addressed to a border officer, not to the member. There is no second
      party to agree to anything, and a signature block would invite whoever
      reads it to wonder what was agreed.
    */
    expect(letter).toBeTruthy();
    expect(letter.signatureMode).toBe('NONE');
  });

  it('uses only tokens this system can fill', () => {
    // The failure this prevents is a letter going out with
    // `{{member.passportNumber}}` printed where a number belongs.
    expect(unknownTokens(letter.body)).toEqual([]);
  });

  it('takes the passport number from the member, never from a form', () => {
    // Retyping it is how a letter reaches a border with a digit wrong.
    expect(tokensUsed(letter.body)).toContain('member.passportNumber');
  });

  it('names the signer by token, so a changed role does not outlive the letter', () => {
    expect(tokensUsed(letter.body)).toContain('issuer.fullName');
    expect(tokensUsed(letter.body)).toContain('issuer.jobTitle');
  });

  it('renders the real letter from one member\'s details', () => {
    const { text, missing } = renderTemplate(letter.body, {
      'org.legalName': 'HBC USA Inc.',
      'org.address': 'TRUE Space Dallas Uptown, 4245 N Central Expy #490, Dallas, TX 75205',
      'org.email': 'office@hbc-group.us',
      'org.phone': '+1 (469) 503-0355',
      'member.fullName': 'Christian Matias Iza Ñacato',
      'member.passportNumber': 'B0334448',
      'member.specialty': 'industrial installations',
      'contract.startDate': '11.09.2026',
      'contract.endDate': '11.12.2026',
      'contract.siteName': 'Binderholz Enfield LLC',
      'contract.siteAddress': '260 Piper Lane, Enfield, NC 27823',
      'contract.rotation': 'three (3) months on assignment followed by two (2) weeks at home',
      'contract.issuedOn': '11.09.2026',
      'issuer.fullName': 'Andreas Holub',
      'issuer.jobTitle': 'CFO',
    });

    expect(missing).toEqual([]);
    expect(text).toContain('Christian Matias Iza Ñacato');
    expect(text).toContain('B0334448');
    expect(text).toContain('Binderholz Enfield LLC, 260 Piper Lane, Enfield, NC 27823');
    expect(text).toContain('Andreas Holub');
    // Not one brace left anywhere.
    expect(text).not.toMatch(/\{\{/);
  });

  it('refuses to render rather than printing a gap where the passport goes', () => {
    /*
      ⚠️ The whole point of naming what is missing. A letter that renders with a
      blank in it looks finished, is handed over, and fails at a desk in another
      country — where nobody can do anything about it.
    */
    const { missing } = renderTemplate(letter.body, {
      'member.fullName': 'Christian Matias Iza Ñacato',
      'org.legalName': 'HBC USA Inc.',
    });
    expect(missing).toContain('member.passportNumber');
    expect(missing).toContain('contract.siteName');
  });
});
