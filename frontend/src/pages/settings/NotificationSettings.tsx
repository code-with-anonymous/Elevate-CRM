// ─────────────────────────────────────────────────────────────────────────────
// pages/settings/NotificationSettings.tsx  (/settings/notifications)
//
// HONEST CAVEAT, stated in the UI as well as here: these preferences are stored
// on the User document, but nothing consumes them yet. There is no notification
// emitter — the bell in TopNavbar reads three hardcoded rows out of
// notificationStore.ts. Toggling anything here changes what a future emitter
// will be told to do, not what happens today.
//
// Preferences before emitters is the right order (the emitter needs something to
// consult), but shipping this without saying so would be a lie in UI form.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import SettingsSection from '@/pages/settings/SettingsSection';
import {
  useNotificationPreferences,
  useUpdateNotificationPreferences,
} from '@/hooks/useProfile';
import type { NotificationEvent, NotificationPreferences } from '@/services/api/userService';
import { cn } from '@/lib/cn';

// Order and copy live here; the server owns the canonical key list and rejects
// anything not on it, so a typo fails loudly instead of silently not saving.
const EVENT_COPY: Record<NotificationEvent, { label: string; description: string }> = {
  leadAssigned: {
    label: 'A lead is assigned to me',
    description: 'Someone routes a new lead to your name.',
  },
  taskDueSoon: {
    label: 'A task of mine is due soon',
    description: 'Sent the morning a task falls due.',
  },
  dealWon: {
    label: 'A teammate wins a deal',
    description: 'Pipeline moves to Won anywhere in the organisation.',
  },
  teamChanges: {
    label: 'Team changes',
    description: 'Someone joins, leaves, or has their role changed.',
  },
  weeklySummary: {
    label: 'Weekly summary',
    description: 'Monday digest of pipeline, activity, and overdue work.',
  },
};

const EVENT_ORDER: NotificationEvent[] = [
  'leadAssigned',
  'taskDueSoon',
  'dealWon',
  'teamChanges',
  'weeklySummary',
];

// ── Toggle ────────────────────────────────────────────────────────────────────
// A real <button role="switch"> rather than a styled checkbox, so the control
// announces itself correctly and the sliding knob is a plain CSS transform.

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-5 w-9 shrink-0 rounded-full transition-colors duration-150 ease-out',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        checked ? 'bg-primary' : 'bg-muted-foreground/30'
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-xs transition-transform duration-150 ease-out',
          checked ? 'translate-x-[18px]' : 'translate-x-0.5'
        )}
      />
    </button>
  );
}

export default function NotificationSettings() {
  const { data, isLoading, isError, refetch } = useNotificationPreferences();
  const update = useUpdateNotificationPreferences();

  // Local draft so toggling feels instant and one Save writes the whole diff —
  // a PATCH per flick would fire five requests to set up a row of switches.
  const [draft, setDraft] = useState<NotificationPreferences | null>(null);

  useEffect(() => {
    if (data?.preferences) setDraft(data.preferences);
  }, [data]);

  const dirty =
    draft !== null &&
    data?.preferences !== undefined &&
    JSON.stringify(draft) !== JSON.stringify(data.preferences);

  const toggle = (event: NotificationEvent, channel: 'inApp' | 'email', next: boolean) => {
    setDraft((prev) =>
      prev ? { ...prev, [event]: { ...prev[event], [channel]: next } } : prev
    );
  };

  if (isError) {
    return (
      <SettingsSection title="Notifications">
        <div className="flex flex-col items-start gap-3">
          <p className="text-[13px] text-muted-foreground">Couldn’t load your preferences.</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      </SettingsSection>
    );
  }

  return (
    <div className="space-y-5">
      {/* The disclosure. Placed above the controls, not buried under them. */}
      <div className="flex items-start gap-2.5 rounded-lg border border-status-info/30 bg-status-info/[0.06] px-3.5 py-2.5">
        <Info size={15} className="mt-0.5 shrink-0 text-status-info" />
        <p className="text-[13px] text-foreground">
          These preferences are saved, but nothing sends notifications yet — the delivery
          system isn’t built. Set them now and they’ll apply the moment it is.
        </p>
      </div>

      <SettingsSection
        title="What you hear about"
        description="In-app shows in the bell menu. Email goes to your account address."
        footerHint={dirty ? 'Unsaved changes' : undefined}
        footer={
          <Button
            onClick={() => draft && update.mutate(draft)}
            isLoading={update.isPending}
            disabled={!dirty}
          >
            Save preferences
          </Button>
        }
        className="[&>div]:px-0 [&>div]:py-0"
      >
        {/* Channel headers — right-aligned over their columns */}
        <div className="flex items-center gap-4 border-b border-border/60 bg-muted/25 px-5 py-2">
          <span className="flex-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Event
          </span>
          <span className="w-12 text-center text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            In-app
          </span>
          <span className="w-12 text-center text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Email
          </span>
        </div>

        {isLoading || !draft ? (
          <div className="divide-y divide-border/50">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-3.5">
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-44 animate-pulse rounded bg-muted" />
                  <div className="h-2.5 w-64 animate-pulse rounded bg-muted/60" />
                </div>
                <div className="h-5 w-9 animate-pulse rounded-full bg-muted" />
                <div className="h-5 w-9 animate-pulse rounded-full bg-muted" />
              </div>
            ))}
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {EVENT_ORDER.map((event) => {
              const copy = EVENT_COPY[event];
              const value = draft[event];
              return (
                <div key={event} className="flex items-center gap-4 px-5 py-3.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-foreground">{copy.label}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {copy.description}
                    </p>
                  </div>
                  <div className="flex w-12 justify-center">
                    <Toggle
                      checked={value.inApp}
                      onChange={(next) => toggle(event, 'inApp', next)}
                      label={`${copy.label} — in-app`}
                    />
                  </div>
                  <div className="flex w-12 justify-center">
                    <Toggle
                      checked={value.email}
                      onChange={(next) => toggle(event, 'email', next)}
                      label={`${copy.label} — email`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SettingsSection>
    </div>
  );
}
