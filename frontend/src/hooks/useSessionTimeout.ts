// ─────────────────────────────────────────────────────────────────────────────
// src/hooks/useSessionTimeout.ts
// Tracks user inactivity and auto-logs out after SESSION_TIMEOUT_MS
// Shows a warning modal at SESSION_WARNING_MS remaining
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@store/authStore';
import { markActivity, clearActivity } from '@/hooks/useAuthActions';
import { SESSION_TIMEOUT_MS, SESSION_WARNING_MS, ROUTES } from '@constants/index';

export interface UseSessionTimeoutReturn {
  showWarning: boolean;
  timeRemaining: number; // seconds until session expires
  extendSession: () => void; // reset the timer manually
}

const ACTIVITY_EVENTS = ['click', 'keypress', 'scroll', 'mousemove', 'touchstart'] as const;

/**
 * Monitors user inactivity.
 * - Resets timer on any user interaction.
 * - Shows a warning modal SESSION_WARNING_MS before timeout.
 * - Auto-logs out after SESSION_TIMEOUT_MS of inactivity.
 * - Only active when the user is authenticated.
 */
export function useSessionTimeout(): UseSessionTimeoutReturn {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const navigate = useNavigate();

  const [showWarning, setShowWarning] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(SESSION_TIMEOUT_MS / 1000);

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastActivityRef = useRef<number>(Date.now());

  const clearTimers = useCallback((): void => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (warningRef.current) clearTimeout(warningRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
  }, []);

  const handleSessionExpiry = useCallback((): void => {
    clearTimers();
    clearAuth();
    // Drop the stamp too, or the next boot would read a fresh-enough timestamp
    // and silently restore the session this timer just ended.
    clearActivity();
    navigate(
      `${ROUTES.SESSION_EXPIRED}?returnTo=${encodeURIComponent(window.location.pathname)}`,
      { replace: true }
    );
  }, [clearAuth, clearTimers, navigate]);

  const startCountdown = useCallback((): void => {
    setShowWarning(true);
    setTimeRemaining(Math.floor(SESSION_WARNING_MS / 1000));

    countdownRef.current = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          if (countdownRef.current) clearInterval(countdownRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const resetTimer = useCallback((): void => {
    lastActivityRef.current = Date.now();
    setShowWarning(false);
    setTimeRemaining(SESSION_TIMEOUT_MS / 1000);
    clearTimers();

    if (!isAuthenticated) return;

    // Mirror the in-memory timer to storage. This is the only record that
    // outlives the page, and it is what lets a reload distinguish "was active a
    // minute ago" from "has been idle for an hour". Already throttled to at most
    // one write per second by the caller below.
    markActivity();

    // Set warning timer (fires SESSION_WARNING_MS before timeout)
    warningRef.current = setTimeout(() => {
      startCountdown();
    }, SESSION_TIMEOUT_MS - SESSION_WARNING_MS);

    // Set logout timer
    timeoutRef.current = setTimeout(() => {
      handleSessionExpiry();
    }, SESSION_TIMEOUT_MS);
  }, [clearTimers, handleSessionExpiry, isAuthenticated, startCountdown]);

  // Extend session manually (from warning modal)
  const extendSession = useCallback((): void => {
    resetTimer();
  }, [resetTimer]);

  // Attach event listeners and start timer
  useEffect(() => {
    if (!isAuthenticated) {
      clearTimers();
      setShowWarning(false);
      return;
    }

    // Start initial timer
    resetTimer();

    // Attach activity listeners
    const handleActivity = (): void => {
      // Throttle — only reset if more than 1s has passed since last event
      if (Date.now() - lastActivityRef.current > 1000 && !showWarning) {
        resetTimer();
      }
    };

    ACTIVITY_EVENTS.forEach((event) => {
      window.addEventListener(event, handleActivity, { passive: true });
    });

    return () => {
      clearTimers();
      ACTIVITY_EVENTS.forEach((event) => {
        window.removeEventListener(event, handleActivity);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  return { showWarning, timeRemaining, extendSession };
}
