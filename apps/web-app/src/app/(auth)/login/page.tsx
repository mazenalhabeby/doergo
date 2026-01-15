'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import {
  AuthSkeleton,
  LoginForm,
  RegisterForm,
  MobileHeader,
  MobileTabSwitcher,
  OverlayPanel,
} from '@/components/auth';
import { useAuth } from '@/contexts/auth-context';
import { cn } from '@/lib/utils';

function AuthPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  const [isLoginActive, setIsLoginActive] = useState(true);
  const [mounted, setMounted] = useState(false);

  // Check for registered query param
  useEffect(() => {
    if (searchParams.get('registered') === 'true') {
      toast.success('Account created successfully!', {
        description: 'Please sign in with your new credentials.',
      });
      setIsLoginActive(true);
      router.replace('/login', { scroll: false });
    }
  }, [searchParams, router]);

  // Redirect if already authenticated
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      router.push('/dashboard');
    }
  }, [authLoading, isAuthenticated, router]);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Show skeleton while checking auth
  if (authLoading) {
    return <AuthSkeleton />;
  }

  return (
    <div
      className={cn(
        'w-full max-w-[900px] mx-auto transition-all duration-700',
        mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
      )}
    >
      {/* Mobile Layout */}
      <MobileLayout isLoginActive={isLoginActive} onTabChange={setIsLoginActive} />

      {/* Desktop Layout */}
      <DesktopLayout isLoginActive={isLoginActive} onTabChange={setIsLoginActive} />

      {/* Footer */}
      <Footer />
    </div>
  );
}

// ============================================================================
// Layout Components
// ============================================================================

interface LayoutProps {
  isLoginActive: boolean;
  onTabChange: (isLogin: boolean) => void;
}

function MobileLayout({ isLoginActive, onTabChange }: LayoutProps) {
  return (
    <div className="md:hidden">
      <div className="bg-white rounded-2xl shadow-modal p-5 sm:p-6">
        <MobileHeader />
        <MobileTabSwitcher isLoginActive={isLoginActive} onTabChange={onTabChange} />

        {/* Mobile Forms */}
        <div className="relative overflow-hidden">
          <div
            className={cn(
              'transition-all duration-500 ease-in-out',
              isLoginActive
                ? 'opacity-100 translate-x-0'
                : 'opacity-0 -translate-x-full absolute inset-0 pointer-events-none'
            )}
          >
            <LoginForm isActive={isLoginActive} isMobile />
          </div>
          <div
            className={cn(
              'transition-all duration-500 ease-in-out',
              !isLoginActive
                ? 'opacity-100 translate-x-0'
                : 'opacity-0 translate-x-full absolute inset-0 pointer-events-none'
            )}
          >
            <RegisterForm isActive={!isLoginActive} isMobile />
          </div>
        </div>
      </div>
    </div>
  );
}

function DesktopLayout({ isLoginActive, onTabChange }: LayoutProps) {
  return (
    <div className="hidden md:block relative bg-white rounded-2xl shadow-modal overflow-hidden min-h-[600px]">
      {/* Forms Container */}
      <div className="flex h-full min-h-[600px]">
        {/* Register Form - Left Side */}
        <div
          className={cn(
            'w-1/2 p-6 lg:p-8 transition-all duration-500 ease-in-out',
            isLoginActive ? 'opacity-0 pointer-events-none scale-95' : 'opacity-100 scale-100'
          )}
        >
          <RegisterForm isActive={!isLoginActive} />
        </div>

        {/* Login Form - Right Side */}
        <div
          className={cn(
            'w-1/2 p-6 lg:p-8 transition-all duration-500 ease-in-out',
            isLoginActive ? 'opacity-100 scale-100' : 'opacity-0 pointer-events-none scale-95'
          )}
        >
          <LoginForm isActive={isLoginActive} />
        </div>
      </div>

      {/* Sliding Overlay Panel */}
      <OverlayPanel isLoginActive={isLoginActive} onToggle={onTabChange} />
    </div>
  );
}

function Footer() {
  return (
    <p
      className="text-center text-xs sm:text-sm text-slate-500 mt-4 sm:mt-6 animate-fade-in px-4"
      style={{ animationDelay: '0.5s' }}
    >
      By continuing, you agree to our{' '}
      <Link href="/terms" className="text-slate-700 hover:text-brand-600 transition-colors">
        Terms
      </Link>{' '}
      and{' '}
      <Link href="/privacy" className="text-slate-700 hover:text-brand-600 transition-colors">
        Privacy Policy
      </Link>
    </p>
  );
}

// ============================================================================
// Main Export with Suspense
// ============================================================================

export default function AuthPage() {
  return (
    <Suspense fallback={<AuthSkeleton />}>
      <AuthPageContent />
    </Suspense>
  );
}
