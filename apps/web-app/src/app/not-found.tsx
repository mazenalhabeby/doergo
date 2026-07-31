import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: true },
};

// Branded root 404 — keeps crawlers moving with real internal links instead of a
// dead end, and returns a correct 404 status.
export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center text-foreground">
      <p className="font-[family:var(--font-martian)] text-xs uppercase tracking-[0.3em] text-muted-foreground">
        404
      </p>
      <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">Page not found</h1>
      <p className="mt-3 max-w-md text-muted-foreground">
        The page you’re looking for doesn’t exist or has moved.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/"
          className="rounded-full bg-foreground px-5 py-2.5 text-sm font-semibold text-background transition-opacity hover:opacity-90"
        >
          Back to home
        </Link>
        <Link
          href="/help"
          className="rounded-full border border-border px-5 py-2.5 text-sm font-semibold transition-colors hover:bg-accent/40"
        >
          Help center
        </Link>
      </div>
    </main>
  );
}
