import fs from 'fs';
import path from 'path';

/**
 * Every modal in the personnel file uses the app's own Dialog.
 *
 * Both of these shipped as hand-rolled `fixed inset-0` overlays. They looked
 * close enough in a screenshot and were not: they missed the shared open
 * animation, the focus trap, Escape-to-close, the scroll lock, the labelled
 * close button, and the width `dialog.tsx` deliberately made identical for
 * every dialog in the product ("per-dialog width overrides were removed so
 * every dialog behaves identically").
 *
 * A modal that opens differently from every other modal is not a style
 * preference — it is the one somebody's muscle memory fails on. Scoped to the
 * documents surfaces because that is the feature this covers; a full-screen
 * overlay that is NOT a dialog remains perfectly legitimate elsewhere.
 */

const SURFACES = [
  'src/app/(dashboard)/documents',
  'src/app/(dashboard)/my/documents',
];

/** Every .tsx under the documents surfaces. */
function documentFiles(): { file: string; source: string }[] {
  const out: { file: string; source: string }[] = [];
  const walk = (dir: string) => {
    const full = path.join(process.cwd(), dir);
    if (!fs.existsSync(full)) return;
    for (const entry of fs.readdirSync(full, { withFileTypes: true })) {
      const rel = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(rel);
      else if (entry.name.endsWith('.tsx')) {
        out.push({ file: rel, source: fs.readFileSync(path.join(process.cwd(), rel), 'utf8') });
      }
    }
  };
  SURFACES.forEach(walk);
  return out;
}

describe('the personnel file uses one dialog', () => {
  const files = documentFiles();

  it('finds the screens it is supposed to be checking', () => {
    // Guards the guard: a moved directory would otherwise make this suite pass
    // by having nothing to assert.
    expect(files.length).toBeGreaterThan(3);
  });

  it.each(documentFiles().map((f) => f.file))('does not hand-roll an overlay in %s', (file) => {
    const source = files.find((f) => f.file === file)!.source;

    // The shape of a hand-rolled modal: a fixed full-screen layer with a
    // scrim. Comments are stripped first, so a file may still DESCRIBE the
    // mistake it used to make.
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');

    const overlay = /fixed inset-0[^"'`]*bg-black\//.test(code);
    expect({ file, handRolledOverlay: overlay }).toEqual({ file, handRolledOverlay: false });
  });

  it.each(['documents/review/page.tsx', 'my/documents/_components/supply-document-dialog.tsx'])(
    'builds %s on the shared Dialog',
    (suffix) => {
      const entry = files.find((f) => f.file.endsWith(suffix));
      expect(entry).toBeDefined();
      expect(entry!.source).toContain('from "@/components/ui/dialog"');
      // Not just imported — actually used as the shell.
      expect(entry!.source).toContain('<DialogContent');
    },
  );

  it('keeps an upload from being cancelled by a stray click', () => {
    /*
      The shared Dialog closes on overlay click and on Escape, which is right
      for a form and wrong for a transfer already in flight: the bytes are
      moving and the row is half-made. Both dialogs gate `onOpenChange` on the
      pending state rather than turning the behaviour off.
    */
    const supply = files.find((f) => f.file.endsWith('supply-document-dialog.tsx'))!;
    expect(supply.source).toContain('if (!next && !submit.isPending) onClose()');
  });
});
