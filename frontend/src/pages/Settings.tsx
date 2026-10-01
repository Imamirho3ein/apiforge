import { useEffect, useState, type FormEvent } from 'react';
import {
  BadgeCheck,
  Camera,
  LogOut,
  Mail,
  Save,
  UserRound,
} from 'lucide-react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Spinner } from '../components/Spinner';
import { FormError, FormField, FormTextarea, FormTextInput } from '../components/FormField';
import { useAuth } from '../hooks/useAuth';
import { getApiErrorMessage } from '../lib/api';

interface ProfileForm {
  first_name: string;
  last_name: string;
  company: string;
  bio: string;
  avatar_url: string;
}

const EMPTY_FORM: ProfileForm = {
  first_name: '',
  last_name: '',
  company: '',
  bio: '',
  avatar_url: '',
};

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]!.toUpperCase())
      .join('') || '?'
  );
}

export function Settings() {
  const { user, updateProfile, logout } = useAuth();
  const [form, setForm] = useState<ProfileForm>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);

  // Seed the form from the persisted user once it is available.
  useEffect(() => {
    if (!user) return;
    setForm({
      first_name: user.first_name ?? '',
      last_name: user.last_name ?? '',
      company: user.company ?? '',
      bio: user.bio ?? '',
      avatar_url: user.avatar_url ?? '',
    });
  }, [user]);

  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(false), 3000);
    return () => clearTimeout(timer);
  }, [saved]);

  const patch = (key: keyof ProfileForm) => (value: string) => {
    setSaved(false);
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await updateProfile({
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        company: form.company.trim(),
        bio: form.bio.trim(),
        avatar_url: form.avatar_url.trim(),
      });
      setSaved(true);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const displayName =
    [form.first_name, form.last_name].filter(Boolean).join(' ') ||
    user?.username ||
    'User';

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-slate-100">Settings</h2>
        <p className="text-sm text-slate-400">
          Update your profile and manage your session.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Identity summary */}
        <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 lg:col-span-1">
          <h3 className="text-sm font-semibold text-slate-200">Account</h3>
          <div className="mt-4 flex items-center gap-3">
            {form.avatar_url ? (
              <img
                src={form.avatar_url}
                alt=""
                className="h-14 w-14 rounded-full border border-slate-800 object-cover"
              />
            ) : (
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-indigo-500/20 text-lg font-semibold text-indigo-300">
                {initials(displayName)}
              </span>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-100">{displayName}</p>
              <p className="flex items-center gap-1.5 truncate text-xs text-slate-500">
                <Mail className="h-3 w-3 shrink-0" />
                {user?.email}
              </p>
            </div>
          </div>

          <dl className="mt-5 space-y-2.5 border-t border-slate-800 pt-4 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-slate-500">Username</dt>
              <dd className="truncate font-medium text-slate-300">{user?.username}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-slate-500">User ID</dt>
              <dd className="truncate font-mono text-xs text-slate-400" title={user?.id}>
                {String(user?.id ?? '').slice(0, 8)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-slate-500">Email verified</dt>
              <dd>
                <span className="inline-flex items-center gap-1 text-emerald-400">
                  <BadgeCheck className="h-3.5 w-3.5" />
                  Active
                </span>
              </dd>
            </div>
          </dl>

          <button
            type="button"
            onClick={() => setConfirmLogout(true)}
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-rose-500/30 px-4 py-2 text-sm font-semibold text-rose-300 transition hover:bg-rose-500/10"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </section>

        {/* Profile form */}
        <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 lg:col-span-2">
          <div className="mb-4 flex items-center gap-2">
            <UserRound className="h-4 w-4 text-indigo-400" />
            <h3 className="text-sm font-semibold text-slate-200">Profile</h3>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <FormError message={error} />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormTextInput
                label="First name"
                autoComplete="given-name"
                value={form.first_name}
                onChange={(event) => patch('first_name')(event.target.value)}
                placeholder="Jane"
              />
              <FormTextInput
                label="Last name"
                autoComplete="family-name"
                value={form.last_name}
                onChange={(event) => patch('last_name')(event.target.value)}
                placeholder="Doe"
              />
            </div>

            <FormTextInput
              label="Company"
              autoComplete="organization"
              value={form.company}
              onChange={(event) => patch('company')(event.target.value)}
              placeholder="Acme Inc."
            />

            <FormField
              label="Avatar URL"
              htmlFor="settings-avatar"
              hint="Paste a link to a square image. Leave empty to use your initials."
            >
              <div className="flex items-center gap-2">
                <Camera className="h-4 w-4 shrink-0 text-slate-500" />
                <input
                  id="settings-avatar"
                  type="url"
                  value={form.avatar_url}
                  onChange={(event) => patch('avatar_url')(event.target.value)}
                  placeholder="https://example.com/avatar.png"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 transition focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </FormField>

            <FormTextarea
              label="Bio"
              rows={4}
              value={form.bio}
              onChange={(event) => patch('bio')(event.target.value)}
              placeholder="A short line about what you build…"
              hint={`${form.bio.length} characters`}
            />

            <div className="flex items-center justify-end gap-3 border-t border-slate-800 pt-4">
              {saved && (
                <span className="inline-flex items-center gap-1.5 text-sm text-emerald-400">
                  <BadgeCheck className="h-4 w-4" />
                  Profile updated
                </span>
              )}
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
              >
                {submitting ? (
                  <Spinner className="h-4 w-4 border-white/30 border-t-white" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save changes
              </button>
            </div>
          </form>
        </section>
      </div>

      <ConfirmDialog
        open={confirmLogout}
        title="Sign out"
        message="You will be returned to the login page. Any live log stream is closed."
        confirmLabel="Sign out"
        danger
        onConfirm={() => {
          setConfirmLogout(false);
          logout();
        }}
        onCancel={() => setConfirmLogout(false)}
      />
    </div>
  );
}
