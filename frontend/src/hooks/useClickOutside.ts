// ─────────────────────────────────────────────────────────────────────────────
// src/hooks/useClickOutside.ts
// Dismiss-on-outside-click / Escape for popovers, menus and dropdowns.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef } from 'react';

export function useClickOutside<T extends HTMLElement = HTMLDivElement>(
  onDismiss: () => void,
  enabled: boolean = true
) {
  const ref = useRef<T>(null);
  const handler = useRef(onDismiss);
  handler.current = onDismiss;

  useEffect(() => {
    if (!enabled) return;

    function onPointerDown(e: MouseEvent | TouchEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        handler.current();
      }
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') handler.current();
    }

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [enabled]);

  return ref;
}
