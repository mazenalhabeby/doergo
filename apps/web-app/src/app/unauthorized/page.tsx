'use client';

import { useAuth } from '@/contexts/auth-context';
import { Button } from '@/components/ui';

export default function UnauthorizedPage() {
  const { logout, user } = useAuth();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-slate-50 to-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-modal p-8 text-center">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg
            className="w-8 h-8 text-red-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-slate-800 mb-2">Access Denied</h1>
        <p className="text-slate-600 mb-6">
          You don&apos;t have permission to access this portal.
          {user?.role === 'TECHNICIAN' && (
            <> Technicians should use the mobile app.</>
          )}
        </p>
        <div className="space-y-3">
          <Button
            onClick={logout}
            className="w-full"
          >
            Sign out and try another account
          </Button>
        </div>
      </div>
    </div>
  );
}
