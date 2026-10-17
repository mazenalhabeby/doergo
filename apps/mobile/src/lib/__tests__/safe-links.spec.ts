/**
 * Links built from data open exactly one scheme, or nothing.
 */
(globalThis as { __DEV__?: boolean }).__DEV__ = false;
import { geoUrl, httpsUrl, mailtoUrl, telUrl, webUrl } from '../safe-links';

describe('file links from the server', () => {
  it('https only in a release build', () => {
    expect(httpsUrl('https://s3.example.com/a.pdf?X-Amz=1')).toBe('https://s3.example.com/a.pdf?X-Amz=1');
    expect(httpsUrl('http://s3.example.com/a.pdf')).toBeNull();
    for (const bad of ['javascript:alert(1)', 'intent://scan#Intent;end', 'file:///etc/passwd', 'tel:123', 'data:text/html,x', '//evil.com', '', null, undefined, 'https://a b.com']) {
      expect(httpsUrl(bad as string)).toBeNull();
    }
  });

  it('plain http only when development asks for it', () => {
    expect(httpsUrl('http://localhost:4000/uploads/a.png', true)).toBe('http://localhost:4000/uploads/a.png');
  });
});

describe('phone numbers', () => {
  it('digits and a leading + — nothing else reaches tel:', () => {
    expect(telUrl('+43 664 123 45 67')).toBe('tel:+436641234567');
    expect(telUrl('0664/123-4567')).toBe('tel:06641234567');
    expect(telUrl('123;https://evil.com')).toBe('tel:123');
    expect(telUrl('call me')).toBeNull();
    expect(telUrl('12')).toBeNull();
    expect(telUrl(null)).toBeNull();
  });
});

describe('e-mail addresses', () => {
  it('an address and nothing else — no subject, body or extra recipients', () => {
    expect(mailtoUrl(' anna@hbc-group.eu ')).toBe('mailto:anna@hbc-group.eu');
    expect(mailtoUrl('a@b.co?body=hi')).toBeNull();
    expect(mailtoUrl('a@b.co&cc=x@y.z')).toBeNull();
    expect(mailtoUrl('a@b.co\nBcc: x@y.z')).toBeNull();
    expect(mailtoUrl('a b@c.de')).toBeNull();
    expect(mailtoUrl('not-an-email')).toBeNull();
  });
});

describe('addresses on a map', () => {
  it('the text is an encoded query, never part of the URL', () => {
    expect(geoUrl('Arbeiterheimstraße 32, Laakirchen')).toBe(`geo:0,0?q=${encodeURIComponent('Arbeiterheimstraße 32, Laakirchen')}`);
    expect(geoUrl('x&q=evil#frag')).toBe(`geo:0,0?q=${encodeURIComponent('x&q=evil#frag')}`);
    expect(geoUrl('  ')).toBeNull();
    expect(geoUrl('a\u0000b')).toBe('geo:0,0?q=a%20b');
  });
});

describe('typed websites', () => {
  it('http(s) only; https assumed when no scheme was typed', () => {
    expect(webUrl('hbc-group.eu')).toBe('https://hbc-group.eu');
    expect(webUrl('http://old.example.com')).toBe('http://old.example.com');
    expect(webUrl('javascript:alert(1)')).toBeNull();
    expect(webUrl('ftp://x.y')).toBeNull();
  });
});

describe('no screen opens a data-built link by hand', () => {
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');
  const ROOT = path.resolve(__dirname, '../../..');
  const FILES = [
    'src/components/job/job-files.tsx',
    'src/components/job/job-submissions.tsx',
    'app/(customer)/request/[id].tsx',
    'app/(app)/sign-document.tsx',
    // The screen's link handling moved into its hook when the screen was split.
    'src/components/documents/use-documents-screen.tsx',
    'src/components/customer/record/record-hero.tsx',
    'src/components/customer/record/record-about.tsx',
    'src/components/customer/contact-row.tsx',
    'src/components/customer/address-row.tsx',
    'src/components/clients/client-row.tsx',
    'src/components/home/use-clients-due.ts',
    'src/components/calendar/event-sheet.tsx',
  ];
  it.each(FILES)('%s goes through safe-links', (rel) => {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    expect(src).not.toMatch(/Linking\.openURL\(/);
    expect(src).toMatch(/from '[./]+(?:\/src)?\/lib\/safe-links'/);
  });
});
