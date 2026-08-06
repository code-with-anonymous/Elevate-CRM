/** @type {import('tailwindcss').Config} */

// Colors resolve to bare HSL channels declared in src/styles/globals.css, so
// every token composes with Tailwind's alpha syntax — `border-border/60`,
// `bg-primary/10`, `text-status-positive/70`.
const hsl = (name) => `hsl(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: hsl('background'),
        foreground: hsl('foreground'),
        card: {
          DEFAULT: hsl('card'),
          foreground: hsl('card-foreground'),
        },
        popover: {
          DEFAULT: hsl('popover'),
          foreground: hsl('popover-foreground'),
        },
        surface: {
          DEFAULT: hsl('surface'),
          foreground: hsl('surface-foreground'),
        },
        primary: {
          DEFAULT: hsl('primary'),
          foreground: hsl('primary-foreground'),
          subtle: hsl('primary-subtle'),
        },
        secondary: {
          DEFAULT: hsl('secondary'),
          foreground: hsl('secondary-foreground'),
        },
        muted: {
          DEFAULT: hsl('muted'),
          foreground: hsl('muted-foreground'),
        },
        accent: {
          DEFAULT: hsl('accent'),
          foreground: hsl('accent-foreground'),
        },
        destructive: {
          DEFAULT: hsl('destructive'),
          foreground: hsl('destructive-foreground'),
        },
        border: hsl('border'),
        input: hsl('input'),
        ring: hsl('ring'),
        overlay: hsl('overlay'),
        success: {
          DEFAULT: hsl('success'),
          foreground: hsl('success-foreground'),
        },
        warning: {
          DEFAULT: hsl('warning'),
          foreground: hsl('warning-foreground'),
        },
        info: {
          DEFAULT: hsl('info'),
          foreground: hsl('info-foreground'),
        },
        // Desaturated status ramp — dots, pills, chart series
        status: {
          neutral: hsl('status-neutral'),
          info: hsl('status-info'),
          warn: hsl('status-warn'),
          progress: hsl('status-progress'),
          positive: hsl('status-positive'),
          negative: hsl('status-negative'),
          accent: hsl('status-accent'),
        },
        sidebar: {
          DEFAULT: hsl('sidebar'),
          foreground: hsl('sidebar-foreground'),
          muted: hsl('sidebar-muted'),
          border: hsl('sidebar-border'),
          accent: hsl('sidebar-accent'),
          'accent-foreground': hsl('sidebar-accent-foreground'),
          primary: hsl('sidebar-primary'),
          'primary-foreground': hsl('sidebar-primary-foreground'),
          popover: hsl('sidebar-popover'),
        },
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        '2xl': 'var(--radius-2xl)',
        full: 'var(--radius-full)',
      },
      boxShadow: {
        xs: 'var(--shadow-xs)',
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        card: 'var(--shadow-card)',
        pop: 'var(--shadow-pop)',
      },
      fontFamily: {
        sans: ['Inter', 'Inter Variable', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['ui-monospace', 'SF Mono', 'Cascadia Mono', 'Consolas', 'monospace'],
      },
      letterSpacing: {
        tighter: '-0.03em',
        tight: '-0.02em',
      },
      transitionTimingFunction: {
        out: 'var(--ease-out)',
        default: 'var(--ease-default)',
      },
      transitionDuration: {
        fast: '150ms',
        normal: '200ms',
      },
      keyframes: {
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
      },
      animation: {
        'fade-up': 'fade-up 200ms var(--ease-out) both',
        'fade-in': 'fade-in 150ms var(--ease-out) both',
      },
    },
  },
  plugins: [],
};
