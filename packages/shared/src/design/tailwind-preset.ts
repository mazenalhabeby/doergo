/**
 * HBCFIELD Tailwind CSS Preset
 *
 * Import this preset in your tailwind.config.ts to use the HBCField design system.
 *
 * Usage:
 * ```ts
 * import hbcfieldPreset from '@hbcfield/shared/design/tailwind-preset';
 *
 * export default {
 *   presets: [hbcfieldPreset],
 *   // ... your config
 * }
 * ```
 */

import type { Config } from 'tailwindcss';

const hbcfieldPreset: Partial<Config> = {
  theme: {
    extend: {
      // Colors
      colors: {
        // Brand
        brand: {
          DEFAULT: '#059669',
          50: '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
          800: '#065f46',
          900: '#064e3b',
        },
        accent: {
          DEFAULT: '#F97316',
          50: '#FFF7ED',
          100: '#FFEDD5',
          200: '#FED7AA',
          300: '#FDBA74',
          400: '#FB923C',
          500: '#F97316',
          600: '#EA580C',
          700: '#C2410C',
          800: '#9A3412',
          900: '#7C2D12',
        },
        // Status
        success: {
          DEFAULT: '#22C55E',
          light: '#DCFCE7',
          border: '#86EFAC',
        },
        warning: {
          DEFAULT: '#EAB308',
          light: '#FEF9C3',
          border: '#FDE047',
        },
        error: {
          DEFAULT: '#EF4444',
          light: '#FEE2E2',
          border: '#FCA5A5',
        },
        info: {
          DEFAULT: '#3B82F6',
          light: '#DBEAFE',
          border: '#93C5FD',
        },
        // Sidebar colors are defined via CSS variables in globals.css
        // (--sidebar-background, --sidebar-foreground, etc.)
        // Do NOT hardcode them here — they need to change with dark/light theme
      },

      // Font Family
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Menlo', 'Monaco', 'monospace'],
      },

      // Font Size
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }], // 10px
      },

      // Border Radius
      borderRadius: {
        '4xl': '2rem',
      },

      // Box Shadow
      boxShadow: {
        'card': '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
        'card-hover': '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
        'dropdown': '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
        'modal': '0 25px 50px -12px rgb(0 0 0 / 0.25)',
      },

      // Spacing
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
        '128': '32rem',
      },

      // Width
      width: {
        'sidebar': '256px',
        'sidebar-collapsed': '80px',
      },

      // Height
      height: {
        'header': '64px',
        'header-mobile': '56px',
      },

      // Max Width
      maxWidth: {
        'modal-sm': '400px',
        'modal-md': '500px',
        'modal-lg': '640px',
        'modal-xl': '768px',
      },

      // Z-Index
      zIndex: {
        'dropdown': '10',
        'sticky': '20',
        'fixed': '30',
        'modal-backdrop': '40',
        'modal': '50',
        'popover': '60',
        'tooltip': '70',
        'toast': '80',
      },

      // Animation
      animation: {
        'fade-in': 'fadeIn 200ms ease-in-out',
        'fade-out': 'fadeOut 200ms ease-in-out',
        'slide-in': 'slideIn 200ms ease-in-out',
        'slide-out': 'slideOut 200ms ease-in-out',
        'slide-in-left': 'slideInLeft 500ms ease-in-out',
        'slide-in-right': 'slideInRight 500ms ease-in-out',
        'slide-out-left': 'slideOutLeft 500ms ease-in-out',
        'slide-out-right': 'slideOutRight 500ms ease-in-out',
        'scale-in': 'scaleIn 200ms ease-in-out',
        'spin-slow': 'spin 2s linear infinite',
        // Dynamic animations
        'float': 'float 6s ease-in-out infinite',
        'float-delayed': 'float 8s ease-in-out infinite',
        'pulse-slow': 'pulseSlow 3s ease-in-out infinite',
        'ping-slow': 'pingSlow 2s cubic-bezier(0, 0, 0.2, 1) infinite',
        'orb-1': 'orb1 20s ease-in-out infinite',
        'orb-2': 'orb2 25s ease-in-out infinite',
        'orb-3': 'orb3 30s ease-in-out infinite',
        'grid-flow': 'gridFlow 20s linear infinite',
        'fade-in-up': 'fadeInUp 600ms ease-out forwards',
        'shake': 'shake 500ms ease-in-out',
        'bounce-once': 'bounceOnce 400ms ease-out',
        'shimmer': 'shimmer 2s linear infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
      },

      // Keyframes
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeOut: {
          '0%': { opacity: '1' },
          '100%': { opacity: '0' },
        },
        slideIn: {
          '0%': { transform: 'translateY(-10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideOut: {
          '0%': { transform: 'translateY(0)', opacity: '1' },
          '100%': { transform: 'translateY(-10px)', opacity: '0' },
        },
        slideInLeft: {
          '0%': { transform: 'translateX(-100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        slideInRight: {
          '0%': { transform: 'translateX(100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        slideOutLeft: {
          '0%': { transform: 'translateX(0)', opacity: '1' },
          '100%': { transform: 'translateX(-100%)', opacity: '0' },
        },
        slideOutRight: {
          '0%': { transform: 'translateX(0)', opacity: '1' },
          '100%': { transform: 'translateX(100%)', opacity: '0' },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        // Dynamic keyframes
        float: {
          '0%, 100%': { transform: 'translateY(0) translateX(0)' },
          '25%': { transform: 'translateY(-20px) translateX(10px)' },
          '50%': { transform: 'translateY(-10px) translateX(-10px)' },
          '75%': { transform: 'translateY(-30px) translateX(5px)' },
        },
        pulseSlow: {
          '0%, 100%': { opacity: '0.4', transform: 'scale(1)' },
          '50%': { opacity: '0.8', transform: 'scale(1.05)' },
        },
        pingSlow: {
          '0%': { transform: 'scale(1)', opacity: '1' },
          '75%, 100%': { transform: 'scale(2)', opacity: '0' },
        },
        orb1: {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '25%': { transform: 'translate(50px, -50px) scale(1.1)' },
          '50%': { transform: 'translate(100px, 0) scale(0.9)' },
          '75%': { transform: 'translate(50px, 50px) scale(1.05)' },
        },
        orb2: {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '25%': { transform: 'translate(-60px, 40px) scale(0.95)' },
          '50%': { transform: 'translate(-30px, 80px) scale(1.1)' },
          '75%': { transform: 'translate(30px, 40px) scale(1)' },
        },
        orb3: {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '33%': { transform: 'translate(-40px, -60px) scale(1.15)' },
          '66%': { transform: 'translate(60px, -30px) scale(0.9)' },
        },
        gridFlow: {
          '0%': { transform: 'translateX(0) translateY(0)' },
          '100%': { transform: 'translateX(50px) translateY(50px)' },
        },
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '10%, 30%, 50%, 70%, 90%': { transform: 'translateX(-4px)' },
          '20%, 40%, 60%, 80%': { transform: 'translateX(4px)' },
        },
        bounceOnce: {
          '0%': { transform: 'scale(0)', opacity: '0' },
          '50%': { transform: 'scale(1.2)' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        glow: {
          '0%': { boxShadow: '0 0 5px rgba(5, 150, 105, 0.5), 0 0 20px rgba(5, 150, 105, 0.3)' },
          '100%': { boxShadow: '0 0 20px rgba(5, 150, 105, 0.8), 0 0 40px rgba(5, 150, 105, 0.5)' },
        },
      },
    },
  },
};

export default hbcfieldPreset;

// Backward compatibility alias
export { hbcfieldPreset as doergoPreset };
