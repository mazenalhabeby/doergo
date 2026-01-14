import Link from 'next/link';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">Doergo</h1>
        <p className="text-xl text-primary font-semibold mb-2">Office Portal</p>
        <p className="text-muted-foreground mb-8">
          Manage tasks, assign workers, and track operations
        </p>
        <Link
          href="/login"
          className="px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition"
        >
          Login to Office
        </Link>
      </div>
    </main>
  );
}
