'use client';

import { cn } from '@/lib/utils';
import { TeamCollaborationIllustration, DashboardAnalyticsIllustration } from '@/components/illustrations';
import { FloatingParticles } from './floating-particles';
import { AnimatedLogo } from '@doergo/shared/components';

interface OverlayPanelProps {
  isLoginActive: boolean;
  onToggle: (isLogin: boolean) => void;
}

export function OverlayPanel({ isLoginActive, onToggle }: OverlayPanelProps) {
  return (
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
          {/* Login Panel Content (shown when login is active) */}
          <LoginPanelContent isActive={isLoginActive} onCreateAccount={() => onToggle(false)} />

          {/* Register Panel Content (shown when register is active) */}
          <RegisterPanelContent isActive={!isLoginActive} onSignIn={() => onToggle(true)} />
        </div>
      </div>
    </div>
  );
}

interface PanelContentProps {
  isActive: boolean;
}

interface LoginPanelContentProps extends PanelContentProps {
  onCreateAccount: () => void;
}

function LoginPanelContent({ isActive, onCreateAccount }: LoginPanelContentProps) {
  return (
    <div
      className={cn(
        'absolute inset-0 flex flex-col items-center justify-center p-6 lg:p-8 transition-all duration-500',
        isActive ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-full'
      )}
    >
      <div className="text-center max-w-xs">
        {/* Animated Logo */}
        <div className="flex items-center justify-center gap-2 mb-6 lg:mb-8">
          <AnimatedLogo variant="light" size="large" />
        </div>

        <h2
          className="text-2xl lg:text-3xl font-bold mb-2 animate-fade-in-up"
          style={{ animationDelay: '0.1s' }}
        >
          Start Your Journey
        </h2>
        <p
          className="text-sm lg:text-base text-slate-400 animate-fade-in-up"
          style={{ animationDelay: '0.15s' }}
        >
          Join thousands of partners managing field operations effortlessly
        </p>

        {/* Illustration - Team collaboration */}
        <div
          className="flex justify-center my-6 lg:my-8 animate-fade-in-up"
          style={{ animationDelay: '0.2s' }}
        >
          <TeamCollaborationIllustration className="w-56 h-40 lg:w-72 lg:h-52" />
        </div>

        <button
          onClick={onCreateAccount}
          className="w-full h-11 lg:h-12 rounded-xl border border-white/30 bg-white/5 text-white font-semibold text-sm tracking-widest uppercase hover:bg-white/10 hover:border-white/50 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
        >
          Create Account
        </button>
      </div>
    </div>
  );
}

interface RegisterPanelContentProps extends PanelContentProps {
  onSignIn: () => void;
}

function RegisterPanelContent({ isActive, onSignIn }: RegisterPanelContentProps) {
  return (
    <div
      className={cn(
        'absolute inset-0 flex flex-col items-center justify-center p-6 lg:p-8 transition-all duration-500',
        isActive ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-full'
      )}
    >
      <div className="text-center max-w-xs">
        {/* Animated Logo */}
        <div className="flex items-center justify-center gap-2 mb-6 lg:mb-8">
          <AnimatedLogo variant="light" size="large" />
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
          onClick={onSignIn}
          className="w-full h-11 lg:h-12 rounded-xl border border-white/30 bg-white/5 text-white font-semibold text-sm tracking-widest uppercase hover:bg-white/10 hover:border-white/50 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
        >
          Sign In
        </button>
      </div>
    </div>
  );
}
