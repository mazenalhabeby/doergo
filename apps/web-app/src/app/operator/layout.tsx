import type { Metadata } from 'next';

// Internal operator console — never index or follow.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: 'Operator',
};

export default function OperatorLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
