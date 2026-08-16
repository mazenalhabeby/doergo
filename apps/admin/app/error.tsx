'use client';

/**
 * App-level error boundary. Its main job: recover gracefully from the classic
 * "stale chunk" crash — after a redeploy the build id changes, so a tab that was
 * open across the deploy requests JS chunks that no longer exist and React throws
 * "Application error: a client-side exception has occurred while loading…".
 *
 * On a chunk-load error we reload ONCE (guarded so we never loop). Any other
 * error shows a small recovery card with a manual reload — never an auto-loop.
 */
import { useEffect } from 'react';

function isChunkError(err: Error): boolean {
  const s = `${err?.name ?? ''} ${err?.message ?? ''}`;
  return /ChunkLoadError|Loading chunk|Loading CSS chunk|dynamically imported module|import\(\)/i.test(s);
}

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!isChunkError(error)) return;
    // Reload once per 15s window — a fresh build id makes the retry succeed.
    const KEY = 'admin_chunk_reload_at';
    const last = Number(sessionStorage.getItem(KEY) || 0);
    if (Date.now() - last > 15000) {
      sessionStorage.setItem(KEY, String(Date.now()));
      window.location.reload();
    }
  }, [error]);

  const chunk = isChunkError(error);
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-slate-100">
      <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-6 text-center">
        <h1 className="mb-1 text-lg font-semibold">{chunk ? 'Updating…' : 'Something went wrong'}</h1>
        <p className="mb-4 text-sm text-slate-400">
          {chunk ? 'A new version was just deployed — reloading to pick it up.' : 'A client-side error occurred. Reload to continue.'}
        </p>
        <button onClick={() => window.location.reload()} className="w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium hover:bg-blue-500">Reload</button>
        <button onClick={() => reset()} className="mt-2 w-full rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-400 hover:bg-slate-800">Try again without reloading</button>
      </div>
    </div>
  );
}
