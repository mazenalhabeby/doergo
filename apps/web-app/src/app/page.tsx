'use client';

import { useEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { AnimatedLogo } from '@hbcfield/shared/components';
import {
  motion,
  useScroll,
  useTransform,
  useMotionValue,
  useSpring,
  useInView,
} from 'framer-motion';
import {
  Radio,
  Zap,
  ClipboardCheck,
  Users,
  ArrowRight,
  ShieldCheck,
  Monitor,
  Smartphone,
  Globe,
  MapPin,
  Bell,
  BarChart3,
  FileCheck,
} from 'lucide-react';

/* ═══════════════════════════════════════════════════════════
   COMPONENTS
   ═══════════════════════════════════════════════════════════ */

/** Magnetic spring wrapper — element subtly follows cursor */
function Magnetic({ children, strength = 0.2 }: { children: ReactNode; strength?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 180, damping: 18 });
  const sy = useSpring(y, { stiffness: 180, damping: 18 });

  return (
    <motion.div
      ref={ref}
      style={{ x: sx, y: sy }}
      onMouseMove={(e) => {
        const r = ref.current!.getBoundingClientRect();
        x.set((e.clientX - r.left - r.width / 2) * strength);
        y.set((e.clientY - r.top - r.height / 2) * strength);
      }}
      onMouseLeave={() => { x.set(0); y.set(0); }}
      className="inline-block"
    >
      {children}
    </motion.div>
  );
}

/** 3D tilt card — follows cursor with spring physics */
function TiltCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const xRaw = useMotionValue(0);
  const yRaw = useMotionValue(0);
  const rotateX = useSpring(useTransform(yRaw, [-0.5, 0.5], [14, -14]), { stiffness: 260, damping: 25 });
  const rotateY = useSpring(useTransform(xRaw, [-0.5, 0.5], [-14, 14]), { stiffness: 260, damping: 25 });

  return (
    <motion.div
      ref={ref}
      style={{ rotateX, rotateY, transformPerspective: 800, transformStyle: 'preserve-3d' }}
      onMouseMove={(e) => {
        const r = ref.current!.getBoundingClientRect();
        xRaw.set((e.clientX - r.left) / r.width - 0.5);
        yRaw.set((e.clientY - r.top) / r.height - 0.5);
      }}
      onMouseLeave={() => { xRaw.set(0); yRaw.set(0); }}
      className={`will-change-transform ${className}`}
    >
      {children}
    </motion.div>
  );
}

/** Masked text reveal — text slides up from behind a clip */
function RevealLine({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  return (
    <span className="inline-block overflow-hidden pb-2">
      <motion.span
        className="inline-block"
        initial={{ y: '120%', rotateX: 40 }}
        animate={{ y: '0%', rotateX: 0 }}
        transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1], delay }}
      >
        {children}
      </motion.span>
    </span>
  );
}

/** Section wrapper — fades + slides in when scrolled into view */
function Reveal({
  children,
  className = '',
  delay = 0,
  y = 80,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y, rotateX: 4 }}
      animate={inView ? { opacity: 1, y: 0, rotateX: 0 } : {}}
      transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay }}
      className={className}
      style={{ transformPerspective: 1200 }}
    >
      {children}
    </motion.div>
  );
}

/** Animated counter — spring-driven number */
function Counter({ to, suffix = '' }: { to: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const mv = useMotionValue(0);
  const spring = useSpring(mv, { stiffness: 40, damping: 25 });
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (inView) mv.set(to);
  }, [inView, mv, to]);

  useEffect(() => {
    return spring.on('change', (v) => setDisplay(Math.round(v)));
  }, [spring]);

  return <span ref={ref}>{display}{suffix}</span>;
}

/* ═══════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════ */

export default function Home() {
  const { t } = useTranslation();
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && isAuthenticated) router.push('/dashboard');
  }, [isLoading, isAuthenticated, router]);

  /* hero scroll parallax — use window scroll (no ref needed) */
  const { scrollY } = useScroll();
  const heroOp = useTransform(scrollY, [0, 600], [1, 0]);
  const heroSc = useTransform(scrollY, [0, 600], [1, 0.88]);
  const heroY = useTransform(scrollY, [0, 600], [0, -120]);

  /* mouse spotlight (ref, no re-renders) */
  const spotRef = useRef<HTMLDivElement>(null);
  const onMouse = useCallback((e: React.MouseEvent) => {
    if (spotRef.current)
      spotRef.current.style.background = `radial-gradient(1000px at ${e.clientX}px ${e.clientY}px, rgba(16,185,129,0.06), transparent 40%)`;
  }, []);

  /* nav scroll */
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', fn, { passive: true });
    return () => window.removeEventListener('scroll', fn);
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#050505]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500" />
      </div>
    );
  }

  /* ─── MARQUEE WORDS ─── */
  const marqueeText = 'DISPATCH \u00B7 TRACK \u00B7 DELIVER \u00B7 MANAGE \u00B7 REPORT \u00B7 SCHEDULE \u00B7 ';

  return (
    <>
      <style>{`
        /* ── grain ── */
        .grain::after{content:'';position:fixed;inset:0;z-index:200;pointer-events:none;opacity:.035;mix-blend-mode:overlay;
          background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
          background-repeat:repeat;background-size:256px}

        /* ── aurora ── */
        @keyframes au1{0%,100%{transform:translate(0,0) scale(1)}33%{transform:translate(5%,-12%) scale(1.12)}66%{transform:translate(-4%,8%) scale(.95)}}
        @keyframes au2{0%,100%{transform:translate(0,0) scale(1)}33%{transform:translate(-9%,6%) scale(1.08)}66%{transform:translate(5%,-9%) scale(1.12)}}
        @keyframes au3{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(7%,10%) scale(1.1)}}
        .au1{animation:au1 18s ease-in-out infinite}
        .au2{animation:au2 24s ease-in-out infinite}
        .au3{animation:au3 30s ease-in-out infinite}

        /* ── float ── */
        @keyframes fl1{0%,100%{transform:translate3d(0,0,0) rotate(12deg)}50%{transform:translate3d(25px,-35px,50px) rotate(22deg)}}
        @keyframes fl2{0%,100%{transform:translate3d(0,0,0) rotate(-6deg)}50%{transform:translate3d(-35px,25px,30px) rotate(-16deg)}}
        @keyframes fl3{0%,100%{transform:translate3d(0,0,0) rotate(3deg)}50%{transform:translate3d(18px,20px,25px) rotate(10deg)}}
        .fl1{animation:fl1 12s ease-in-out infinite}
        .fl2{animation:fl2 16s ease-in-out infinite}
        .fl3{animation:fl3 20s ease-in-out infinite}

        /* ── marquee ── */
        @keyframes mrq{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
        .mrq{animation:mrq 45s linear infinite}
        .mrq:hover{animation-play-state:paused}

        /* ── helpers ── */
        .fd{font-family:var(--font-outfit,'Outfit'),'Inter',system-ui,sans-serif}
        .gl{background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.06);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px)}
        .gl:hover{background:rgba(255,255,255,.05);border-color:rgba(255,255,255,.12)}
        .tg{background:linear-gradient(135deg,#10b981 0%,#3b82f6 50%,#8b5cf6 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
      `}</style>

      <div className="grain bg-[#050505] text-white min-h-screen overflow-x-hidden selection:bg-emerald-500/30">

        {/* ═════════ NAV ═════════ */}
        <motion.nav
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.1 }}
          className={`fixed top-0 inset-x-0 z-50 px-6 transition-all duration-500 ${
            scrolled ? 'py-3 bg-[#050505]/70 backdrop-blur-2xl border-b border-white/[.04]' : 'py-5'
          }`}
        >
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <AnimatedLogo size="small" variant="light" />
            <div className="flex items-center gap-5">
              <Link href="/login" className="text-sm text-zinc-500 hover:text-white transition-colors hidden sm:block">
                {t('landing.nav.signIn')}
              </Link>
              <Magnetic>
                <Link href="/login" className="text-sm px-5 py-2.5 rounded-full bg-white/[.08] hover:bg-white/[.14] text-white font-medium transition-all duration-300 border border-white/[.08] hover:border-white/[.16]">
                  {t('landing.nav.getStarted')}
                </Link>
              </Magnetic>
            </div>
          </div>
        </motion.nav>

        {/* ═════════ HERO ═════════ */}
        <section
          onMouseMove={onMouse}
          className="relative min-h-[110vh] flex items-center justify-center px-6 pt-28 pb-32 overflow-hidden"
        >
          {/* spotlight */}
          <div ref={spotRef} className="absolute inset-0 pointer-events-none z-[1]" />

          {/* aurora blobs */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute -top-[30%] -left-[15%] w-[900px] h-[900px] rounded-full bg-emerald-500/[.09] blur-[180px] au1" />
            <div className="absolute -bottom-[20%] -right-[15%] w-[800px] h-[800px] rounded-full bg-blue-600/[.07] blur-[160px] au2" />
            <div className="absolute top-[10%] right-[20%] w-[650px] h-[650px] rounded-full bg-violet-500/[.04] blur-[150px] au3" />
          </div>

          {/* dot grid */}
          <div className="absolute inset-0 opacity-[.02]" style={{
            backgroundImage: 'radial-gradient(rgba(255,255,255,.5) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }} />

          {/* floating 3D geometry */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ perspective: '1200px' }}>
            <div className="absolute top-[12%] right-[8%] w-48 h-48 rounded-[2rem] border border-emerald-500/10 bg-gradient-to-br from-emerald-500/[.06] to-transparent fl1" />
            <div className="absolute bottom-[22%] left-[6%] w-32 h-32 rounded-full border border-blue-500/10 bg-blue-500/[.04] fl2" />
            <div className="absolute top-[45%] left-[18%] w-20 h-20 rounded-xl border border-violet-400/8 fl3" />
            <div className="absolute bottom-[35%] right-[15%] w-14 h-14 rounded-lg border border-emerald-400/6 fl1" style={{ animationDelay: '-6s' }} />
            <div className="absolute top-[22%] left-[35%] w-10 h-10 rounded-full border border-blue-300/6 fl2" style={{ animationDelay: '-4s' }} />
          </div>

          {/* bottom fade */}
          <div className="absolute bottom-0 inset-x-0 h-56 bg-gradient-to-t from-[#050505] to-transparent pointer-events-none z-[2]" />

          {/* content — scroll parallax */}
          <motion.div
            className="relative z-10 text-center max-w-5xl mx-auto"
            style={{ opacity: heroOp, scale: heroSc, y: heroY }}
          >
            {/* pill badge */}
            <motion.div
              initial={{ opacity: 0, y: 24, filter: 'blur(10px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
              className="inline-flex items-center gap-2.5 px-5 py-2 rounded-full border border-emerald-500/15 bg-emerald-500/[.05] mb-12"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
              </span>
              <span className="text-[11px] text-emerald-300/70 font-medium tracking-[.18em] uppercase">
                {t('landing.hero.badge')}
              </span>
            </motion.div>

            {/* headline — masked reveal */}
            <h1 className="fd font-extrabold text-[clamp(3rem,9vw,8.5rem)] leading-[.88] tracking-[-.045em] mb-10">
              <RevealLine delay={0.4}>{t('landing.hero.headline1')}</RevealLine>
              <br />
              <span className="tg">
                <RevealLine delay={0.6}>{t('landing.hero.headline2')}</RevealLine>
              </span>
            </h1>

            {/* sub */}
            <motion.p
              initial={{ opacity: 0, y: 40, filter: 'blur(8px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: 0.85 }}
              className="text-[clamp(1rem,2vw,1.25rem)] text-zinc-400 max-w-2xl mx-auto mb-16 leading-relaxed"
            >
              {t('landing.hero.subtitle')}
            </motion.p>

            {/* CTAs */}
            <motion.div
              initial={{ opacity: 0, y: 40, filter: 'blur(8px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: 1.05 }}
              className="flex flex-col sm:flex-row gap-4 justify-center"
            >
              <Magnetic strength={0.25}>
                <Link
                  href="/login"
                  className="group relative inline-flex items-center justify-center gap-3 px-10 py-[18px] rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-lg transition-all duration-400 hover:shadow-[0_0_60px_rgba(16,185,129,0.35)]"
                >
                  {t('landing.hero.ctaPrimary')}
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1.5 transition-transform duration-300" />
                </Link>
              </Magnetic>
              <Magnetic strength={0.25}>
                <Link
                  href="/login"
                  className="inline-flex items-center justify-center px-10 py-[18px] rounded-2xl border border-zinc-700/60 hover:border-zinc-500 text-zinc-300 hover:text-white font-semibold text-lg transition-all duration-400"
                >
                  {t('landing.hero.ctaSecondary')}
                </Link>
              </Magnetic>
            </motion.div>
          </motion.div>
        </section>

        {/* ═════════ MARQUEE ═════════ */}
        <div className="relative border-y border-white/[.04] py-6 overflow-hidden">
          <div className="mrq flex whitespace-nowrap">
            {Array.from({ length: 4 }).map((_, i) => (
              <span key={i} className="fd font-extrabold text-[clamp(2rem,5vw,4.5rem)] text-white/[.03] mx-2 select-none tracking-[.04em]">
                {marqueeText}
              </span>
            ))}
          </div>
        </div>

        {/* ═════════ FEATURES — bento grid ═════════ */}
        <section className="relative py-36 sm:py-44 px-6">
          <div className="max-w-6xl mx-auto">
            <Reveal className="text-center mb-24">
              <span className="text-[11px] text-emerald-400/50 font-medium tracking-[.2em] uppercase mb-5 block">
                {t('landing.features.sectionLabel')}
              </span>
              <h2 className="fd font-bold text-[clamp(2rem,5vw,3.5rem)] tracking-tight leading-tight">
                {t('landing.features.sectionTitle1')}
                <br />
                <span className="tg">{t('landing.features.sectionTitle2')}</span>
              </h2>
            </Reveal>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
              {/* large card 1 */}
              <Reveal className="md:col-span-7" delay={0.1}>
                <TiltCard>
                  <div className="gl rounded-3xl p-8 sm:p-10 h-full group relative overflow-hidden min-h-[260px] transition-all duration-500">
                    <div className="absolute top-0 right-0 w-60 h-60 rounded-full bg-emerald-500/[.06] blur-[100px] group-hover:bg-emerald-500/[.1] transition-all duration-700" />
                    <div className="relative" style={{ transform: 'translateZ(30px)' }}>
                      <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-500">
                        <Radio className="w-7 h-7 text-emerald-400" />
                      </div>
                      <h3 className="fd font-bold text-2xl mb-3">{t('landing.features.realTimeTracking')}</h3>
                      <p className="text-zinc-500 leading-relaxed max-w-md text-[15px]">
                        {t('landing.features.realTimeTrackingDesc')}
                      </p>
                    </div>
                  </div>
                </TiltCard>
              </Reveal>

              {/* small card 2 */}
              <Reveal className="md:col-span-5" delay={0.2}>
                <TiltCard>
                  <div className="gl rounded-3xl p-8 sm:p-10 h-full group relative overflow-hidden min-h-[260px] transition-all duration-500">
                    <div className="absolute bottom-0 left-0 w-48 h-48 rounded-full bg-blue-500/[.06] blur-[80px] group-hover:bg-blue-500/[.1] transition-all duration-700" />
                    <div className="relative" style={{ transform: 'translateZ(30px)' }}>
                      <div className="w-14 h-14 rounded-2xl bg-blue-500/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-500">
                        <Zap className="w-7 h-7 text-blue-400" />
                      </div>
                      <h3 className="fd font-bold text-2xl mb-3">{t('landing.features.smartDispatch')}</h3>
                      <p className="text-zinc-500 leading-relaxed text-[15px]">
                        {t('landing.features.smartDispatchDesc')}
                      </p>
                    </div>
                  </div>
                </TiltCard>
              </Reveal>

              {/* small card 3 */}
              <Reveal className="md:col-span-5" delay={0.3}>
                <TiltCard>
                  <div className="gl rounded-3xl p-8 sm:p-10 h-full group relative overflow-hidden min-h-[260px] transition-all duration-500">
                    <div className="absolute top-0 right-0 w-48 h-48 rounded-full bg-violet-500/[.06] blur-[80px] group-hover:bg-violet-500/[.1] transition-all duration-700" />
                    <div className="relative" style={{ transform: 'translateZ(30px)' }}>
                      <div className="w-14 h-14 rounded-2xl bg-violet-500/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-500">
                        <ClipboardCheck className="w-7 h-7 text-violet-400" />
                      </div>
                      <h3 className="fd font-bold text-2xl mb-3">{t('landing.features.serviceReports')}</h3>
                      <p className="text-zinc-500 leading-relaxed text-[15px]">
                        {t('landing.features.serviceReportsDesc')}
                      </p>
                    </div>
                  </div>
                </TiltCard>
              </Reveal>

              {/* large card 4 */}
              <Reveal className="md:col-span-7" delay={0.4}>
                <TiltCard>
                  <div className="gl rounded-3xl p-8 sm:p-10 h-full group relative overflow-hidden min-h-[260px] transition-all duration-500">
                    <div className="absolute bottom-0 left-0 w-60 h-60 rounded-full bg-amber-500/[.05] blur-[100px] group-hover:bg-amber-500/[.09] transition-all duration-700" />
                    <div className="relative" style={{ transform: 'translateZ(30px)' }}>
                      <div className="w-14 h-14 rounded-2xl bg-amber-500/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-500">
                        <Users className="w-7 h-7 text-amber-400" />
                      </div>
                      <h3 className="fd font-bold text-2xl mb-3">{t('landing.features.teamManagement')}</h3>
                      <p className="text-zinc-500 leading-relaxed max-w-md text-[15px]">
                        {t('landing.features.teamManagementDesc')}
                      </p>
                    </div>
                  </div>
                </TiltCard>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ═════════ WORKFLOW ═════════ */}
        <section className="relative py-36 sm:py-44 px-6">
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-blue-500/[.025] rounded-full blur-[200px] pointer-events-none" />

          <div className="max-w-5xl mx-auto relative">
            <Reveal className="text-center mb-24">
              <span className="text-[11px] text-blue-400/50 font-medium tracking-[.2em] uppercase mb-5 block">
                {t('landing.workflow.sectionLabel')}
              </span>
              <h2 className="fd font-bold text-[clamp(2rem,5vw,3.5rem)] tracking-tight">
                {t('landing.workflow.sectionTitle')}
              </h2>
            </Reveal>

            <div className="grid md:grid-cols-4 gap-12 md:gap-6 relative">
              {/* connecting gradient line */}
              <Reveal className="hidden md:block absolute top-12 left-[calc(12.5%+32px)] right-[calc(12.5%+32px)] h-px">
                <motion.div
                  className="w-full h-full"
                  initial={{ scaleX: 0 }}
                  whileInView={{ scaleX: 1 }}
                  viewport={{ once: true, margin: '-100px' }}
                  transition={{ duration: 1.6, ease: [0.16, 1, 0.3, 1], delay: 0.6 }}
                  style={{
                    transformOrigin: 'left',
                    background: 'linear-gradient(90deg, #10b981, #3b82f6, #8b5cf6, #f59e0b)',
                    opacity: 0.2,
                  }}
                />
              </Reveal>

              {([
                { n: '01', titleKey: 'landing.workflow.step1Title', descKey: 'landing.workflow.step1Desc', bg: 'bg-emerald-500', glow: '#10b981' },
                { n: '02', titleKey: 'landing.workflow.step2Title', descKey: 'landing.workflow.step2Desc', bg: 'bg-blue-500', glow: '#3b82f6' },
                { n: '03', titleKey: 'landing.workflow.step3Title', descKey: 'landing.workflow.step3Desc', bg: 'bg-violet-500', glow: '#8b5cf6' },
                { n: '04', titleKey: 'landing.workflow.step4Title', descKey: 'landing.workflow.step4Desc', bg: 'bg-amber-500', glow: '#f59e0b' },
              ] as const).map((s, i) => (
                <Reveal key={s.n} delay={0.15 + i * 0.12} className="text-center">
                  <motion.div
                    className={`w-24 h-24 rounded-[1.25rem] ${s.bg} flex items-center justify-center mx-auto mb-8 fd text-base font-bold relative z-10`}
                    whileHover={{ scale: 1.1, rotate: 4 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 15 }}
                    style={{ boxShadow: `0 0 60px ${s.glow}30` }}
                  >
                    {s.n}
                  </motion.div>
                  <h3 className="fd font-semibold text-xl mb-2">{t(s.titleKey)}</h3>
                  <p className="text-sm text-zinc-500 leading-relaxed max-w-[200px] mx-auto">{t(s.descKey)}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ═════════ PLATFORMS / ROLES ═════════ */}
        <section className="relative py-36 sm:py-44 px-6">
          <div className="max-w-5xl mx-auto">
            <Reveal className="text-center mb-24">
              <span className="text-[11px] text-violet-400/50 font-medium tracking-[.2em] uppercase mb-5 block">
                {t('landing.platform.sectionLabel')}
              </span>
              <h2 className="fd font-bold text-[clamp(2rem,5vw,3.5rem)] tracking-tight leading-tight">
                {t('landing.platform.sectionTitle1')}
                <br />
                <span className="tg">{t('landing.platform.sectionTitle2')}</span>
              </h2>
            </Reveal>

            <div className="grid md:grid-cols-3 gap-6">
              {([
                {
                  icon: ShieldCheck,
                  roleKey: 'landing.platform.adminRole',
                  tagKey: 'landing.platform.adminTag',
                  descKey: 'landing.platform.adminDesc',
                  accent: 'emerald' as const,
                },
                {
                  icon: Monitor,
                  roleKey: 'landing.platform.dispatcherRole',
                  tagKey: 'landing.platform.dispatcherTag',
                  descKey: 'landing.platform.dispatcherDesc',
                  accent: 'blue' as const,
                },
                {
                  icon: Smartphone,
                  roleKey: 'landing.platform.technicianRole',
                  tagKey: 'landing.platform.technicianTag',
                  descKey: 'landing.platform.technicianDesc',
                  accent: 'violet' as const,
                },
              ] as const).map((r, i) => {
                const Icon = r.icon;
                const map = {
                  emerald: { icon: 'text-emerald-400', border: 'border-emerald-500/10 hover:border-emerald-500/30', pill: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/15', orb: 'bg-emerald-500' },
                  blue:    { icon: 'text-blue-400',    border: 'border-blue-500/10 hover:border-blue-500/30',    pill: 'bg-blue-500/10 text-blue-400 border-blue-500/15',    orb: 'bg-blue-500' },
                  violet:  { icon: 'text-violet-400',  border: 'border-violet-500/10 hover:border-violet-500/30',  pill: 'bg-violet-500/10 text-violet-400 border-violet-500/15',  orb: 'bg-violet-500' },
                };
                const c = map[r.accent];

                return (
                  <Reveal key={r.roleKey} delay={0.1 + i * 0.12}>
                    <TiltCard>
                      <div className={`gl rounded-3xl p-8 sm:p-10 h-full border ${c.border} transition-all duration-500 group relative overflow-hidden`}>
                        {/* accent orb */}
                        <div className={`absolute -bottom-10 -right-10 w-40 h-40 ${c.orb}/[.04] rounded-full blur-[60px] group-hover:opacity-150 transition-all duration-700`} />

                        <div className="relative">
                          <Icon className={`w-12 h-12 ${c.icon} mb-7 group-hover:scale-110 transition-transform duration-500`} style={{ transform: 'translateZ(25px)' }} />
                          <div className="flex items-center gap-3 mb-5" style={{ transform: 'translateZ(18px)' }}>
                            <h3 className="fd font-bold text-[1.7rem] leading-none">{t(r.roleKey)}</h3>
                            <span className={`text-[10px] px-2.5 py-1 rounded-full border ${c.pill} font-medium tracking-wider`}>
                              {t(r.tagKey)}
                            </span>
                          </div>
                          <p className="text-[15px] text-zinc-500 leading-relaxed" style={{ transform: 'translateZ(10px)' }}>
                            {t(r.descKey)}
                          </p>
                        </div>
                      </div>
                    </TiltCard>
                  </Reveal>
                );
              })}
            </div>
          </div>
        </section>

        {/* ═════════ STATS ═════════ */}
        <section className="relative py-28 px-6">
          <div className="max-w-5xl mx-auto">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              {([
                { icon: BarChart3, value: 10, suffix: '+', labelKey: 'landing.stats.taskStatuses', descKey: 'landing.stats.taskStatusesDesc', accent: 'text-emerald-400' },
                { icon: MapPin, value: 3, suffix: '', labelKey: 'landing.stats.userRoles', descKey: 'landing.stats.userRolesDesc', accent: 'text-blue-400' },
                { icon: FileCheck, value: 100, suffix: '%', labelKey: 'landing.stats.paperless', descKey: 'landing.stats.paperlessDesc', accent: 'text-violet-400' },
                { icon: Bell, value: 24, suffix: '/7', labelKey: 'landing.stats.realTime', descKey: 'landing.stats.realTimeDesc', accent: 'text-amber-400' },
              ] as const).map((s, i) => {
                const Icon = s.icon;
                return (
                  <Reveal key={s.labelKey} delay={i * 0.1}>
                    <div className="text-center py-8">
                      <Icon className={`w-6 h-6 ${s.accent} mx-auto mb-4 opacity-60`} />
                      <div className="fd font-extrabold text-5xl sm:text-6xl tracking-tight mb-2">
                        <Counter to={s.value} suffix={s.suffix} />
                      </div>
                      <div className="text-sm text-zinc-300 font-medium mb-1">{t(s.labelKey)}</div>
                      <div className="text-xs text-zinc-600">{t(s.descKey)}</div>
                    </div>
                  </Reveal>
                );
              })}
            </div>
          </div>
        </section>

        {/* ═════════ FINAL CTA ═════════ */}
        <section className="relative py-36 sm:py-44 px-6 overflow-hidden">
          {/* radial glow */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-[600px] h-[600px] bg-emerald-500/[.04] rounded-full blur-[180px]" />
          </div>

          <Reveal className="relative max-w-3xl mx-auto text-center">
            <h2 className="fd font-bold text-[clamp(2rem,6vw,4rem)] tracking-tight leading-[1.05] mb-8">
              {t('landing.cta.title1')}
              <br />
              {t('landing.cta.title2')}
            </h2>
            <p className="text-zinc-500 mb-14 text-lg max-w-xl mx-auto">
              {t('landing.cta.subtitle')}
            </p>
            <Magnetic strength={0.2}>
              <Link
                href="/login"
                className="group inline-flex items-center gap-3 px-12 py-5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xl transition-all duration-400 hover:shadow-[0_0_80px_rgba(16,185,129,0.3)]"
              >
                {t('landing.cta.button')}
                <ArrowRight className="w-5 h-5 group-hover:translate-x-2 transition-transform duration-300" />
              </Link>
            </Magnetic>
          </Reveal>
        </section>

        {/* ═════════ FOOTER ═════════ */}
        <footer className="border-t border-white/[.04] py-12 px-6">
          <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
            <AnimatedLogo size="small" variant="light" />
            <span className="text-xs text-zinc-700">&copy; {t('common.allRightsReserved', { year: new Date().getFullYear() })}</span>
            <div className="flex gap-6 text-xs text-zinc-700">
              <span className="hover:text-zinc-400 cursor-pointer transition-colors">{t('landing.footer.privacy')}</span>
              <span className="hover:text-zinc-400 cursor-pointer transition-colors">{t('landing.footer.terms')}</span>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
