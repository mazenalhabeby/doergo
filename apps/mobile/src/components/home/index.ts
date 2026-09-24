/**
 * The home screen's own pieces.
 *
 * ⚠️ WIDGETS ARE NOT EXPORTED FROM HERE AND NEVER WERE THE POINT. This barrel
 * used to export four whole home screens and the entire icon family beside
 * them, so anything that wanted one drawing loaded all of it — and
 * `documents-reminder-card` did exactly that, pulling `admin-dashboard` into
 * the bundle and producing a require cycle with it. The four screens are gone
 * (one composed column replaced them — `src/home/`) and the marks live in
 * `components/glyphs/`.
 *
 * A widget reaches the screen through the REGISTRY (`src/home/registry.tsx`),
 * which is the one place the set is readable. Nothing imports a widget by
 * name, so nothing belongs here for them.
 */
export { EmptyHome, WidgetSurface, type Suggestion } from './empty-home';
export { EditableWidget, DropSlot, LANDED_MS, LIFT_FACTOR } from './editable-widget';
export { WidgetGallery } from './widget-gallery';
