'use client';

import { Bell, Search } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';

interface HeaderProps {
  title?: string;
}

export function Header({ title }: HeaderProps) {
  const { user } = useAuth();

  return (
    <header className="h-header bg-white border-b border-slate-200 flex items-center justify-between px-6">
      {/* Title */}
      <h1 className="text-xl font-semibold text-slate-800">{title || 'Dashboard'}</h1>

      {/* Right section */}
      <div className="flex items-center gap-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search tasks..."
            className="h-9 w-64 pl-10 pr-4 text-sm border border-slate-200 rounded-lg bg-slate-50 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
          />
        </div>

        {/* Notifications */}
        <button className="relative p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
          <Bell className="h-5 w-5" />
          <span className="absolute top-1 right-1 h-2 w-2 bg-red-500 rounded-full" />
        </button>

        {/* User Avatar */}
        <div className="h-9 w-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-medium text-sm">
          {user?.firstName?.[0]}
          {user?.lastName?.[0]}
        </div>
      </div>
    </header>
  );
}
