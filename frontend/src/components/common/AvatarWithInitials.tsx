// ─────────────────────────────────────────────────────────────────────────────
// src/components/common/AvatarWithInitials.tsx
// Deterministic identity avatar. Colors come from the --avatar-* token ramp
// (see globals.css) so they retune themselves per theme instead of shipping
// eight hardcoded hexes that glow in dark mode.
// ─────────────────────────────────────────────────────────────────────────────
import { cn } from '@/lib/cn';

interface AvatarProps {
  firstName?: string;
  lastName?: string;
  avatarUrl?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  /** Hairline ring that separates the avatar from a colored surface. */
  ring?: boolean;
  className?: string;
}

const PALETTE_SIZE = 8;

/**
 * Stable hash → palette slot. Returns a CSS color usable in `style`.
 * Same signature and determinism as before; only the color space changed.
 */
export function getAvatarColor(firstName: string = '', lastName: string = ''): string {
  const str = `${firstName}${lastName}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return `hsl(var(--avatar-${(Math.abs(hash) % PALETTE_SIZE) + 1}))`;
}

const SIZES: Record<NonNullable<AvatarProps['size']>, string> = {
  xs: 'h-5 w-5 text-[9px]',
  sm: 'h-6 w-6 text-[10px]',
  md: 'h-8 w-8 text-[11px]',
  lg: 'h-10 w-10 text-sm',
  xl: 'h-14 w-14 text-lg',
};

export default function AvatarWithInitials({
  firstName = '',
  lastName = '',
  avatarUrl,
  size = 'md',
  ring = false,
  className = '',
}: AvatarProps) {
  const initials =
    `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase() || 'U';
  const fullName = `${firstName} ${lastName}`.trim() || 'User';

  const base = cn(
    'shrink-0 rounded-full',
    SIZES[size],
    ring && 'ring-2 ring-background',
    className
  );

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={fullName}
        loading="lazy"
        className={cn(base, 'object-cover')}
      />
    );
  }

  return (
    <div
      role="img"
      aria-label={fullName}
      title={fullName}
      className={cn(
        base,
        'flex items-center justify-center font-semibold tracking-tight text-white',
        'select-none'
      )}
      style={{ backgroundColor: getAvatarColor(firstName, lastName) }}
    >
      {initials}
    </div>
  );
}
