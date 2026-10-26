/**
 * The one icon library (web + phone). Its markup is inserted as raw SVG on both (innerHTML on the web, SvgXml on
 * the phone), so what it may contain is pinned here: drawing elements and drawing attributes only.
 */
import { ICON_SOURCES, SOLAR_ICONS, iconMarkup } from '../index';

const ELEMENTS = new Set(['g', 'path', 'circle', 'rect', 'ellipse', 'line', 'polyline', 'polygon']);
const ATTRS = new Set([
  'd',
  'fill',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'opacity',
  'fill-rule',
  'clip-rule',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'x',
  'y',
  'width',
  'height',
  'transform',
  'points',
  'x1',
  'y1',
  'x2',
  'y2',
  'stroke-opacity',
  'fill-opacity',
  'stroke-miterlimit',
  'stroke-dasharray',
  'color',
]);

describe('the icon library', () => {
  const entries = Object.entries(SOLAR_ICONS);

  it('has no name in both sources (a spread would override it silently)', () => {
    const base = Object.keys(ICON_SOURCES.base);
    expect(Object.keys(ICON_SOURCES.shell).filter((k) => base.includes(k))).toEqual([]);
    expect(entries.length).toBe(base.length + Object.keys(ICON_SOURCES.shell).length);
  });

  it.each(entries)('%s holds drawing markup only — no script, handler, link or style', (_name, markup) => {
    expect(markup).not.toMatch(/<script|<style|<foreignObject|<image|<use\b|href|javascript:|url\(/i);
    for (const [, el] of markup.matchAll(/<([a-zA-Z]+)/g)) expect(ELEMENTS.has(el)).toBe(true);
    for (const [, attr] of markup.matchAll(/\s([a-zA-Z:-]+)=/g)) expect(ATTRS.has(attr)).toBe(true);
  });

  it.each(entries)('%s paints in currentColor, so it takes the colour around it', (_name, markup) => {
    expect(markup).toContain('currentColor');
    expect(markup).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(/i);
  });

  it('a paint server replaces currentColor everywhere, nothing else', () => {
    const painted = iconMarkup('home', 'url(#ink)');
    expect(painted).not.toContain('currentColor');
    expect(painted.split('url(#ink)').length - 1).toBe(SOLAR_ICONS.home.split('currentColor').length - 1);
  });
});
