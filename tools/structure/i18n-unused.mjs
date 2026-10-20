/**
 * Translation keys nobody reads (docs/plans/code-structure-fix.md, Phase 0.5).
 *
 * A key counts as USED when any source file of that app (or packages/shared, which holds the
 * words both apps print) contains, as a string literal:
 *   - the key itself                         'tasks.status.open'
 *   - a parent of it, two segments or more   'home.process.steps'  (returnObjects, label tables)
 *   - a prefix ending in a dot               'documents.kinds.' + kind
 *   - a template that matches it             `addOns.${a.key}.label`
 * Plural forms (`_one`, `_other` …) count as their base key. Anything else is unused.
 *
 * This leans towards "used": a key it calls unused really has no literal anywhere, which is
 * what makes the baseline safe to shrink by deleting those keys.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO, sourceFiles } from './files.mjs';

export const I18N_APPS = {
  web: { locale: 'apps/web-app/src/i18n/locales/en.json', roots: ['apps/web-app/src/', 'packages/shared/src/'] },
  mobile: {
    locale: 'apps/mobile/src/i18n/locales/en.json',
    roots: ['apps/mobile/src/', 'apps/mobile/app/', 'packages/shared/src/'],
  },
};

const PLURAL = /_(zero|one|two|few|many|other)$/;

function flatten(obj, prefix = '', out = []) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
    else out.push(key);
  }
  return out;
}

const LITERAL = /'([^'\\\n]*(?:\\.[^'\\\n]*)*)'|"([^"\\\n]*(?:\\.[^"\\\n]*)*)"|`([^`\\]*(?:\\.[^`\\]*)*)`/g;

function literalsOf(roots) {
  const exact = new Set();
  const prefixes = [];
  const templates = [];
  for (const f of sourceFiles()) {
    if (!roots.some((r) => f.startsWith(r))) continue;
    const text = readFileSync(join(REPO, f), 'utf8');
    for (const m of text.matchAll(LITERAL)) {
      const s = m[1] ?? m[2] ?? m[3] ?? '';
      if (!/^[A-Za-z][\w-]*(\.|$)/.test(s) || s.length > 200) continue;
      if (m[3] !== undefined && s.includes('${')) {
        const re = s
          .split(/\$\{[^}]*\}/)
          .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
          .join('[\\w.-]+');
        if (/^[A-Za-z]/.test(s)) templates.push(new RegExp('^' + re + (s.endsWith('.') ? '' : '$')));
        continue;
      }
      if (s.endsWith('.')) prefixes.push(s);
      else exact.add(s.replace(/^[\w-]+:/, ''));
    }
  }
  return { exact, prefixes, templates };
}

/** app → sorted unused keys. */
export function unusedKeys() {
  const out = {};
  for (const [app, cfg] of Object.entries(I18N_APPS)) {
    const keys = flatten(JSON.parse(readFileSync(join(REPO, cfg.locale), 'utf8')));
    const { exact, prefixes, templates } = literalsOf(cfg.roots);
    const used = (key) => {
      const base = key.replace(PLURAL, '');
      const parts = base.split('.');
      for (let n = parts.length; n >= Math.min(2, parts.length); n--)
        if (exact.has(parts.slice(0, n).join('.'))) return true;
      if (prefixes.some((p) => base.startsWith(p))) return true;
      return templates.some((re) => re.test(base));
    };
    out[app] = keys.filter((k) => !used(k)).sort();
  }
  return out;
}
