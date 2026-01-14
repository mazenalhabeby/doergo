'use client';

import { cn } from '@/lib/utils';

interface IllustrationProps {
  className?: string;
}

/**
 * Team Collaboration Illustration
 * Shows task management with team members collaborating
 */
export function TeamCollaborationIllustration({ className }: IllustrationProps) {
  return (
    <svg
      className={cn('w-full h-full', className)}
      viewBox="0 0 320 220"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Background card */}
      <rect x="70" y="35" width="180" height="130" rx="10" fill="white" fillOpacity="0.1" />

      {/* Task cards */}
      <rect x="88" y="55" width="145" height="32" rx="6" fill="white" fillOpacity="0.15" />
      <rect x="98" y="64" width="10" height="10" rx="3" className="fill-accent-400" />
      <rect x="115" y="66" width="70" height="7" rx="2" fill="white" fillOpacity="0.5" />
      <rect x="195" y="64" width="28" height="12" rx="6" className="fill-success" />

      <rect x="88" y="95" width="145" height="32" rx="6" fill="white" fillOpacity="0.15" />
      <rect x="98" y="104" width="10" height="10" rx="3" className="fill-brand-400" />
      <rect x="115" y="106" width="55" height="7" rx="2" fill="white" fillOpacity="0.5" />
      <rect x="195" y="104" width="28" height="12" rx="6" className="fill-warning" />

      <rect
        x="88"
        y="135"
        width="145"
        height="22"
        rx="6"
        fill="white"
        fillOpacity="0.08"
        strokeDasharray="4 2"
        stroke="white"
        strokeOpacity="0.25"
      />
      <text x="160" y="150" textAnchor="middle" fill="white" fillOpacity="0.35" fontSize="11">
        + Add new task
      </text>

      {/* Person 1 - left */}
      <circle cx="38" cy="100" r="24" className="fill-brand-500" fillOpacity="0.25" />
      <circle cx="38" cy="94" r="10" className="fill-brand-300" />
      <path d="M20 125 C20 112 28 104 38 104 C48 104 56 112 56 125" className="fill-brand-300" />

      {/* Person 2 - right */}
      <circle cx="282" cy="88" r="22" className="fill-accent-500" fillOpacity="0.25" />
      <circle cx="282" cy="82" r="9" className="fill-accent-300" />
      <path d="M266 108 C266 97 273 90 282 90 C291 90 298 97 298 108" className="fill-accent-300" />

      {/* Connection lines */}
      <path d="M62 100 L82 82" stroke="white" strokeOpacity="0.25" strokeWidth="2" strokeDasharray="4 3" />
      <path d="M258 88 L240 75" stroke="white" strokeOpacity="0.25" strokeWidth="2" strokeDasharray="4 3" />

      {/* Floating elements */}
      <circle cx="55" cy="50" r="5" className="fill-accent-400" fillOpacity="0.5" />
      <circle cx="275" cy="140" r="4" className="fill-brand-400" fillOpacity="0.5" />
      <circle cx="30" cy="155" r="3" fill="white" fillOpacity="0.3" />
      <circle cx="290" cy="55" r="3" fill="white" fillOpacity="0.25" />

      {/* Small checkmarks */}
      <circle cx="60" cy="165" r="8" className="fill-success" fillOpacity="0.2" />
      <path
        d="M56 165 L59 168 L65 162"
        stroke="white"
        strokeOpacity="0.5"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Dashboard Analytics Illustration
 * Shows a monitor with charts and statistics
 */
export function DashboardAnalyticsIllustration({ className }: IllustrationProps) {
  return (
    <svg
      className={cn('w-full h-full', className)}
      viewBox="0 0 320 220"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Monitor frame */}
      <rect x="55" y="25" width="210" height="135" rx="10" fill="white" fillOpacity="0.1" />
      <rect x="68" y="38" width="184" height="105" rx="6" fill="white" fillOpacity="0.05" />

      {/* Chart bars */}
      <rect x="90" y="115" width="28" height="22" rx="3" className="fill-brand-400" />
      <rect x="128" y="90" width="28" height="47" rx="3" className="fill-brand-500" />
      <rect x="166" y="65" width="28" height="72" rx="3" className="fill-accent-400" />
      <rect x="204" y="78" width="28" height="59" rx="3" className="fill-accent-500" />

      {/* Stats cards */}
      <rect x="85" y="48" width="58" height="28" rx="4" fill="white" fillOpacity="0.15" />
      <text x="114" y="66" textAnchor="middle" fill="white" fillOpacity="0.85" fontSize="12" fontWeight="bold">
        +24%
      </text>

      <rect x="177" y="48" width="58" height="28" rx="4" fill="white" fillOpacity="0.15" />
      <text x="206" y="66" textAnchor="middle" fill="white" fillOpacity="0.85" fontSize="12" fontWeight="bold">
        1,248
      </text>

      {/* Monitor stand */}
      <rect x="135" y="160" width="50" height="10" rx="3" fill="white" fillOpacity="0.1" />
      <rect x="110" y="170" width="100" height="8" rx="3" fill="white" fillOpacity="0.12" />

      {/* Success indicator - left */}
      <circle cx="38" cy="70" r="16" className="fill-success" fillOpacity="0.2" />
      <path
        d="M31 70 L36 75 L46 65"
        stroke="white"
        strokeOpacity="0.6"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Notification dot - right */}
      <circle cx="290" cy="105" r="14" className="fill-brand-400" fillOpacity="0.25" />
      <circle cx="290" cy="105" r="6" className="fill-brand-300" />

      {/* Floating elements */}
      <circle cx="35" cy="145" r="4" className="fill-accent-400" fillOpacity="0.45" />
      <circle cx="295" cy="55" r="5" fill="white" fillOpacity="0.25" />
      <circle cx="285" cy="165" r="3" fill="white" fillOpacity="0.3" />
      <circle cx="45" cy="180" r="3" className="fill-brand-300" fillOpacity="0.4" />

      {/* Trend line */}
      <path
        d="M95 130 Q130 125, 145 105 T200 85 T240 70"
        stroke="white"
        strokeOpacity="0.15"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
