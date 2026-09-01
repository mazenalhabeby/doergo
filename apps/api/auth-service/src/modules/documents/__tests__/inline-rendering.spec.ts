import { contentDisposition } from '@hbcfield/shared/storage';

/**
 * Whether a browser renders a document or saves it.
 *
 * `attachment` saves; `inline` renders. That is the difference between looking
 * at a payslip in one click and a three-step errand that leaves a confidential
 * copy in everybody's Downloads folder.
 *
 * It is also a security boundary. Inline means the browser executes whatever
 * the type implies, so it is safe only for inert types — PDF, PNG, JPEG. HTML
 * and SVG are not inert, and neither is accepted by this product; if either
 * ever is, this decision has to be revisited. These tests pin the DEFAULT to
 * the safe one, so a caller that never thought about it gets `attachment`.
 */
describe('contentDisposition', () => {
  it('defaults to attachment — not choosing must be the safe choice', () => {
    expect(contentDisposition('payslip.pdf')).toMatch(/^attachment;/);
  });

  it('renders inline only when asked explicitly', () => {
    expect(contentDisposition('payslip.pdf', 'inline')).toMatch(/^inline;/);
  });

  it('keeps the filename in both modes', () => {
    for (const mode of ['attachment', 'inline'] as const) {
      expect(contentDisposition('payslip.pdf', mode)).toContain('filename="payslip.pdf"');
    }
  });

  it('carries a non-ASCII name through the encoded form', () => {
    const header = contentDisposition('Gehaltsabrechnung März.pdf', 'inline');
    expect(header).toContain('filename="Gehaltsabrechnung M_rz.pdf"');
    expect(header).toContain("filename*=UTF-8''Gehaltsabrechnung%20M%C3%A4rz.pdf");
  });

  it('neutralises quotes and backslashes, which would break out of the header', () => {
    expect(contentDisposition('we"ird\\name.pdf')).toContain('filename="we_ird_name.pdf"');
  });
});
