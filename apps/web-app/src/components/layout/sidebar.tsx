'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  ClipboardList,
  Plus,
  FileText,
  Settings,
  HelpCircle,
  LogOut,
  FlaskConical,
  CreditCard,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/auth-context';
import { useTranslation } from 'react-i18next';

const navigation = [
  { nameKey: 'nav.sidebar.dashboard', href: '/dashboard', icon: LayoutDashboard },
  { nameKey: 'nav.myTasks', href: '/tasks', icon: ClipboardList },
  { nameKey: 'nav.sidebar.createTask', href: '/tasks/new', icon: Plus },
  { nameKey: 'nav.sidebar.invoices', href: '/invoices', icon: FileText },
  { nameKey: 'nav.tokenTest', href: '/test', icon: FlaskConical },
];

const bottomNavigation = [
  { nameKey: 'nav.sidebar.billing', href: '/settings/billing', icon: CreditCard },
  { nameKey: 'nav.sidebar.settings', href: '/settings', icon: Settings },
  { nameKey: 'nav.help', href: '/help', icon: HelpCircle },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { t } = useTranslation();

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-sidebar bg-card border-r border-border flex flex-col">
      {/* Logo */}
      <div className="h-header flex items-center px-6 border-b border-border">
        <Link href="/dashboard" className="flex items-center gap-2">
          <span className="text-2xl font-bold text-foreground">
            Doer<span className="text-accent">go</span>
          </span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        <ul className="space-y-1">
          {navigation.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    'sidebar-item',
                    isActive && 'sidebar-item-active'
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  <span>{t(item.nameKey)}</span>
                </Link>
              </li>
            );
          })}
        </ul>

        {/* Bottom Navigation */}
        <div className="mt-auto pt-4 border-t border-border">
          <ul className="space-y-1">
            {bottomNavigation.map((item) => {
              const isActive = pathname === item.href;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      'sidebar-item',
                      isActive && 'sidebar-item-active'
                    )}
                  >
                    <item.icon className="h-5 w-5" />
                    <span>{t(item.nameKey)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </nav>

      {/* User Section */}
      <div className="border-t border-border p-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-medium">
            {user?.firstName?.[0]}
            {user?.lastName?.[0]}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">
              {user?.firstName} {user?.lastName}
            </p>
            <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
          </div>
          <button
            onClick={logout}
            className="p-2 text-muted-foreground hover:text-muted-foreground hover:bg-accent rounded-lg transition-colors"
            title={t('nav.userMenu.signOut')}
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </div>
    </aside>
  );
}
