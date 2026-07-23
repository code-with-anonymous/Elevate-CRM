// ─────────────────────────────────────────────────────────────────────────────
// cn utility — merges clsx + tailwind-merge
// Usage: cn('base-class', condition && 'conditional-class', 'override-class')
// ─────────────────────────────────────────────────────────────────────────────
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
