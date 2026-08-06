// ─────────────────────────────────────────────────────────────────────────────
// src/lib/motion.ts
// The app's entire motion vocabulary. Import from here — never hand-roll a
// duration or easing in a component, or the app stops feeling like one product.
//
// Rules: precise, never playful. No springs, no overshoot, no bounce.
//   · page enter   — fade + 8px rise, 200ms
//   · list items   — same, staggered 30ms apart
//   · hover/press  — 150ms
// ─────────────────────────────────────────────────────────────────────────────
import type { Transition, Variants } from 'framer-motion';

/** cubic-bezier(0.16, 1, 0.3, 1) — decisive out-ease, matches --ease-out. */
export const EASE_OUT = [0.16, 1, 0.3, 1] as const;
export const EASE_DEFAULT = [0.4, 0, 0.2, 1] as const;

export const DURATION = {
  fast: 0.15,
  normal: 0.2,
  slow: 0.3,
} as const;

export const transition: Transition = {
  duration: DURATION.normal,
  ease: EASE_OUT,
};

export const fastTransition: Transition = {
  duration: DURATION.fast,
  ease: EASE_OUT,
};

/** Whole-page enter. Wrap the page root in a motion.div with these. */
export const pageVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition },
};

/**
 * Parent of a staggered group (card grid, table body, kanban column).
 * Children must use `staggerItem`.
 */
export const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.03, delayChildren: 0.04 },
  },
};

/** Child of `staggerContainer`. */
export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition },
};

/** Popovers, dropdowns, menus — settle downward from their trigger. */
export const popoverVariants: Variants = {
  hidden: { opacity: 0, y: -4, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1, transition: fastTransition },
  exit: { opacity: 0, y: -4, scale: 0.98, transition: { duration: 0.1 } },
};

/** Right-hand drawers. */
export const drawerVariants: Variants = {
  hidden: { x: '100%' },
  visible: { x: 0, transition: { duration: DURATION.slow, ease: EASE_OUT } },
  exit: { x: '100%', transition: { duration: DURATION.normal, ease: EASE_DEFAULT } },
};

export const overlayVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: fastTransition },
  exit: { opacity: 0, transition: fastTransition },
};
