'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import {
  Eye, EyeOff, Mail, Lock, User, Building2,
  Check, Sparkles
} from 'lucide-react';
import { Button, Input, Label, Checkbox, Spinner } from '@/components/ui';
import { TeamCollaborationIllustration, DashboardAnalyticsIllustration } from '@/components/illustrations';
import { useAuth } from '@/contexts/auth-context';
import { authApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  loginSchema,
  registerSchema,
  passwordRequirements,
  type LoginFormData,
  type RegisterFormData,
} from '@/lib/validation';

// ============================================================================
// Floating Particles Component
// ============================================================================

function FloatingParticles({ count = 20 }: { count?: number }) {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {[...Array(count)].map((_, i) => (
        <div
          key={i}
          className="absolute w-1 h-1 bg-white/20 rounded-full animate-float"
          style={{
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
            animationDelay: `${Math.random() * 5}s`,
            animationDuration: `${3 + Math.random() * 4}s`,
          }}
        />
      ))}
    </div>
  );
}

// ============================================================================
// Animated Logo Component
// ============================================================================

function AnimatedLogo({ className, size = 'default' }: { className?: string; size?: 'small' | 'default' }) {
  const sizeClasses = size === 'small' ? 'w-10 h-10' : 'w-12 h-12';
  const textSize = size === 'small' ? 'text-xl' : 'text-2xl';
  const sparkleSize = size === 'small' ? 'w-3 h-3' : 'w-4 h-4';

  return (
    <div className={cn("relative group", className)}>
      <div className="absolute inset-0 bg-gradient-to-br from-accent-400 to-accent-600 rounded-xl blur-lg opacity-50 group-hover:opacity-75 transition-opacity duration-500 animate-pulse-slow" />
      <div className={cn("relative rounded-xl bg-gradient-to-br from-accent-400 to-accent-600 flex items-center justify-center shadow-lg transform group-hover:scale-110 transition-transform duration-300", sizeClasses)}>
        <span className={cn("font-bold text-white", textSize)}>D</span>
        <Sparkles className={cn("absolute -top-1 -right-1 text-yellow-300 animate-ping-slow", sparkleSize)} />
      </div>
    </div>
  );
}

// ============================================================================
// Mobile Tab Switcher Component
// ============================================================================

function MobileTabSwitcher({ isLoginActive, setIsLoginActive }: { isLoginActive: boolean; setIsLoginActive: (v: boolean) => void }) {
  return (
    <div className="flex md:hidden bg-slate-100 p-1 rounded-xl mb-6">
      <button
        onClick={() => setIsLoginActive(true)}
        className={cn(
          "flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all duration-300",
          isLoginActive
            ? "bg-white text-slate-900 shadow-sm"
            : "text-slate-500 hover:text-slate-700"
        )}
      >
        Sign In
      </button>
      <button
        onClick={() => setIsLoginActive(false)}
        className={cn(
          "flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all duration-300",
          !isLoginActive
            ? "bg-white text-slate-900 shadow-sm"
            : "text-slate-500 hover:text-slate-700"
        )}
      >
        Create Account
      </button>
    </div>
  );
}

// ============================================================================
// Mobile Header Component
// ============================================================================

function MobileHeader() {
  return (
    <div className="flex md:hidden flex-col items-center justify-center gap-2 mb-6">
      <div className="flex items-center gap-3">
        <AnimatedLogo size="small" />
        <span className="text-xl font-bold text-slate-900">Doergo</span>
      </div>
      <p className="text-xs text-slate-500">Partner Portal</p>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

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
      // Clean up URL
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

  // Show loading while checking auth
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className={cn(
      "w-full max-w-[900px] mx-auto transition-all duration-700",
      mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
    )}>
      {/* Mobile Layout */}
      <div className="md:hidden">
        <div className="bg-white rounded-2xl shadow-modal p-5 sm:p-6">
          <MobileHeader />
          <MobileTabSwitcher isLoginActive={isLoginActive} setIsLoginActive={setIsLoginActive} />

          {/* Mobile Forms */}
          <div className="relative overflow-hidden">
            <div
              className={cn(
                "transition-all duration-500 ease-in-out",
                isLoginActive
                  ? "opacity-100 translate-x-0"
                  : "opacity-0 -translate-x-full absolute inset-0 pointer-events-none"
              )}
            >
              <LoginForm isActive={isLoginActive} isMobile />
            </div>
            <div
              className={cn(
                "transition-all duration-500 ease-in-out",
                !isLoginActive
                  ? "opacity-100 translate-x-0"
                  : "opacity-0 translate-x-full absolute inset-0 pointer-events-none"
              )}
            >
              <RegisterForm isActive={!isLoginActive} isMobile />
            </div>
          </div>
        </div>
      </div>

      {/* Desktop Layout */}
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

        {/* Sliding Overlay Panel - Desktop Only */}
        <div
          className={cn(
            'absolute top-0 w-1/2 h-full transition-transform duration-700 ease-[cubic-bezier(0.68,-0.15,0.32,1.15)] z-10',
            isLoginActive ? 'translate-x-0' : 'translate-x-full'
          )}
        >
          <div className="relative w-full h-full bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white overflow-hidden">
            {/* Animated Background Pattern */}
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff06_1px,transparent_1px),linear-gradient(to_bottom,#ffffff06_1px,transparent_1px)] bg-[size:20px_20px] animate-grid-flow" />

            {/* Animated Gradient Orbs */}
            <div className="absolute -top-24 -left-24 w-48 lg:w-64 h-48 lg:h-64 bg-accent-500/20 rounded-full blur-3xl animate-orb-1" />
            <div className="absolute -bottom-24 -right-24 w-48 lg:w-64 h-48 lg:h-64 bg-brand-500/20 rounded-full blur-3xl animate-orb-2" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 lg:w-48 h-32 lg:h-48 bg-purple-500/10 rounded-full blur-3xl animate-orb-3" />

            {/* Floating Particles */}
            <FloatingParticles count={15} />

            {/* Content Container with Slide Animation */}
            <div className="relative z-10 h-full flex flex-col items-center justify-center p-6 lg:p-8">
              {/* Login Panel Content */}
              <div
                className={cn(
                  'absolute inset-0 flex flex-col items-center justify-center p-6 lg:p-8 transition-all duration-500',
                  isLoginActive
                    ? 'opacity-100 translate-x-0'
                    : 'opacity-0 -translate-x-full'
                )}
              >
                <div className="text-center max-w-xs">
                  {/* Animated Logo */}
                  <div className="flex items-center justify-center gap-2 mb-6 lg:mb-8">
                    <AnimatedLogo />
                  </div>

                  <h2 className="text-2xl lg:text-3xl font-bold mb-2 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
                    Start Your Journey
                  </h2>
                  <p className="text-sm lg:text-base text-slate-400 animate-fade-in-up" style={{ animationDelay: '0.15s' }}>
                    Join thousands of partners managing field operations effortlessly
                  </p>

                  {/* Illustration - Team collaboration */}
                  <div className="flex justify-center my-6 lg:my-8 animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
                    <TeamCollaborationIllustration className="w-56 h-40 lg:w-72 lg:h-52" />
                  </div>

                  <button
                    onClick={() => setIsLoginActive(false)}
                    className="w-full h-11 lg:h-12 rounded-xl border border-white/30 bg-white/5 text-white font-semibold text-sm tracking-widest uppercase hover:bg-white/10 hover:border-white/50 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
                  >
                    Create Account
                  </button>
                </div>
              </div>

              {/* Register Panel Content */}
              <div
                className={cn(
                  'absolute inset-0 flex flex-col items-center justify-center p-6 lg:p-8 transition-all duration-500',
                  isLoginActive
                    ? 'opacity-0 translate-x-full'
                    : 'opacity-100 translate-x-0'
                )}
              >
                <div className="text-center max-w-xs">
                  {/* Animated Logo */}
                  <div className="flex items-center justify-center gap-2 mb-6 lg:mb-8">
                    <AnimatedLogo />
                  </div>

                  <h2 className="text-2xl lg:text-3xl font-bold mb-2">Welcome Back!</h2>
                  <p className="text-sm lg:text-base text-slate-400">
                    Your dashboard is waiting with real-time insights
                  </p>

                  {/* Illustration - Dashboard analytics */}
                  <div className="flex justify-center my-6 lg:my-8">
                    <DashboardAnalyticsIllustration className="w-56 h-40 lg:w-72 lg:h-52" />
                  </div>

                  <button
                    onClick={() => setIsLoginActive(true)}
                    className="w-full h-11 lg:h-12 rounded-xl border border-white/30 bg-white/5 text-white font-semibold text-sm tracking-widest uppercase hover:bg-white/10 hover:border-white/50 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
                  >
                    Sign In
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <p className="text-center text-xs sm:text-sm text-slate-500 mt-4 sm:mt-6 animate-fade-in px-4" style={{ animationDelay: '0.5s' }}>
        By continuing, you agree to our{' '}
        <Link href="/terms" className="text-slate-700 hover:text-brand-600 transition-colors">Terms</Link>
        {' '}and{' '}
        <Link href="/privacy" className="text-slate-700 hover:text-brand-600 transition-colors">Privacy Policy</Link>
      </p>
    </div>
  );
}

/**
 * Auth Page with Suspense boundary for useSearchParams
 */
export default function AuthPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[400px]">
        <Spinner size="lg" />
      </div>
    }>
      <AuthPageContent />
    </Suspense>
  );
}

// ============================================================================
// Login Form Component
// ============================================================================

interface LoginFormProps {
  isActive: boolean;
  isMobile?: boolean;
}

function LoginForm({ isActive, isMobile = false }: LoginFormProps) {
  const router = useRouter();
  const { login } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [validationErrors, setValidationErrors] = useState<{ email?: string; password?: string }>({});
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setValidationErrors({});

    const result = loginSchema.safeParse({ email, password });
    if (!result.success) {
      const fieldErrors: { email?: string; password?: string } = {};
      result.error.errors.forEach((err) => {
        if (err.path[0] === 'email') fieldErrors.email = err.message;
        if (err.path[0] === 'password') fieldErrors.password = err.message;
      });
      setValidationErrors(fieldErrors);
      toast.error('Please fix the errors', {
        description: result.error.errors[0]?.message || 'Please fill all required fields correctly',
      });
      setIsLoading(false);
      return;
    }

    try {
      await login(email, password, rememberMe);
      toast.success('Welcome back!', {
        description: 'You have been signed in successfully.',
      });
      router.push('/dashboard');
    } catch (err) {
      toast.error('Sign in failed', {
        description: err instanceof Error ? err.message : 'Invalid email or password',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={cn("flex flex-col justify-center", !isMobile && "h-full")}>
      {/* Header - hidden on mobile as it's shown in MobileHeader */}
      {!isMobile && (
        <div className={cn(
          "space-y-2 mb-4 lg:mb-6 transition-all duration-500",
          isActive ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
        )} style={{ transitionDelay: '0.1s' }}>
          <h1 className="text-xl lg:text-2xl font-semibold tracking-tight text-slate-900">
            Welcome back
          </h1>
          <p className="text-xs lg:text-sm text-slate-500">
            Sign in to access your dashboard
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit} className={cn("space-y-3", !isMobile && "lg:space-y-4")}>
        <div className={cn(
          "space-y-1.5 sm:space-y-2 transition-all duration-500",
          isActive ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
        )} style={{ transitionDelay: isMobile ? '0s' : '0.15s' }}>
          <Label htmlFor="login-email" className="text-xs sm:text-sm font-medium text-slate-700">
            Email
          </Label>
          <div className={cn(
            "relative transition-transform duration-200",
            focusedField === 'email' && !isMobile && "scale-[1.02]"
          )}>
            <Mail className={cn(
              "absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 transition-colors duration-200",
              focusedField === 'email' ? "text-brand-600" : "text-slate-400"
            )} />
            <Input
              id="login-email"
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onFocus={() => setFocusedField('email')}
              onBlur={() => setFocusedField(null)}
              className={cn(
                'pl-10 h-10 sm:h-11 text-sm transition-all duration-200',
                validationErrors.email && 'border-error focus-visible:ring-error',
                focusedField === 'email' && 'border-brand-600 ring-2 ring-brand-100'
              )}
              disabled={isLoading}
            />
          </div>
          {validationErrors.email && (
            <p className="text-xs text-error animate-fade-in">{validationErrors.email}</p>
          )}
        </div>

        <div className={cn(
          "space-y-1.5 sm:space-y-2 transition-all duration-500",
          isActive ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
        )} style={{ transitionDelay: isMobile ? '0s' : '0.2s' }}>
          <div className="flex items-center justify-between">
            <Label htmlFor="login-password" className="text-xs sm:text-sm font-medium text-slate-700">
              Password
            </Label>
            <Link href="/forgot-password" className="text-xs text-brand-600 hover:text-brand-700 font-medium hover:underline transition-all">
              Forgot password?
            </Link>
          </div>
          <div className={cn(
            "relative transition-transform duration-200",
            focusedField === 'password' && !isMobile && "scale-[1.02]"
          )}>
            <Lock className={cn(
              "absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 transition-colors duration-200",
              focusedField === 'password' ? "text-brand-600" : "text-slate-400"
            )} />
            <Input
              id="login-password"
              type={showPassword ? 'text' : 'password'}
              placeholder="Your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onFocus={() => setFocusedField('password')}
              onBlur={() => setFocusedField(null)}
              className={cn(
                'pl-10 pr-10 h-10 sm:h-11 text-sm transition-all duration-200',
                validationErrors.password && 'border-error focus-visible:ring-error',
                focusedField === 'password' && 'border-brand-600 ring-2 ring-brand-100'
              )}
              disabled={isLoading}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors hover:scale-110"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {validationErrors.password && (
            <p className="text-xs text-error animate-fade-in">{validationErrors.password}</p>
          )}
        </div>

        <div className={cn(
          "flex items-center gap-2 transition-all duration-500",
          isActive ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
        )} style={{ transitionDelay: isMobile ? '0s' : '0.25s' }}>
          <Checkbox
            id="login-remember"
            checked={rememberMe}
            onCheckedChange={(checked) => setRememberMe(checked as boolean)}
            className="data-[state=checked]:bg-brand-600 data-[state=checked]:border-brand-600"
          />
          <Label htmlFor="login-remember" className="text-xs sm:text-sm text-slate-600 cursor-pointer hover:text-slate-900 transition-colors">
            Keep me signed in
          </Label>
        </div>

        {/* Submit Button with Gradient & Glow */}
        <div
          className={cn(
            "relative group transition-all duration-500",
            isActive ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
          )}
          style={{ transitionDelay: isMobile ? '0s' : '0.3s' }}
        >
          <Button
            type="submit"
            disabled={isLoading}
            className={cn(
              "relative w-full h-10 sm:h-11 bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-700 hover:to-brand-600 text-white font-semibold text-sm rounded-lg transition-all duration-300 border-0 shadow-sm hover:shadow-md hover:shadow-brand-600/20",
              !isLoading && "active:scale-[0.98]"
            )}
          >
            {isLoading ? (
              <Spinner size="sm" />
            ) : (
              'Sign in to Dashboard'
            )}
          </Button>
        </div>

        {/* Social Divider */}
        <div className={cn(
          "relative my-4 sm:my-5 transition-all duration-500",
          isActive ? "opacity-100" : "opacity-0"
        )} style={{ transitionDelay: isMobile ? '0s' : '0.35s' }}>
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-200" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-white px-3 text-slate-400 font-medium">or continue with</span>
          </div>
        </div>

        {/* OAuth Buttons - Modern Style */}
        <div className={cn(
          "grid grid-cols-2 gap-3 transition-all duration-500",
          isActive ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
        )} style={{ transitionDelay: isMobile ? '0s' : '0.4s' }}>
          <button
            type="button"
            disabled={isLoading}
            className="group relative flex items-center justify-center gap-2.5 h-10 sm:h-11 px-4 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 hover:shadow-md transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            <span className="hidden sm:inline">Google</span>
          </button>
          <button
            type="button"
            disabled={isLoading}
            className="group relative flex items-center justify-center gap-2.5 h-10 sm:h-11 px-4 bg-[#24292F] border border-[#24292F] rounded-lg text-sm font-medium text-white hover:bg-[#1b1f23] hover:shadow-md transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
            </svg>
            <span className="hidden sm:inline">GitHub</span>
          </button>
        </div>
      </form>
    </div>
  );
}

// ============================================================================
// Register Form Component
// ============================================================================

type RegisterValidationErrors = Partial<Record<keyof RegisterFormData, string>>;

function RegisterForm({ isActive, isMobile = false }: { isActive: boolean; isMobile?: boolean }) {
  const router = useRouter();
  const { login } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [validationErrors, setValidationErrors] = useState<RegisterValidationErrors>({});
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const [formData, setFormData] = useState<RegisterFormData>({
    firstName: '',
    lastName: '',
    companyName: '',
    email: '',
    password: '',
    confirmPassword: '',
    acceptTerms: false,
  });

  const updateField = <K extends keyof RegisterFormData>(field: K, value: RegisterFormData[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (validationErrors[field]) {
      setValidationErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setValidationErrors({});

    const result = registerSchema.safeParse(formData);
    if (!result.success) {
      const fieldErrors: RegisterValidationErrors = {};
      result.error.errors.forEach((err) => {
        const field = err.path[0] as keyof RegisterFormData;
        if (!fieldErrors[field]) {
          fieldErrors[field] = err.message;
        }
      });
      setValidationErrors(fieldErrors);
      toast.error('Please fix the errors', {
        description: result.error.errors[0]?.message || 'Please fill all required fields correctly',
      });
      setIsLoading(false);
      return;
    }

    try {
      // Note: Role is set by backend for security - we don't send it
      await authApi.register({
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        password: formData.password,
        companyName: formData.companyName,
      });

      // Auto-login after successful registration
      await login(formData.email, formData.password);
      toast.success('Welcome to Doergo!', {
        description: 'Your account has been created successfully.',
      });
      router.push('/dashboard');
    } catch (err) {
      toast.error('Registration failed', {
        description: err instanceof Error ? err.message : 'Could not create your account. Please try again.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const inputClass = (field: string, hasError: boolean) => cn(
    'h-9 sm:h-10 text-sm transition-all duration-200',
    hasError && 'border-error',
    focusedField === field && 'border-brand-600 ring-2 ring-brand-100',
    focusedField === field && !isMobile && 'scale-[1.02]'
  );

  return (
    <div className={cn("flex flex-col justify-center", !isMobile && "h-full")}>
      {/* Header - hidden on mobile */}
      {!isMobile && (
        <div className={cn(
          "space-y-1 lg:space-y-2 mb-3 lg:mb-4 transition-all duration-500",
          isActive ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
        )}>
          <h1 className="text-xl lg:text-2xl font-semibold tracking-tight text-slate-900">
            Create your account
          </h1>
          <p className="text-xs lg:text-sm text-slate-500">
            Get started with Doergo
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-2.5 sm:space-y-3">
        {/* Name Fields */}
        <div className={cn(
          "grid grid-cols-2 gap-2 transition-all duration-500",
          isActive ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
        )} style={{ transitionDelay: isMobile ? '0s' : '0.05s' }}>
          <div className="space-y-1">
            <Label htmlFor="reg-firstName" className="text-xs font-medium text-slate-700">
              First name
            </Label>
            <div className="relative">
              <User className={cn(
                "absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 transition-colors",
                focusedField === 'firstName' ? "text-brand-600" : "text-slate-400"
              )} />
              <Input
                id="reg-firstName"
                type="text"
                placeholder="John"
                value={formData.firstName}
                onChange={(e) => updateField('firstName', e.target.value)}
                onFocus={() => setFocusedField('firstName')}
                onBlur={() => setFocusedField(null)}
                className={cn('pl-8', inputClass('firstName', !!validationErrors.firstName))}
                disabled={isLoading}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="reg-lastName" className="text-xs font-medium text-slate-700">
              Last name
            </Label>
            <Input
              id="reg-lastName"
              type="text"
              placeholder="Doe"
              value={formData.lastName}
              onChange={(e) => updateField('lastName', e.target.value)}
              onFocus={() => setFocusedField('lastName')}
              onBlur={() => setFocusedField(null)}
              className={inputClass('lastName', !!validationErrors.lastName)}
              disabled={isLoading}
            />
          </div>
        </div>

        {/* Company */}
        <div className={cn(
          "space-y-1 transition-all duration-500",
          isActive ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
        )} style={{ transitionDelay: isMobile ? '0s' : '0.1s' }}>
          <Label htmlFor="reg-company" className="text-xs font-medium text-slate-700">
            Company name
          </Label>
          <div className="relative">
            <Building2 className={cn(
              "absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 transition-colors",
              focusedField === 'company' ? "text-brand-600" : "text-slate-400"
            )} />
            <Input
              id="reg-company"
              type="text"
              placeholder="Your company name"
              value={formData.companyName}
              onChange={(e) => updateField('companyName', e.target.value)}
              onFocus={() => setFocusedField('company')}
              onBlur={() => setFocusedField(null)}
              className={cn('pl-8', inputClass('company', !!validationErrors.companyName))}
              disabled={isLoading}
            />
          </div>
        </div>

        {/* Email */}
        <div className={cn(
          "space-y-1 transition-all duration-500",
          isActive ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
        )} style={{ transitionDelay: isMobile ? '0s' : '0.15s' }}>
          <Label htmlFor="reg-email" className="text-xs font-medium text-slate-700">
            Work email
          </Label>
          <div className="relative">
            <Mail className={cn(
              "absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 transition-colors",
              focusedField === 'reg-email' ? "text-brand-600" : "text-slate-400"
            )} />
            <Input
              id="reg-email"
              type="email"
              placeholder="john@company.com"
              value={formData.email}
              onChange={(e) => updateField('email', e.target.value)}
              onFocus={() => setFocusedField('reg-email')}
              onBlur={() => setFocusedField(null)}
              className={cn('pl-8', inputClass('reg-email', !!validationErrors.email))}
              disabled={isLoading}
            />
          </div>
        </div>

        {/* Password */}
        <div className={cn(
          "space-y-1 transition-all duration-500",
          isActive ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
        )} style={{ transitionDelay: isMobile ? '0s' : '0.2s' }}>
          <Label htmlFor="reg-password" className="text-xs font-medium text-slate-700">
            Password
          </Label>
          <div className="relative">
            <Lock className={cn(
              "absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 transition-colors",
              focusedField === 'reg-password' ? "text-brand-600" : "text-slate-400"
            )} />
            <Input
              id="reg-password"
              type={showPassword ? 'text' : 'password'}
              placeholder="Min. 8 characters"
              value={formData.password}
              onChange={(e) => updateField('password', e.target.value)}
              onFocus={() => setFocusedField('reg-password')}
              onBlur={() => setFocusedField(null)}
              className={cn('pl-8 pr-8', inputClass('reg-password', !!validationErrors.password))}
              disabled={isLoading}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-all hover:scale-110"
            >
              {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>
          {/* Password Requirements */}
          {formData.password && (
            <div className="flex flex-wrap gap-x-2 sm:gap-x-3 gap-y-1 mt-1">
              {passwordRequirements.map((req, i) => (
                <span
                  key={i}
                  className={cn(
                    'text-[10px] flex items-center gap-1 transition-all duration-300',
                    req.test(formData.password) ? 'text-success scale-105' : 'text-slate-400'
                  )}
                >
                  <Check className={cn(
                    "w-2.5 h-2.5 transition-transform",
                    req.test(formData.password) && "animate-bounce-once"
                  )} />
                  {req.label}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Confirm Password */}
        <div className={cn(
          "space-y-1 transition-all duration-500",
          isActive ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
        )} style={{ transitionDelay: isMobile ? '0s' : '0.25s' }}>
          <Label htmlFor="reg-confirmPassword" className="text-xs font-medium text-slate-700">
            Confirm password
          </Label>
          <div className="relative">
            <Lock className={cn(
              "absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 transition-colors",
              focusedField === 'confirmPassword' ? "text-brand-600" : "text-slate-400"
            )} />
            <Input
              id="reg-confirmPassword"
              type="password"
              placeholder="Re-enter your password"
              value={formData.confirmPassword}
              onChange={(e) => updateField('confirmPassword', e.target.value)}
              onFocus={() => setFocusedField('confirmPassword')}
              onBlur={() => setFocusedField(null)}
              className={cn('pl-8', inputClass('confirmPassword', !!validationErrors.confirmPassword))}
              disabled={isLoading}
            />
          </div>
          {validationErrors.confirmPassword && (
            <p className="text-[10px] text-error animate-fade-in">{validationErrors.confirmPassword}</p>
          )}
        </div>

        {/* Terms */}
        <div className={cn(
          "flex items-start gap-2 transition-all duration-500",
          isActive ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
        )} style={{ transitionDelay: isMobile ? '0s' : '0.3s' }}>
          <Checkbox
            id="reg-terms"
            checked={formData.acceptTerms}
            onCheckedChange={(checked) => updateField('acceptTerms', checked as boolean)}
            className="mt-0.5 data-[state=checked]:bg-brand-600 data-[state=checked]:border-brand-600"
          />
          <Label htmlFor="reg-terms" className="text-[10px] sm:text-[11px] text-slate-600 cursor-pointer leading-tight hover:text-slate-900 transition-colors">
            I agree to the{' '}
            <Link href="/terms" className="text-brand-600 hover:text-brand-700 hover:underline">Terms of Service</Link>
            {' '}and{' '}
            <Link href="/privacy" className="text-brand-600 hover:text-brand-700 hover:underline">Privacy Policy</Link>
          </Label>
        </div>

        {/* Submit Button with Gradient & Glow */}
        <div
          className={cn(
            "relative group transition-all duration-500",
            isActive ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
          )}
          style={{ transitionDelay: isMobile ? '0s' : '0.35s' }}
        >
          <Button
            type="submit"
            disabled={isLoading}
            className={cn(
              "relative w-full h-9 sm:h-10 bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-700 hover:to-brand-600 text-white font-semibold text-sm rounded-lg transition-all duration-300 border-0 shadow-sm hover:shadow-md hover:shadow-brand-600/20",
              !isLoading && "active:scale-[0.98]"
            )}
          >
            {isLoading ? (
              <Spinner size="sm" />
            ) : (
              'Get Started Free'
            )}
          </Button>
        </div>

        {/* Social Divider */}
        <div className={cn(
          "relative my-3 sm:my-4 transition-all duration-500",
          isActive ? "opacity-100" : "opacity-0"
        )} style={{ transitionDelay: isMobile ? '0s' : '0.4s' }}>
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-200" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-white px-3 text-slate-400 font-medium">or continue with</span>
          </div>
        </div>

        {/* OAuth Buttons - Modern Style */}
        <div className={cn(
          "grid grid-cols-2 gap-3 transition-all duration-500",
          isActive ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
        )} style={{ transitionDelay: isMobile ? '0s' : '0.45s' }}>
          <button
            type="button"
            disabled={isLoading}
            className="group relative flex items-center justify-center gap-2 h-9 sm:h-10 px-3 bg-white border border-slate-200 rounded-lg text-xs sm:text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 hover:shadow-md transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className="w-4 h-4 sm:w-5 sm:h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            <span className="hidden sm:inline">Google</span>
          </button>
          <button
            type="button"
            disabled={isLoading}
            className="group relative flex items-center justify-center gap-2 h-9 sm:h-10 px-3 bg-[#24292F] border border-[#24292F] rounded-lg text-xs sm:text-sm font-medium text-white hover:bg-[#1b1f23] hover:shadow-md transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
            </svg>
            <span className="hidden sm:inline">GitHub</span>
          </button>
        </div>
      </form>
    </div>
  );
}
