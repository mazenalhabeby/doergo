/**
 * The icon family — 77 marks, one construction law.
 *
 * ⚠️ THEY LIVED IN `components/home/` AND DID NOT BELONG THERE. Only two of
 * the nine files are about the home screen: the tiles are the shortcuts rail,
 * the tab marks are the footer, the CRM marks are the clients screen, and
 * `glyphs.tsx` is used across the app. A folder named after one screen holding
 * the whole app's iconography is how a family ends up copied rather than
 * imported.
 *
 * The law, and the one exception, are in `docs/design/icons/README.md`. Read it
 * before adding a mark: it is the only reason 77 drawings read as one set.
 */
export * from './glyphs';
export * from './shift-glyphs';
export * from './work-glyphs';
export * from './route-glyphs';
export * from './crew-glyphs';
export * from './queue-glyphs';
export * from './tile-glyphs';
export * from './doc-glyphs';
export * from './crm-glyphs';
export * from './tab-glyphs';
