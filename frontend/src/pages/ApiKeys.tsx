import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Ban,
  Check,
  Copy,
  KeyRound,
  Pencil,
  Plus,
  RotateCw,
  Search,
  Trash2,
} from 'lucide-react';
import { fetchProjects } from '../api/projects';
import {
  createKey,
  deleteKey,
  fetchKeys,
  revokeKey,
  rotateKey,
  updateKey,
} from '../api/keys';
import { Badge } from '../components/Badge';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { EmptyState } from '../components/EmptyState';
import { FormError, FormField, FormSelect, FormTextInput, inputClassName } from '../components/FormField';
import { Modal } from '../components/Modal';
import { Spinner } from '../components/Spinner';
import { getApiErrorMessage } from '../lib/api';
import { copyToClipboard, formatDateTime, formatNumber, formatRelative } from '../lib/format';
import type {
  ApiKey,
  ApiKeySecret,
  ApiKeyUpdatePayload,
  Paginated,
  Scope,
} from '../lib/types';

const SCOPES: Scope[] = ['read', 'write', 'admin'];

/** ISO timestamp -> value for an `<input type="datetime-local">`. */
function toDatetimeLocal(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

function keyStatus(key: ApiKey): { label: string; tone: 'green' | 'amber' | 'red' } {
  if (!key.is_active) return { label: 'Revoked', tone: 'red' };
  if (key.expires_at && new Date(key.expires_at).getTime() < Date.now()) {
    return { label: 'Expired', tone: 'amber' };
  }
  return { label: 'Active', tone: 'green' };
}

interface SecretModalProps {
  secret: ApiKeySecret | null;
  rotated: boolean;
  onClose: () => void;
}

function SecretModal({ secret, rotated, onClose }: SecretModalProps) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!secret) return;
    if (await copyToClipboard(secret.api_key)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  if (!secret) return null;

  return (
    <Modal
      open
      title={rotated ? 'Key rotated' : 'API key created'}
      onClose={onClose}
      footer={
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
        >
          I saved it — close
        </button>
      }
    >
      <div className="space-y-4">
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <p className="text-sm text-amber-300">
            This is the only time the full key will be shown. Store it securely now —
            you can’t reveal it later (only rotate it).
          </p>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2.5">
          <code className="min-w-0 break-all font-mono text-sm text-emerald-300">
            {secret.api_key}
          </code>
          <button
            type="button"
            onClick={copy}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-slate-700 bg-slate-800/60 px-2.5 py-1.5 text-xs font-medium text-slate-300 transition hover:text-slate-100"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-400" />
                Copied
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                Copy
              </>
            )}
          </button>
        </div>

        <p className="text-xs text-slate-500">
          Name: <span className="text-slate-300">{secret.name}</span>
          {secret.project_name && (
            <>
              {' · '}Project: <span className="text-slate-300">{secret.project_name}</span>
            </>
          )}
        </p>
      </div>
    </Modal>
  );
}

export function ApiKeys() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [secret, setSecret] = useState<ApiKeySecret | null>(null);
  const [secretRotated, setSecretRotated] = useState(false);
  const [revoking, setRevoking] = useState<ApiKey | null>(null);
  const [rotating, setRotating] = useState<ApiKey | null>(null);
  const [deleting, setDeleting] = useState<ApiKey | null>(null);
  const [editing, setEditing] = useState<ApiKey | null>(null);

  // Create / edit form
  const [name, setName] = useState('');
  const [project, setProject] = useState('');
  const [rateLimit, setRateLimit] = useState('60');
  const [scopes, setScopes] = useState<Scope[]>(['read']);
  const [expiresAt, setExpiresAt] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const keys = useQuery({
    queryKey: ['keys', search],
    queryFn: () => fetchKeys(search || undefined),
  });

  const projects = useQuery({
    queryKey: ['projects', ''],
    queryFn: () => fetchProjects(),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['keys'] });
  };

  /**
   * Insert the freshly created/rotated row straight into every cached key list
   * so the table updates without a refetch. Refetching here would be wrong: the
   * plaintext `api_key` only exists in this response, and the user still has to
   * be able to read it. The list is revalidated once the secret modal closes.
   */
  const mergeKeyIntoCache = (secret: ApiKeySecret) => {
    queryClient.setQueriesData<Paginated<ApiKey>>({ queryKey: ['keys'] }, (old) => {
      // `['keys']` is a prefix of the `['keys','stats']` query — only rewrite
      // entries that really are a paginated key list.
      if (!old || !Array.isArray(old.results)) return old;
      const { api_key: _secret, ...key } = secret;
      const exists = old.results.some((item) => item.id === key.id);
      const results = exists
        ? old.results.map((item) => (item.id === key.id ? key : item))
        : [key, ...old.results];
      return {
        ...old,
        count: exists ? old.count : old.count + 1,
        results,
      };
    });
    queryClient.invalidateQueries({ queryKey: ['keys', 'stats'] });
  };

  const showSecret = (data: ApiKeySecret, rotated: boolean) => {
    mergeKeyIntoCache(data);
    setSecret(data);
    setSecretRotated(rotated);
  };

  const closeSecret = () => {
    setSecret(null);
    invalidate();
  };

  const createMutation = useMutation({
    mutationFn: createKey,
    onSuccess: (data) => {
      closeModal();
      resetForm();
      showSecret(data, false);
    },
    onError: (error) => setFormError(getApiErrorMessage(error)),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ApiKeyUpdatePayload }) =>
      updateKey(id, payload),
    onSuccess: () => {
      invalidate();
      setEditing(null);
      setFormError(null);
    },
    onError: (error) => setFormError(getApiErrorMessage(error)),
  });

  const revokeMutation = useMutation({
    mutationFn: revokeKey,
    onSuccess: () => {
      invalidate();
      setRevoking(null);
    },
  });

  const rotateMutation = useMutation({
    mutationFn: rotateKey,
    onSuccess: (data) => {
      setRotating(null);
      showSecret(data, true);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteKey,
    onSuccess: () => {
      invalidate();
      setDeleting(null);
    },
  });

  const resetForm = () => {
    setName('');
    setProject('');
    setRateLimit('60');
    setScopes(['read']);
    setExpiresAt('');
    setFormError(null);
  };

  const openCreate = () => {
    resetForm();
    setEditing(null);
    setCreateOpen(true);
  };

  const openEdit = (key: ApiKey) => {
    setName(key.name);
    setProject(key.project ?? '');
    setRateLimit(String(key.rate_limit));
    setScopes(key.scopes.length > 0 ? key.scopes : ['read']);
    setExpiresAt(toDatetimeLocal(key.expires_at));
    setFormError(null);
    setEditing(key);
    setCreateOpen(true);
  };

  const closeModal = () => {
    setCreateOpen(false);
    setEditing(null);
    setFormError(null);
  };

  const toggleScope = (scope: Scope) => {
    setScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope],
    );
  };

  const onCreateSubmit = (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    const rate = Number(rateLimit);
    if (!Number.isFinite(rate) || rate <= 0) {
      setFormError('Rate limit must be a positive number.');
      return;
    }
    if (editing) {
      // The project binding of a key is immutable in the contract.
      updateMutation.mutate({
        id: editing.id,
        payload: {
          name: name.trim(),
          scopes,
          rate_limit: rate,
          expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
        },
      });
      return;
    }
    createMutation.mutate({
      name: name.trim(),
      ...(project ? { project } : {}),
      scopes,
      rate_limit: rate,
      ...(expiresAt ? { expires_at: new Date(expiresAt).toISOString() } : {}),
    });
  };

  const results = keys.data?.results ?? [];
  const saving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-slate-100">API Keys</h2>
          <p className="text-sm text-slate-400">
            Credentials your clients use to call the gateway.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
        >
          <Plus className="h-4 w-4" />
          Create key
        </button>
      </div>

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search keys…"
          className={`${inputClassName} pl-9`}
        />
      </div>

      {keys.isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-slate-800/50" />
          ))}
        </div>
      ) : keys.isError ? (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">
          Failed to load API keys.
        </div>
      ) : results.length === 0 ? (
        <EmptyState
          icon={KeyRound}
          title={search ? 'No keys match your search' : 'No API keys yet'}
          description="Create a key to authenticate requests to the gateway."
          action={
            !search && (
              <button
                type="button"
                onClick={openCreate}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
              >
                <Plus className="h-4 w-4" />
                Create key
              </button>
            )
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/60">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Key</th>
                <th className="px-4 py-3 font-medium">Project</th>
                <th className="px-4 py-3 text-right font-medium">Rate limit</th>
                <th className="px-4 py-3 font-medium">Scopes</th>
                <th className="px-4 py-3 font-medium">Last used</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {results.map((key) => {
                const status = keyStatus(key);
                return (
                  <tr key={key.id} className="text-slate-300">
                    <td className="px-4 py-3 font-medium text-slate-200">{key.name}</td>
                    <td className="px-4 py-3">
                      <code className="font-mono text-xs text-slate-400">
                        {key.masked_key}
                      </code>
                    </td>
                    <td className="px-4 py-3 text-slate-400">
                      {key.project_name ?? (
                        <span className="text-slate-600">All projects</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-400">
                      {formatNumber(key.rate_limit)}/min
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {key.scopes.map((scope) => (
                          <Badge key={scope} tone={scope === 'admin' ? 'amber' : 'default'}>
                            {scope}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-400" title={formatDateTime(key.last_used_at)}>
                      {formatRelative(key.last_used_at)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(key)}
                          title="Edit key"
                          aria-label={`Edit ${key.name}`}
                          className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-indigo-400"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        {key.is_active && (
                          <>
                            <button
                              type="button"
                              onClick={() => setRevoking(key)}
                              title="Revoke key"
                              aria-label={`Revoke ${key.name}`}
                              className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-amber-400"
                            >
                              <Ban className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setRotating(key)}
                              title="Rotate key"
                              aria-label={`Rotate ${key.name}`}
                              className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-indigo-400"
                            >
                              <RotateCw className="h-4 w-4" />
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() => setDeleting(key)}
                          title="Delete key"
                          aria-label={`Delete ${key.name}`}
                          className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-rose-400"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create / edit key modal */}
      <Modal
        open={createOpen}
        title={editing ? 'Edit API key' : 'Create API key'}
        onClose={closeModal}
        footer={
          <>
            <button
              type="button"
              onClick={closeModal}
              className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="create-key-form"
              disabled={saving || name.trim() === ''}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
            >
              {saving && <Spinner className="h-4 w-4 border-white/30 border-t-white" />}
              {editing ? 'Save changes' : 'Create key'}
            </button>
          </>
        }
      >
        <form id="create-key-form" onSubmit={onCreateSubmit} className="space-y-4">
          <FormError message={formError} />

          <FormTextInput
            label="Name"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Production server"
          />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormSelect
              label="Project"
              value={project}
              disabled={editing !== null}
              onChange={(event) => setProject(event.target.value)}
              hint={
                editing
                  ? 'A key cannot be moved between projects.'
                  : 'Leave as “All projects” for a global key.'
              }
              options={[
                { value: '', label: 'All projects' },
                ...(projects.data?.results ?? []).map((item) => ({
                  value: item.id,
                  label: item.name,
                })),
              ]}
            />
            <FormTextInput
              label="Rate limit (req/min)"
              type="number"
              min={1}
              required
              value={rateLimit}
              onChange={(event) => setRateLimit(event.target.value)}
              hint="Requests allowed per minute."
            />
          </div>

          <FormField label="Scopes" htmlFor="key-scopes-read">
            <div id="key-scopes-read" className="flex flex-wrap gap-2">
              {SCOPES.map((scope) => (
                <label
                  key={scope}
                  className={`cursor-pointer rounded-lg border px-3 py-1.5 text-sm capitalize transition ${
                    scopes.includes(scope)
                      ? 'border-indigo-500/50 bg-indigo-500/10 text-indigo-300'
                      : 'border-slate-700 bg-slate-950/60 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={scopes.includes(scope)}
                    onChange={() => toggleScope(scope)}
                    className="sr-only"
                  />
                  {scope}
                </label>
              ))}
            </div>
          </FormField>

          <FormTextInput
            label="Expires at"
            type="datetime-local"
            value={expiresAt}
            onChange={(event) => setExpiresAt(event.target.value)}
            hint="Leave empty for no expiry."
          />
        </form>
      </Modal>

      <SecretModal
        secret={secret}
        rotated={secretRotated}
        onClose={closeSecret}
      />

      <ConfirmDialog
        open={revoking !== null}
        title="Revoke key"
        message={`Revoke “${revoking?.name ?? ''}”? Requests using this key will immediately fail with 403.`}
        confirmLabel="Revoke"
        danger
        loading={revokeMutation.isPending}
        onConfirm={() => {
          if (revoking) revokeMutation.mutate(revoking.id);
        }}
        onCancel={() => setRevoking(null)}
      />

      <ConfirmDialog
        open={rotating !== null}
        title="Rotate key"
        message={`Rotate “${rotating?.name ?? ''}”? A new secret will be generated and the current one stops working immediately.`}
        confirmLabel="Rotate"
        loading={rotateMutation.isPending}
        onConfirm={() => {
          if (rotating) rotateMutation.mutate(rotating.id);
        }}
        onCancel={() => setRotating(null)}
      />

      <ConfirmDialog
        open={deleting !== null}
        title="Delete key"
        message={`Delete “${deleting?.name ?? ''}” permanently? This cannot be undone.`}
        confirmLabel="Delete"
        danger
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (deleting) deleteMutation.mutate(deleting.id);
        }}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
