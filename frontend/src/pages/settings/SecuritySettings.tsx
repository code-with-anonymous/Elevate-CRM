// ─────────────────────────────────────────────────────────────────────────────
// pages/settings/SecuritySettings.tsx  (/settings/security)
//
// Almost entirely reuse. Every endpoint here shipped in the auth phase:
//   authService.enable2FA / verify2FA / disable2FA
//   authService.getSessions / revokeSession
//   authService.getLoginHistory
//
// Nothing new was added to the API for this tab — it's a surface over work that
// already existed but had no UI.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  CheckCircle2,
  Clock,
  Laptop,
  MapPin,
  Monitor,
  ShieldCheck,
  ShieldOff,
  Smartphone,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, controlClass } from '@/components/ui/field';
import SettingsSection from '@/pages/settings/SettingsSection';
import authService from '@/services/api/authService';
import { useAuthStore } from '@/store/authStore';
import { formatRelative } from '@/lib/dayjs';
import { DURATION, EASE_OUT } from '@/lib/motion';
import { cn } from '@/lib/cn';

const SECURITY_QK = {
  sessions: ['auth', 'sessions'] as const,
  loginHistory: ['auth', 'login-history'] as const,
};

function errorMessage(err: unknown, fallback: string): string {
  const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
  return message || fallback;
}

/** Rough device glyph from the UA string the server already parsed. */
function DeviceIcon({ device }: { device: string }) {
  const d = (device || '').toLowerCase();
  if (d.includes('mobile') || d.includes('phone') || d.includes('android') || d.includes('ios')) {
    return <Smartphone size={15} />;
  }
  if (d.includes('tablet')) return <Laptop size={15} />;
  return <Monitor size={15} />;
}

export default function SecuritySettings() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);

  // ── 2FA ─────────────────────────────────────────────────────────────────────
  const twoFAEnabled = Boolean(
    (user as unknown as { isTwoFAEnabled?: boolean; twoFactorEnabled?: boolean })
      ?.isTwoFAEnabled ??
      (user as unknown as { twoFactorEnabled?: boolean })?.twoFactorEnabled
  );

  // Setup is a two-step handshake: enable() returns a secret + QR, and the
  // secret isn't active until verify() confirms the user can actually read a
  // code from it. Skipping step two locks people out of their own account.
  const [setup, setSetup] = useState<{ qrCode?: string; secret?: string } | null>(null);
  const [code, setCode] = useState('');
  const [disarmCode, setDisarmCode] = useState('');

  const beginSetup = useMutation({
    mutationFn: () => authService.enable2FA(),
    onSuccess: (data) => setSetup(data as { qrCode?: string; secret?: string }),
    onError: (err) => toast.error(errorMessage(err, 'Could not start 2FA setup')),
  });

  const confirmSetup = useMutation({
    mutationFn: () => authService.verify2FA(code.trim()),
    onSuccess: () => {
      toast.success('Two-factor authentication is on');
      setSetup(null);
      setCode('');
      updateUser({ isTwoFAEnabled: true } as never);
    },
    onError: (err) => toast.error(errorMessage(err, 'That code didn’t match — try again')),
  });

  const disable2FA = useMutation({
    mutationFn: () => authService.disable2FA(disarmCode.trim()),
    onSuccess: () => {
      toast.success('Two-factor authentication is off');
      setDisarmCode('');
      updateUser({ isTwoFAEnabled: false } as never);
    },
    onError: (err) => toast.error(errorMessage(err, 'That code didn’t match')),
  });

  // ── Sessions ────────────────────────────────────────────────────────────────
  const sessions = useQuery({
    queryKey: SECURITY_QK.sessions,
    queryFn: () => authService.getSessions(),
    staleTime: 1000 * 30,
  });

  const revoke = useMutation({
    mutationFn: (id: string) => authService.revokeSession(id),
    onSuccess: () => {
      toast.success('Session revoked');
      qc.invalidateQueries({ queryKey: SECURITY_QK.sessions });
    },
    onError: (err) => toast.error(errorMessage(err, 'Failed to revoke session')),
  });

  // ── Login history ───────────────────────────────────────────────────────────
  const history = useQuery({
    queryKey: SECURITY_QK.loginHistory,
    queryFn: () => authService.getLoginHistory(),
    staleTime: 1000 * 60,
  });

  return (
    <div className="space-y-5">
      {/* ── 2FA ────────────────────────────────────────────────────────────── */}
      <SettingsSection
        title="Two-factor authentication"
        description="A code from your authenticator app, on top of your password."
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span
              className={cn(
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                twoFAEnabled
                  ? 'bg-status-positive/10 text-status-positive'
                  : 'bg-muted text-muted-foreground'
              )}
            >
              {twoFAEnabled ? <ShieldCheck size={17} /> : <ShieldOff size={17} />}
            </span>
            <div>
              <p className="text-[13px] font-medium text-foreground">
                {twoFAEnabled ? 'Enabled' : 'Not enabled'}
              </p>
              <p className="mt-0.5 text-[13px] text-muted-foreground">
                {twoFAEnabled
                  ? 'You’ll be asked for a code at every sign-in.'
                  : 'Recommended — a leaked password alone won’t be enough.'}
              </p>
            </div>
          </div>

          {!twoFAEnabled && !setup && (
            <Button onClick={() => beginSetup.mutate()} isLoading={beginSetup.isPending}>
              <ShieldCheck size={14} />
              Enable 2FA
            </Button>
          )}
        </div>

        {/* Step 2 of the handshake */}
        <AnimatePresence>
          {setup && !twoFAEnabled && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: DURATION.normal, ease: EASE_OUT }}
              className="overflow-hidden"
            >
              <div className="mt-5 flex flex-wrap items-start gap-5 rounded-lg border border-border/60 bg-muted/25 p-4">
                {setup.qrCode && (
                  <img
                    src={setup.qrCode}
                    alt="Two-factor QR code"
                    className="h-36 w-36 shrink-0 rounded-lg border border-border/60 bg-white p-1.5"
                  />
                )}
                <div className="min-w-[220px] flex-1 space-y-3">
                  <p className="text-[13px] text-muted-foreground">
                    Scan this with Google Authenticator, 1Password, or Authy — then enter the
                    6-digit code it shows.
                  </p>
                  {setup.secret && (
                    <p className="break-all font-mono text-[11px] text-muted-foreground">
                      Can’t scan? Enter this key manually:{' '}
                      <span className="text-foreground">{setup.secret}</span>
                    </p>
                  )}
                  <Field label="Verification code" htmlFor="twoFACode" required>
                    <input
                      id="twoFACode"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                      placeholder="123456"
                      className={cn(controlClass, 'max-w-[140px] font-mono tracking-[0.2em]')}
                    />
                  </Field>
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={() => confirmSetup.mutate()}
                      isLoading={confirmSetup.isPending}
                      disabled={code.length !== 6}
                    >
                      Confirm and enable
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setSetup(null);
                        setCode('');
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    2FA isn’t active until you confirm — so a mis-scanned code can’t lock you out.
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Disabling also requires a code — otherwise anyone with a hijacked
            session could switch off the very thing protecting the account. */}
        {twoFAEnabled && (
          <div className="mt-5 flex flex-wrap items-end gap-3 rounded-lg border border-border/60 bg-muted/25 p-4">
            <Field
              label="Current code"
              htmlFor="disarmCode"
              hint="Required to turn 2FA off."
              className="min-w-[160px]"
            >
              <input
                id="disarmCode"
                inputMode="numeric"
                maxLength={6}
                value={disarmCode}
                onChange={(e) => setDisarmCode(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                className={cn(controlClass, 'max-w-[140px] font-mono tracking-[0.2em]')}
              />
            </Field>
            <Button
              variant="destructive"
              onClick={() => disable2FA.mutate()}
              isLoading={disable2FA.isPending}
              disabled={disarmCode.length !== 6}
            >
              <ShieldOff size={14} />
              Disable 2FA
            </Button>
          </div>
        )}
      </SettingsSection>

      {/* ── Active sessions ────────────────────────────────────────────────── */}
      <SettingsSection
        title={`Active sessions${sessions.data ? ` · ${sessions.data.length}` : ''}`}
        description="Every device with a valid refresh token. Revoking one signs it out immediately."
        className="[&>div]:px-0 [&>div]:py-0"
      >
        {sessions.isLoading ? (
          <div className="divide-y divide-border/50">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-5 py-4">
                <div className="h-9 w-9 animate-pulse rounded-lg bg-muted" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-40 animate-pulse rounded bg-muted" />
                  <div className="h-2.5 w-56 animate-pulse rounded bg-muted/60" />
                </div>
              </div>
            ))}
          </div>
        ) : sessions.isError ? (
          <div className="flex flex-col items-start gap-3 px-5 py-6">
            <p className="text-[13px] text-muted-foreground">Couldn’t load your sessions.</p>
            <Button variant="outline" size="sm" onClick={() => sessions.refetch()}>
              Retry
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {(sessions.data ?? []).map((session) => (
              <div
                key={session.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <DeviceIcon device={session.device} />
                </span>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-foreground">
                    {session.browser} on {session.os}
                    {session.isCurrent && (
                      <span className="ml-2 rounded-full bg-status-positive/10 px-1.5 py-0.5 text-[10px] font-medium text-status-positive ring-1 ring-inset ring-status-positive/20">
                        This device
                      </span>
                    )}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {session.location && (
                      <>
                        <MapPin size={10} className="mr-1 inline" />
                        {session.location} ·{' '}
                      </>
                    )}
                    {session.ip} · active {formatRelative(session.lastActive)}
                  </p>
                </div>

                {/* The current session is deliberately not revocable here. It
                    would work, but "sign myself out from a settings page" is
                    what the Logout button is for, and users read a revoked
                    current session as a bug. */}
                {!session.isCurrent && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => revoke.mutate(session.id)}
                    disabled={revoke.isPending}
                  >
                    Revoke
                  </Button>
                )}
              </div>
            ))}

            {(sessions.data ?? []).length === 0 && (
              <p className="px-5 py-8 text-center text-[13px] text-muted-foreground">
                No other active sessions.
              </p>
            )}
          </div>
        )}
      </SettingsSection>

      {/* ── Login history ──────────────────────────────────────────────────── */}
      <SettingsSection
        title="Recent sign-in activity"
        description="Failed attempts are listed too — an unfamiliar one is worth a password change."
        className="[&>div]:px-0 [&>div]:py-0"
      >
        {history.isLoading ? (
          <div className="space-y-2 px-5 py-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-8 animate-pulse rounded bg-muted/60" />
            ))}
          </div>
        ) : (history.data ?? []).length === 0 ? (
          <p className="px-5 py-8 text-center text-[13px] text-muted-foreground">
            No sign-in history recorded yet.
          </p>
        ) : (
          <div className="divide-y divide-border/50">
            {(history.data ?? []).map((entry) => (
              <div key={entry.id} className="flex items-center gap-3 px-5 py-2.5">
                {entry.wasSuccessful ? (
                  <CheckCircle2 size={14} className="shrink-0 text-status-positive" />
                ) : (
                  <XCircle size={14} className="shrink-0 text-status-negative" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] text-foreground">
                    {entry.browser} on {entry.os}
                    {!entry.wasSuccessful && (
                      <span className="ml-2 text-[11px] font-medium text-status-negative">
                        Failed
                      </span>
                    )}
                  </p>
                </div>
                <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                  {entry.location ? `${entry.location} · ` : ''}
                  {entry.ip}
                </span>
                <span className="hidden w-[110px] shrink-0 text-right text-[11px] tabular-nums text-muted-foreground sm:block">
                  <Clock size={10} className="mr-1 inline" />
                  {formatRelative(entry.createdAt)}
                </span>
              </div>
            ))}
          </div>
        )}
      </SettingsSection>
    </div>
  );
}
