/**
 * The home screen's widgets.
 *
 * ⚠️ WIDGETS ONLY. This barrel used to export four whole home screens and the
 * entire icon family beside them, so anything that wanted one drawing loaded
 * all of it — and `documents-reminder-card` did exactly that, pulling
 * `admin-dashboard` into the bundle and producing a require cycle with it.
 *
 * The four screens are gone (one composed column replaced them — `src/home/`)
 * and the marks live in `components/glyphs/`. A barrel is only safe when
 * everything behind it is the same kind of thing.
 */
export { ShiftClockCard } from './shift-clock-card';
export { ShortcutsRail } from './shortcuts-rail';
export { MyWorkCard } from './my-work-card';
