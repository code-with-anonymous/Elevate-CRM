// ─────────────────────────────────────────────────────────────────────────────
// pages/settings/OrganizationSettings.tsx  (/settings/organization)
//
// Org identity + display defaults. Writes are owner/admin server-side, so the
// layout hides this tab for lower roles — but the inputs still disable off the
// same role check, because a hidden nav item is not a permission model.
//
// Billing is out of scope: the plan card is a read-only display of
// Organization.plan with no Stripe wiring behind it, and says so.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Building2, Loader2, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, controlClass, selectClass } from '@/components/ui/field';
import SettingsSection from '@/pages/settings/SettingsSection';
import { useOrganization, useUpdateOrganization } from '@/hooks/useOrganization';
import type { DateFormat } from '@/services/api/organizationService';
import { useAuthStore } from '@/store/authStore';
import { dataUrlBytes, resizeImageToDataUrl } from '@/lib/imageResize';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/cn';

const LOGO_MAX_BYTES = 200 * 1024;

const DATE_FORMATS: DateFormat[] = ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'];

const PLAN_LABEL: Record<string, string> = {
  free: 'Free',
  starter: 'Starter',
  pro: 'Pro',
  enterprise: 'Enterprise',
};

/**
 * Timezone list straight from the runtime where available. Intl.supportedValuesOf
 * is the browser's own tz database, so it can't drift out of date the way a
 * hardcoded list does — with a small fallback for older engines.
 */
function useTimezones(): string[] {
  return useMemo(() => {
    const intl = Intl as typeof Intl & { supportedValuesOf?: (k: string) => string[] };
    if (typeof intl.supportedValuesOf === 'function') {
      try {
        return intl.supportedValuesOf('timeZone');
      } catch {
        /* fall through */
      }
    }
    return [
      'UTC',
      'Europe/London',
      'Europe/Berlin',
      'Asia/Karachi',
      'Asia/Dubai',
      'Asia/Kolkata',
      'Asia/Singapore',
      'America/New_York',
      'America/Chicago',
      'America/Los_Angeles',
      'Australia/Sydney',
    ];
  }, []);
}

export default function OrganizationSettings() {
  const { data: org, isLoading, isError, refetch } = useOrganization();
  const update = useUpdateOrganization();
  const timezones = useTimezones();

  const role = String(useAuthStore((s) => s.user?.role) ?? '').toLowerCase();
  const canEdit = role === 'owner' || role === 'admin';

  const [form, setForm] = useState<{
    name: string;
    timezone: string;
    dateFormat: DateFormat;
  }>({ name: '', timezone: 'UTC', dateFormat: 'DD/MM/YYYY' });

  useEffect(() => {
    if (!org) return;
    setForm({ name: org.name, timezone: org.timezone, dateFormat: org.dateFormat });
  }, [org]);

  const dirty =
    org !== undefined &&
    (form.name !== org.name ||
      form.timezone !== org.timezone ||
      form.dateFormat !== org.dateFormat);

  // ── Logo ────────────────────────────────────────────────────────────────────
  const fileInput = useRef<HTMLInputElement>(null);
  const [resizing, setResizing] = useState(false);

  const handleLogo = async (file: File | undefined) => {
    if (!file) return;
    setResizing(true);
    try {
      // PNG, not JPEG: logos usually carry transparency, and flattening one onto
      // white leaves a visible box on any non-white surface — including the dark
      // sidebar this is destined for.
      const dataUrl = await resizeImageToDataUrl(file, { size: 256, mimeType: 'image/png' });
      if (dataUrlBytes(dataUrl) > LOGO_MAX_BYTES) {
        toast.error('That logo is too large even after resizing. Try a simpler image.');
        return;
      }
      update.mutate({ logoUrl: dataUrl });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not read that image.');
    } finally {
      setResizing(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  if (isError) {
    return (
      <SettingsSection title="Organization">
        <div className="flex flex-col items-start gap-3">
          <p className="text-[13px] text-muted-foreground">
            Couldn’t load your organisation.
          </p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      </SettingsSection>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── Logo ───────────────────────────────────────────────────────────── */}
      <SettingsSection
        title="Logo"
        description="Used wherever your organisation is represented. Transparent PNG recommended."
      >
        <div className="flex flex-wrap items-center gap-5">
          <div className="relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl border border-border/60 bg-muted/40">
            {org?.logoUrl ? (
              <img src={org.logoUrl} alt="" className="h-full w-full object-contain p-1.5" />
            ) : (
              <Building2 size={22} className="text-muted-foreground" />
            )}
            {(resizing || update.isPending) && (
              <span className="absolute inset-0 flex items-center justify-center bg-overlay/50">
                <Loader2 size={18} className="animate-spin text-white" />
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              onChange={(e) => handleLogo(e.target.files?.[0])}
              className="sr-only"
              aria-label="Choose a logo image"
            />
            <Button
              variant="outline"
              onClick={() => fileInput.current?.click()}
              disabled={!canEdit}
              isLoading={resizing}
            >
              <Upload size={14} />
              {org?.logoUrl ? 'Replace' : 'Upload'}
            </Button>
            {org?.logoUrl && (
              <Button
                variant="ghost"
                onClick={() => update.mutate({ logoUrl: null })}
                disabled={!canEdit}
              >
                <Trash2 size={14} />
                Remove
              </Button>
            )}
          </div>
        </div>
      </SettingsSection>

      {/* ── Identity ───────────────────────────────────────────────────────── */}
      <SettingsSection
        title="Organization details"
        description="The slug was issued at signup and can’t change — links and future subdomains depend on it."
        footerHint={dirty ? 'Unsaved changes' : undefined}
        footer={
          <Button
            onClick={() => update.mutate(form)}
            isLoading={update.isPending}
            disabled={!canEdit || !dirty || !form.name.trim()}
          >
            Save changes
          </Button>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Organization name" htmlFor="orgName" required className="sm:col-span-2">
            <input
              id="orgName"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              disabled={!canEdit || isLoading}
              className={controlClass}
            />
          </Field>

          <Field label="Slug" htmlFor="orgSlug" hint="Read-only.">
            <input
              id="orgSlug"
              value={org?.slug ?? ''}
              readOnly
              disabled
              className={cn(controlClass, 'font-mono text-muted-foreground')}
            />
          </Field>

          <Field
            label="Timezone"
            htmlFor="orgTimezone"
            hint="Display default. Stored data is always UTC."
          >
            <select
              id="orgTimezone"
              value={form.timezone}
              onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}
              disabled={!canEdit || isLoading}
              className={selectClass}
            >
              {/* A saved value outside the runtime's list would silently reset
                  the select to its first option, so surface it explicitly. */}
              {!timezones.includes(form.timezone) && (
                <option value={form.timezone}>{form.timezone}</option>
              )}
              {timezones.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Date format" htmlFor="orgDateFormat" className="sm:col-span-2">
            <select
              id="orgDateFormat"
              value={form.dateFormat}
              onChange={(e) => setForm((f) => ({ ...f, dateFormat: e.target.value as DateFormat }))}
              disabled={!canEdit || isLoading}
              className={cn(selectClass, 'sm:max-w-[220px]')}
            >
              {DATE_FORMATS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {!canEdit && (
          <p className="mt-4 text-[11px] text-muted-foreground">
            Only owners and admins can change these. The server enforces it too.
          </p>
        )}
      </SettingsSection>

      {/* ── Plan ───────────────────────────────────────────────────────────── */}
      <SettingsSection
        title="Plan"
        description="Billing isn’t connected in this build — the plan below is informational."
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[26px] font-semibold leading-none tracking-tight text-foreground">
              {PLAN_LABEL[org?.plan ?? 'free'] ?? 'Free'}
            </p>
            <p className="mt-1.5 text-[13px] text-muted-foreground">
              {/* activeMembers is the live count; memberCount is a denormalised
                  counter that can drift. Show the one that's true. */}
              {formatNumber(org?.activeMembers ?? org?.memberCount ?? 0)} active member
              {(org?.activeMembers ?? org?.memberCount ?? 0) === 1 ? '' : 's'} · unlimited
            </p>
          </div>
          {/* No disabled "Upgrade" button here. Same reasoning as the Calendar
              empty state: a control that can never fire is worse than no
              control, because it advertises a capability that doesn't exist. */}
          <span className="rounded-full border border-border/60 bg-muted/60 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
            No billing configured
          </span>
        </div>
      </SettingsSection>
    </div>
  );
}
