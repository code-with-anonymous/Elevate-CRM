// ─────────────────────────────────────────────────────────────────────────────
// src/components/common/Logo.tsx
// The brand mark, in the two shapes the app needs.
//
// A note on the artwork, because it constrains how these are used:
//
// The supplied asset (src/assets/Logo.jpg) is a JPEG whose "transparent"
// background was a painted checkerboard — JPEG has no alpha channel, so the
// checker was real pixels. logo-mark.png and logo-wordmark.png are derived from
// it with that background keyed out and the edges un-composited.
//
// The artwork itself is dark navy with a teal arrow. That reads beautifully on
// white and vanishes on anything dark — and this app has two dark surfaces that
// are not optional: the sidebar rail (dark in BOTH themes, by design) and every
// card in dark theme. So <LogoMark> sits on a white plate rather than floating
// bare. That keeps the brand colours exactly as supplied instead of
// algorithmically recolouring someone's logo, and it reads on any surface.
//
// If a proper reverse/knockout version (or an SVG) turns up, drop it in as
// logo-mark-light.png and swap it in under `dark:`.
// ─────────────────────────────────────────────────────────────────────────────
import { cn } from '@lib/cn';
import { APP_NAME } from '@constants/index';
import markUrl from '@/assets/logo-mark.png';
import wordmarkUrl from '@/assets/logo-wordmark.png';

export interface LogoMarkProps {
  /** Outer plate size in px. The glyph is inset within it. */
  size?: number;
  className?: string;
}

/**
 * Square brand tile — the infinity glyph on a white plate.
 * Safe on any background, light or dark.
 */
export function LogoMark({ size = 36, className }: LogoMarkProps): React.JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[10px]',
        // White plate + hairline ring. The ring is what keeps the tile legible
        // on a white card, where the plate alone would be invisible.
        'bg-white shadow-sm ring-1 ring-black/[0.07]',
        className
      )}
      style={{ width: size, height: size }}
    >
      <img
        src={markUrl}
        alt=""
        aria-hidden="true"
        width={size}
        height={size}
        style={{ width: Math.round(size * 0.78), height: Math.round(size * 0.78) }}
        className="object-contain"
      />
    </span>
  );
}

LogoMark.displayName = 'LogoMark';

export interface LogoWordmarkProps {
  /** Rendered height in px; width follows the artwork's aspect ratio. */
  height?: number;
  className?: string;
}

/**
 * The full "Elevate | CRM" lockup.
 *
 * LIGHT SURFACES ONLY — the type is dark navy. On a dark card use
 * <LogoMark> plus a text label instead, the way AuthLayout does.
 */
export function LogoWordmark({
  height = 28,
  className,
}: LogoWordmarkProps): React.JSX.Element {
  return (
    <img
      src={wordmarkUrl}
      alt={APP_NAME}
      style={{ height }}
      className={cn('w-auto object-contain', className)}
    />
  );
}

LogoWordmark.displayName = 'LogoWordmark';

export default LogoMark;
