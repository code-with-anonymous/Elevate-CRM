// ─────────────────────────────────────────────────────────────────────────────
// pages/settings/ProfileSettings.tsx  (/settings/profile)
//
// Four independent blocks, four independent saves. A single "Save all" button
// would have to decide what to do when the name saved but the email change was
// rejected — so each block owns its own mutation and its own error.
//
// Password change reuses authService.changePassword from the auth phase; the
// avatar goes through lib/imageResize before it ever hits the network.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { AtSign, Camera, Loader2, Trash2, Upload } from 'lucide-react';
import AvatarWithInitials from '@/components/common/AvatarWithInitials';
import { Button } from '@/components/ui/button';
import { Field, controlClass } from '@/components/ui/field';
import SettingsSection from '@/pages/settings/SettingsSection';
import {
  useChangeEmail,
  useDeleteAccount,
  useRemoveAvatar,
  useUpdateProfile,
  useUploadAvatar,
} from '@/hooks/useProfile';
import authService from '@/services/api/authService';
import { useAuthStore } from '@/store/authStore';
import { dataUrlBytes, resizeImageToDataUrl } from '@/lib/imageResize';
import { cn } from '@/lib/cn';

const AVATAR_MAX_BYTES = 200 * 1024;

export default function ProfileSettings() {
  const user = useAuthStore((s) => s.user);
  const isOwner = String(user?.role ?? '').toLowerCase() === 'owner';

  // ── Identity block ──────────────────────────────────────────────────────────
  const updateProfile = useUpdateProfile();
  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '' });

  // Seed from the store once it's hydrated. Without the guard, a refresh that
  // rehydrates Zustand after first paint would leave the inputs empty.
  useEffect(() => {
    if (!user) return;
    setForm({
      firstName: user.firstName ?? '',
      lastName: user.lastName ?? '',
      phone: user.phone ?? '',
    });
  }, [user]);

  const identityDirty =
    user !== null &&
    (form.firstName !== (user.firstName ?? '') ||
      form.lastName !== (user.lastName ?? '') ||
      form.phone !== (user.phone ?? ''));

  // ── Avatar block ────────────────────────────────────────────────────────────
  const uploadAvatar = useUploadAvatar();
  const removeAvatar = useRemoveAvatar();
  const fileInput = useRef<HTMLInputElement>(null);
  const [resizing, setResizing] = useState(false);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setResizing(true);
    try {
      const dataUrl = await resizeImageToDataUrl(file, { size: 256, quality: 0.82 });
      // Belt and braces: the 256px resize should always land under the cap, but
      // a pathological source (huge canvas, weird colour profile) could exceed
      // it, and a client-side message beats a 400.
      if (dataUrlBytes(dataUrl) > AVATAR_MAX_BYTES) {
        toast.error('That image is still too large after resizing. Try a smaller crop.');
        return;
      }
      uploadAvatar.mutate(dataUrl);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not read that image.');
    } finally {
      setResizing(false);
      // Reset the input so picking the same file twice still fires onChange.
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  // ── Email block ─────────────────────────────────────────────────────────────
  const changeEmail = useChangeEmail();
  const [email, setEmail] = useState('');
  useEffect(() => setEmail(user?.email ?? ''), [user]);
  const emailDirty = user !== null && email.trim().toLowerCase() !== (user.email ?? '').toLowerCase();

  // ── Password block ──────────────────────────────────────────────────────────
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirmNewPassword: '' });
  const changePassword = useMutation({
    mutationFn: () => authService.changePassword(pw),
    onSuccess: () => {
      toast.success('Password changed');
      setPw({ currentPassword: '', newPassword: '', confirmNewPassword: '' });
    },
    onError: (err: unknown) => {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data
        ?.message;
      toast.error(message || 'Failed to change password');
    },
  });

  const pwMismatch =
    pw.confirmNewPassword.length > 0 && pw.newPassword !== pw.confirmNewPassword;
  const pwReady =
    pw.currentPassword.length > 0 && pw.newPassword.length >= 8 && !pwMismatch;

  // ── Danger zone ─────────────────────────────────────────────────────────────
  const deleteAccount = useDeleteAccount();
  const [confirmText, setConfirmText] = useState('');

  return (
    <div className="space-y-5">
      {/* ── Avatar ─────────────────────────────────────────────────────────── */}
      <SettingsSection
        title="Avatar"
        description="Shown beside your name across the app. Square images work best."
      >
        <div className="flex flex-wrap items-center gap-5">
          <div className="relative">
            {user?.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt=""
                className="h-16 w-16 rounded-full object-cover ring-1 ring-border/60"
              />
            ) : (
              <AvatarWithInitials
                firstName={user?.firstName}
                lastName={user?.lastName}
                size="xl"
              />
            )}
            {(resizing || uploadAvatar.isPending) && (
              <span className="absolute inset-0 flex items-center justify-center rounded-full bg-overlay/50">
                <Loader2 size={18} className="animate-spin text-white" />
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => handleFile(e.target.files?.[0])}
              className="sr-only"
              aria-label="Choose an avatar image"
            />
            <Button
              variant="outline"
              onClick={() => fileInput.current?.click()}
              isLoading={resizing || uploadAvatar.isPending}
            >
              <Upload size={14} />
              {user?.avatarUrl ? 'Replace' : 'Upload'}
            </Button>
            {user?.avatarUrl && (
              <Button
                variant="ghost"
                onClick={() => removeAvatar.mutate()}
                isLoading={removeAvatar.isPending}
              >
                <Trash2 size={14} />
                Remove
              </Button>
            )}
            <p className="w-full text-[11px] text-muted-foreground">
              <Camera size={11} className="mr-1 inline" />
              Resized to 256×256 in your browser before upload — originals aren’t sent.
            </p>
          </div>
        </div>
      </SettingsSection>

      {/* ── Identity ───────────────────────────────────────────────────────── */}
      <SettingsSection
        title="Your details"
        description="How your name appears on leads, tasks, and reports."
        footerHint={identityDirty ? 'Unsaved changes' : undefined}
        footer={
          <Button
            onClick={() => updateProfile.mutate({ ...form, phone: form.phone || null })}
            isLoading={updateProfile.isPending}
            disabled={!identityDirty}
          >
            Save changes
          </Button>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First name" htmlFor="firstName" required>
            <input
              id="firstName"
              value={form.firstName}
              onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
              className={controlClass}
            />
          </Field>
          <Field label="Last name" htmlFor="lastName" required>
            <input
              id="lastName"
              value={form.lastName}
              onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
              className={controlClass}
            />
          </Field>
          <Field label="Phone" htmlFor="phone" hint="Optional." className="sm:col-span-2">
            <input
              id="phone"
              type="tel"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              placeholder="+44 7700 900000"
              className={controlClass}
            />
          </Field>
        </div>
      </SettingsSection>

      {/* ── Email ──────────────────────────────────────────────────────────── */}
      <SettingsSection
        title="Email address"
        description="Changing this signs out of nothing, but you'll need to verify the new address before you can use the app again."
        footerHint={
          user && !user.isEmailVerified ? 'This address is not verified yet' : undefined
        }
        footer={
          <Button
            variant="outline"
            onClick={() => changeEmail.mutate(email.trim())}
            isLoading={changeEmail.isPending}
            disabled={!emailDirty || !email.includes('@')}
          >
            <AtSign size={14} />
            Change email
          </Button>
        }
      >
        <Field
          label="Email"
          htmlFor="email"
          hint="A verification link goes to the new address immediately."
        >
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={controlClass}
          />
        </Field>
      </SettingsSection>

      {/* ── Password ───────────────────────────────────────────────────────── */}
      <SettingsSection
        title="Password"
        description="At least 8 characters, with one uppercase letter and one number."
        footer={
          <Button
            onClick={() => changePassword.mutate()}
            isLoading={changePassword.isPending}
            disabled={!pwReady}
          >
            Update password
          </Button>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Current password" htmlFor="currentPassword" required className="sm:col-span-2">
            <input
              id="currentPassword"
              type="password"
              autoComplete="current-password"
              value={pw.currentPassword}
              onChange={(e) => setPw((p) => ({ ...p, currentPassword: e.target.value }))}
              className={controlClass}
            />
          </Field>
          <Field label="New password" htmlFor="newPassword" required>
            <input
              id="newPassword"
              type="password"
              autoComplete="new-password"
              value={pw.newPassword}
              onChange={(e) => setPw((p) => ({ ...p, newPassword: e.target.value }))}
              className={controlClass}
            />
          </Field>
          <Field
            label="Confirm new password"
            htmlFor="confirmNewPassword"
            required
            error={pwMismatch ? 'Passwords do not match' : undefined}
          >
            <input
              id="confirmNewPassword"
              type="password"
              autoComplete="new-password"
              value={pw.confirmNewPassword}
              onChange={(e) => setPw((p) => ({ ...p, confirmNewPassword: e.target.value }))}
              className={cn(controlClass, pwMismatch && 'border-destructive/60')}
            />
          </Field>
        </div>
      </SettingsSection>

      {/* ── Danger zone ────────────────────────────────────────────────────── */}
      <SettingsSection
        tone="danger"
        title="Delete account"
        description={
          isOwner
            ? 'You own this organisation, so your account can’t be deleted — every record belongs to it. Transfer ownership first.'
            : 'Your account is deactivated immediately. Leads, deals, and tasks assigned to you stay where they are.'
        }
        footer={
          <Button
            variant="destructive"
            onClick={() => deleteAccount.mutate()}
            isLoading={deleteAccount.isPending}
            disabled={isOwner || confirmText !== 'DELETE'}
          >
            <Trash2 size={14} />
            Delete my account
          </Button>
        }
      >
        {isOwner ? (
          <p className="text-[13px] text-muted-foreground">
            The organisation owner is the anchor for every record in the workspace. The server
            refuses this request, so the control stays disabled.
          </p>
        ) : (
          <Field
            label="Type DELETE to confirm"
            htmlFor="confirmDelete"
            hint="Case-sensitive. This exists to make the action deliberate, not difficult."
          >
            <input
              id="confirmDelete"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="DELETE"
              className={cn(controlClass, 'max-w-[220px] font-mono')}
            />
          </Field>
        )}
      </SettingsSection>
    </div>
  );
}
