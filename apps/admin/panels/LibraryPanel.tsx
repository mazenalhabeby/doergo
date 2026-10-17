'use client';

import { useCallback, useEffect, useState } from 'react';
import { libraryApi } from '@/lib/api/endpoints';
import type { Tpl } from '@/lib/api/types';
import { useAction } from '@/lib/hooks';

// ============================================================================
// Task-type library — the templates every tenant copies from.
//
// One table, and this is its only write surface. A tenant reads published rows
// and takes a COPY; nothing they hold points back here, so editing a template
// never reaches a task that is already moving.
// ============================================================================

const blank = (position: number): Tpl => ({
  id: '',
  slug: '',
  name: '',
  description: '',
  industry: '',
  icon: '',
  position,
  isPublished: false,
  isBuiltIn: false,
  submittedByOrgId: null,
  submittedByOrgName: null,
  submittedAt: null,
  statuses: [],
  problems: [],
  advice: []
});

export function LibraryPanel({ onError }: { onError: (s: string) => void }) {
  const [rows, setRows] = useState<Tpl[]>([]);
  const [editing, setEditing] = useState<Tpl | null>(null);
  const [draft, setDraft] = useState('');
  const [importId, setImportId] = useState('');
  const { busy, run } = useAction(onError);

  const load = useCallback(async () => setRows(await libraryApi.list()), []);
  useEffect(() => { void run('load', load); }, [run, load]);

  const open = (t: Tpl | null) => { setEditing(t ?? blank(rows.length)); setDraft(JSON.stringify(t?.statuses ?? [], null, 2)); };

  const save = () => {
    if (!editing) return;
    let statuses: unknown;
    // Parsed here so a typo is a message rather than a request that fails halfway.
    try { statuses = JSON.parse(draft || '[]'); } catch { onError('The steps are not valid JSON.'); return; }
    const body = {
      slug: editing.slug,
      name: editing.name,
      description: editing.description,
      industry: editing.industry,
      icon: editing.icon,
      position: editing.position,
      isPublished: editing.isPublished,
      statuses
    };
    void run('save', async () => { await libraryApi.save(editing.id || null, body); setEditing(null); }, load);
  };

  const inp = 'w-full rounded bg-slate-800 px-2 py-1.5 outline-none';
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Task-type library</h2>
          <p
            className="text-xs text-slate-500">Published templates are offered to every organization. Adding one gives them a copy to edit — it is never linked back here. Submissions from customers arrive unpublished and sort to the top.</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            aria-label="Workflow id to import"
            value={importId}
            onChange={(e) => setImportId(e.target.value)}
            placeholder="Import from workflow id…"
            className="w-56 rounded bg-slate-800 px-2 py-1.5 text-xs outline-none"
          />
          <button
            disabled={!importId || busy === 'import'}
            onClick={() => run('import', async () => { await libraryApi.importFromOrg(importId.trim()); setImportId(''); }, load)}
            className={"rounded bg-slate-800 px-3 py-1.5 text-xs hover:bg-slate-700 " + "disabled:opacity-40"}>Import from an org</button>
          <button onClick={() => open(null)} className="rounded bg-blue-600 px-3 py-1.5 text-xs hover:bg-blue-500">New template</button>
        </div>
      </div>
      <div className="overflow-hidden rounded-lg border border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-900/60 text-[11px] uppercase tracking-wide text-slate-500">
            <tr><th
              className="px-3 py-2 text-left">Name</th><th
                className="px-3 py-2 text-left">Slug</th><th
                  className="px-3 py-2 text-left">Steps</th><th className="px-3 py-2 text-left">State</th><th className="px-3 py-2" /></tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {rows.map((t) => (
              <tr key={t.id} className="hover:bg-slate-900/40">
                <td className="px-3 py-2">
                  <div className="font-medium">
                    {t.name}
                    {t.isBuiltIn && <span className="ml-2 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">built-in</span>}
                    {/* Who sent it — never shown to tenants: a flow's step names are a business's process. */}
                    {t.submittedByOrgId &&
                      <span
                        className="ml-2 rounded bg-blue-500/15 px-1.5 py-0.5 text-[10px] text-blue-400">from {t.submittedByOrgName ||
                          t.submittedByOrgId}</span>}
                  </div>
                  {t.description && <div className="text-xs text-slate-500">{t.description}</div>}
                </td>
                <td className="px-3 py-2 text-xs text-slate-400">{t.slug}</td>
                <td className="px-3 py-2 text-xs text-slate-400">{t.statuses.map((s) => s.name).join(' → ') || '—'}</td>
                <td className="px-3 py-2 text-xs">
                  {t.isPublished
                    ? <span className="rounded bg-green-500/15 px-1.5 py-0.5 text-green-400">published</span>
                    : <span className="rounded bg-slate-500/15 px-1.5 py-0.5 text-slate-400">draft</span>}
                  {t.problems.length > 0 &&
                    <div className="mt-1 text-[11px] text-red-400">{t.problems.map((p) => p.message).join(' ')}</div>}
                  {t.problems.length === 0 &&
                    t.advice?.length > 0 &&
                    <div className="mt-1 text-[11px] text-amber-400">{t.advice.map((a) => a.message).join(' ')}</div>}
                </td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-1.5">
                    <button onClick={() => open(t)} className="rounded bg-slate-800 px-2 py-1 text-[11px] hover:bg-slate-700">Edit</button>
                    <button
                      disabled={busy === t.id || (!t.isPublished && t.problems.length > 0)}
                      title={!t.isPublished && t.problems.length > 0 ? 'Fix the problems above before publishing' : undefined}
                      onClick={() => run(
                        t.id,
                        () => libraryApi.publish(t.id, !t.isPublished),
                        load)} className={"rounded bg-slate-800 px-2 py-1 text-[11px] hover:bg-slate-700 " +
                          "disabled:opacity-40"}>{t.isPublished ? 'Unpublish' : 'Publish'}</button>
                    {/* A built-in comes back on the next boot, so it is unpublished instead. */}
                    <button disabled={busy === t.id} title={t.isBuiltIn ? 'Built-in: this unpublishes it' : undefined}
                      onClick={() => run(
                        t.id,
                        () => libraryApi.remove(t.id),
                        load)} className={"rounded bg-red-600/80 px-2 py-1 text-[11px] hover:bg-red-600 " +
                          "disabled:opacity-40"}>{t.isBuiltIn ? 'Retire' : 'Delete'}</button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} className="px-3 py-8 text-center text-slate-500">The library is empty.</td></tr>}
          </tbody>
        </table>
      </div>
      {editing && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={() => setEditing(null)}>
          <div
            className={"h-full w-full max-w-2xl overflow-y-auto border-l border-slate-800 " + "bg-slate-900 p-5"}
            onClick={(e) => e.stopPropagation()}>
            <div
              className="mb-4 flex items-start justify-between"><h2
                className="text-lg font-semibold">{editing.id
                  ? 'Edit template'
                  : 'New template'}</h2><button
                    onClick={() => setEditing(null)}
                    aria-label="Close"
                    className="text-slate-400">✕</button></div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <label
                className="col-span-2 block"><span
                  className="mb-1 block text-xs text-slate-500">Name</span><input
                    value={editing.name}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    className={inp}
                  /></label>
              <label
                className="block"><span
                  className="mb-1 block text-xs text-slate-500">Slug {editing.id &&
                    '(fixed)'}</span><input
                      value={editing.slug}
                      disabled={!!editing.id}
                      onChange={(e) => setEditing({ ...editing, slug: e.target.value })}
                      className={`${inp} disabled:opacity-50`}
                      placeholder="derived from the name"
                    /></label>
              <label
                className="block"><span
                  className="mb-1 block text-xs text-slate-500">Industry</span><input
                    value={editing.industry ?? ''}
                    onChange={(e) => setEditing({ ...editing, industry: e.target.value })}
                    className={inp}
                    placeholder="field-service"
                  /></label>
              <label
                className="col-span-2 block"><span
                  className="mb-1 block text-xs text-slate-500">Description</span><input
                    value={editing.description ?? ''}
                    onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                    className={inp}
                  /></label>
              <label
                className="col-span-2 block"><span
                  className="mb-1 block text-xs text-slate-500">Steps (JSON: name, key, color, position, isFinal, isCanceled, transitions[], capabilities[])</span><textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    rows={18}
                    spellCheck={false}
                    className={`${inp} font-mono text-xs`}
                  /></label>
              <label
                className="col-span-2 flex items-center gap-2 text-xs text-slate-400"><input
                  type="checkbox"
                  checked={editing.isPublished}
                  onChange={(e) => setEditing({ ...editing, isPublished: e.target.checked })}
                />Published — offered to every organization. Refused while the flow has problems.</label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setEditing(null)} className="rounded bg-slate-800 px-3 py-1.5 text-xs">Cancel</button>
              <button
                disabled={busy === 'save' || !editing.name.trim()}
                onClick={save}
                className={"rounded bg-blue-600 px-3 py-1.5 text-xs hover:bg-blue-500 " + "disabled:opacity-40"}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
