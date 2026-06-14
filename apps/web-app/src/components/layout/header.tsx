'use client';

import { Bell, Search } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';

interface HeaderProps {
  title?: string;
}

export function Header({ title }: HeaderProps) {
  const { user } = useAuth();

  return (
    <header className="h-header bg-card border-b border-border flex items-center justify-between px-6">
      {/* Title */}
      <h1 className="text-xl font-semibold text-foreground">{title || 'Dashboard'}</h1>

      {/* Right section */}
      <div className="flex items-center gap-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search tasks..."
            className="h-9 w-64 pl-10 pr-4 text-sm border border-border rounded-lg bg-muted placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
          />
        </div>

        {/* Notifications */}
        <button className="relative p-2 text-muted-foreground hover:text-muted-foreground hover:bg-accent rounded-lg transition-colors">
          <Bell className="h-5 w-5" />
          <span className="absolute top-1 right-1 h-2 w-2 bg-red-500 rounded-full" />
        </button>

        {/* User Avatar */}
        <div className="h-9 w-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-medium text-sm overflow-hidden">
          {user?.avatarUrl ? (
            <img src={user.avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
          ) : (
            <>
              {user?.firstName?.[0]}
              {user?.lastName?.[0]}
            </>
          )}
        </div>
      </div>
    </header>
  );
}
