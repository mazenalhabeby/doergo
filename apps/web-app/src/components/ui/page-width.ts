/**
 * How wide a page is, and where its content starts.
 *
 * ⚠️ THIS NUMBER WAS TYPED INTO EIGHTEEN PLACES. The navbar centres itself in
 * 1440px with 24px of gutter; every page is supposed to sit in the same column,
 * and each one said so by repeating the literal. A page that forgot — the New
 * Invoice screen did — runs its own bar and its own rail to the edge of the
 * monitor while the navigation above stops two hundred pixels short, and on a
 * wide display the two read as parts of different applications.
 *
 * It is also the kind of drift nothing catches: the page is correct at 1440px,
 * which is where it is built and reviewed.
 *
 * So the column is stated once. Compose it with `cn()` — it carries the width
 * and the gutter and nothing else, so vertical padding, flex and grid stay the
 * caller's business.
 *
 * ⚠️ A FULL-BLEED BAND WRAPS THE CONTAINER, never the other way round. A sticky
 * bar's border, background and blur must reach both edges of the window — a
 * divider that stops in mid-air looks broken — while its CONTENTS line up with
 * the navigation. That is two elements: the band, and this inside it.
 */
export const PAGE_WIDTH = "mx-auto w-full max-w-[1440px] px-6"

/** The column plus the padding almost every page body uses. */
export const PAGE_SHELL = `${PAGE_WIDTH} py-6`
