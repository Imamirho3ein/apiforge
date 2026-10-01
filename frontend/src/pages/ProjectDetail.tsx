import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  Copy,
  FolderKanban,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import {
  createEndpoint,
  deleteEndpoint,
  fetchEndpoints,
  HTTP_METHODS,
  updateEndpoint,
} from '../api/endpoints';
import { fetchProject } from '../api/projects';
import { Badge } from '../components/Badge';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { EmptyState } from '../components/EmptyState';
import { FormError, FormField, inputClassName, Toggle } from '../components/FormField';
import { MethodBadge } from '../components/MethodBadge';
import { Modal } from '../components/Modal';
import { Spinner } from '../components/Spinner';
import { getApiErrorMessage } from '../lib/api';
import { copyToClipboard, formatNumber } from '../lib/format';
import type { Endpoint, HttpMethod } from '../lib/types';

const INPUT = inputClassName;

function CopyButton({ value, compact = false }: { value: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (await copyToClipboard(value)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      title="Copy to clipboard"
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border border-slate-700 bg-slate-800/60 text-xs font-medium text-slate-300 transition hover:border-slate-600 hover:text-slate-100 ${
        compact ? 'px-2 py-1' : 'px-2.5 py-1.5'
      }`}
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
  );
}

interface EndpointFormState {
  name: string;
  method: HttpMethod;
  path: string;
  description: string;
  mock_enabled: boolean;
  mock_status: string;
  mock_body: string;
  target_url: string;
}

const EMPTY_FORM: EndpointFormState = {
  name: '',
  method: 'GET',
  path: '/',
  description: '',
  mock_enabled: true,
  mock_status: '200',
  mock_body: '{}',
  target_url: '',
};

function toFormState(endpoint: Endpoint): EndpointFormState {
  return {
    name: endpoint.name,
    method: endpoint.method,
    path: endpoint.path,
    description: endpoint.description,
    mock_enabled: endpoint.mock_enabled,
    mock_status: String(endpoint.mock_status),
    mock_body:
      Object.keys(endpoint.mock_body).length > 0
        ? JSON.stringify(endpoint.mock_body, null, 2)
        : '{}',
    target_url: endpoint.target_url,
  };
}

interface EndpointModalProps {
  open: boolean;
  title: string;
  form: EndpointFormState;
  gatewayUrl: string;
  submitting: boolean;
  error: string | null;
  onFormChange: (patch: Partial<EndpointFormState>) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
}

function EndpointModal({
  open,
  title,
  form,
  gatewayUrl,
  submitting,
  error,
  onFormChange,
  onClose,
  onSubmit,
}: EndpointModalProps) {
  const [jsonError, setJsonError] = useState<string | null>(null);

  const handleBodyChange = (value: string) => {
    onFormChange({ mock_body: value });
    if (value.trim() === '') {
      setJsonError(null);
      return;
    }
    try {
      JSON.parse(value);
      setJsonError(null);
    } catch {
      setJsonError('Invalid JSON');
    }
  };

  const pathValid = form.path.startsWith('/');
  const statusValid = /^\d{3}$/.test(form.mock_status);

  const canSubmit =
    form.name.trim() !== '' &&
    pathValid &&
    statusValid &&
    jsonError === null &&
    (!form.mock_enabled || form.mock_body.trim() === '' || jsonError === null);

  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="endpoint-form"
            disabled={!canSubmit || submitting}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
          >
            {submitting && <Spinner className="h-4 w-4 border-white/30 border-t-white" />}
            Save endpoint
          </button>
        </>
      }
    >
      <form id="endpoint-form" onSubmit={onSubmit} className="space-y-4">
        <FormError message={error} />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[8rem_1fr]">
          <div>
            <label htmlFor="endpoint-method" className="mb-1.5 block text-sm font-medium text-slate-300">
              Method
            </label>
            <select
              id="endpoint-method"
              value={form.method}
              onChange={(e) => onFormChange({ method: e.target.value as HttpMethod })}
              className={INPUT}
            >
              {HTTP_METHODS.map((method) => (
                <option key={method} value={method}>
                  {method}
                </option>
              ))}
            </select>
          </div>
          <FormField
            label="Path"
            htmlFor="endpoint-path"
            required
            error={pathValid ? null : 'Path must start with “/”.'}
          >
            <input
              id="endpoint-path"
              type="text"
              required
              value={form.path}
              onChange={(e) => onFormChange({ path: e.target.value })}
              placeholder="/users/:id"
              className={`${INPUT} font-mono`}
            />
          </FormField>
        </div>

        <div>
          <label htmlFor="endpoint-name" className="mb-1.5 block text-sm font-medium text-slate-300">
            Name <span className="text-rose-400">*</span>
          </label>
          <input
            id="endpoint-name"
            type="text"
            required
            value={form.name}
            onChange={(e) => onFormChange({ name: e.target.value })}
            placeholder="List users"
            className={INPUT}
          />
        </div>

        <div>
          <label htmlFor="endpoint-description" className="mb-1.5 block text-sm font-medium text-slate-300">
            Description
          </label>
          <textarea
            id="endpoint-description"
            rows={2}
            value={form.description}
            onChange={(e) => onFormChange({ description: e.target.value })}
            placeholder="Optional notes…"
            className={`${INPUT} resize-none`}
          />
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-4">
          <Toggle
            label="Mock mode"
            description="Respond with a canned payload instead of proxying upstream."
            checked={form.mock_enabled}
            onChange={(mock_enabled) => onFormChange({ mock_enabled })}
          />

          {form.mock_enabled ? (
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[7rem_1fr]">
              <FormField
                label="Status"
                htmlFor="mock-status"
                error={statusValid ? null : '3 digits, e.g. 200.'}
              >
                <input
                  id="mock-status"
                  type="text"
                  inputMode="numeric"
                  value={form.mock_status}
                  onChange={(e) => onFormChange({ mock_status: e.target.value })}
                  className={`${INPUT} font-mono`}
                />
              </FormField>
              <FormField
                label="Mock body (JSON)"
                htmlFor="mock-body"
                error={jsonError}
                hint="Must be a valid JSON object."
              >
                <textarea
                  id="mock-body"
                  rows={5}
                  value={form.mock_body}
                  onChange={(e) => handleBodyChange(e.target.value)}
                  spellCheck={false}
                  className={`${INPUT} resize-y font-mono text-xs`}
                />
              </FormField>
            </div>
          ) : (
            <div className="mt-4">
              <label htmlFor="target-url" className="mb-1.5 block text-sm font-medium text-slate-300">
                Upstream target URL
              </label>
              <input
                id="target-url"
                type="url"
                value={form.target_url}
                onChange={(e) => onFormChange({ target_url: e.target.value })}
                placeholder="https://api.example.com/users"
                className={`${INPUT} font-mono`}
              />
              <p className="mt-1 text-xs text-slate-500">
                Leave empty to return <code className="text-amber-400">501</code> until a
                backend is configured.
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 rounded-lg border border-indigo-500/20 bg-indigo-500/5 px-3 py-2.5">
          <div className="min-w-0">
            <p className="text-xs text-slate-400">Gateway URL</p>
            <p className="truncate font-mono text-xs text-indigo-300">{gatewayUrl}</p>
          </div>
          <CopyButton value={gatewayUrl} compact />
        </div>
      </form>
    </Modal>
  );
}

export function ProjectDetail() {
  const { id = '' } = useParams();
  const queryClient = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Endpoint | null>(null);
  const [form, setForm] = useState<EndpointFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Endpoint | null>(null);

  const project = useQuery({
    queryKey: ['project', id],
    queryFn: () => fetchProject(id),
    enabled: id !== '',
  });

  const endpoints = useQuery({
    queryKey: ['endpoints', id],
    queryFn: () => fetchEndpoints(id),
    enabled: id !== '',
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['endpoints', id] });
    queryClient.invalidateQueries({ queryKey: ['project', id] });
    queryClient.invalidateQueries({ queryKey: ['projects'] });
  };

  const createMutation = useMutation({
    mutationFn: createEndpoint,
    onSuccess: () => {
      invalidate();
      setCreateOpen(false);
      setFormError(null);
    },
    onError: (error) => setFormError(getApiErrorMessage(error)),
  });

  const updateMutation = useMutation({
    mutationFn: ({ endpointId, payload }: { endpointId: string; payload: Parameters<typeof updateEndpoint>[1] }) =>
      updateEndpoint(endpointId, payload),
    onSuccess: () => {
      invalidate();
      setEditing(null);
      setFormError(null);
    },
    onError: (error) => setFormError(getApiErrorMessage(error)),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ endpointId, isActive }: { endpointId: string; isActive: boolean }) =>
      updateEndpoint(endpointId, { is_active: isActive }),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteEndpoint,
    onSuccess: () => {
      invalidate();
      setDeleting(null);
    },
  });

  const gatewayBase = `${window.location.origin}/gateway/${project.data?.slug ?? ''}`;

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setFormError(null);
    setCreateOpen(true);
  };

  const openEdit = (endpoint: Endpoint) => {
    setForm(toFormState(endpoint));
    setFormError(null);
    setEditing(endpoint);
  };

  const patchForm = (patch: Partial<EndpointFormState>) =>
    setForm((prev) => ({ ...prev, ...patch }));

  const buildPayload = (): Parameters<typeof createEndpoint>[0] | null => {
    if (form.name.trim() === '' || !form.path.startsWith('/')) return null;
    let mockBody: Record<string, unknown> = {};
    if (form.mock_enabled && form.mock_body.trim() !== '') {
      try {
        const parsed: unknown = JSON.parse(form.mock_body);
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
          setFormError('Mock body must be a JSON object.');
          return null;
        }
        mockBody = parsed as Record<string, unknown>;
      } catch {
        setFormError('Mock body must be valid JSON.');
        return null;
      }
    }
    return {
      name: form.name.trim(),
      method: form.method,
      path: form.path.trim(),
      description: form.description,
      mock_enabled: form.mock_enabled,
      mock_status: Number(form.mock_status),
      mock_body: mockBody,
      target_url: form.target_url.trim(),
    };
  };

  const onCreateSubmit = (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    const payload = buildPayload();
    if (!payload || !id) return;
    createMutation.mutate({ ...payload, project: id });
  };

  const onEditSubmit = (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    const payload = buildPayload();
    if (!payload || !editing) return;
    updateMutation.mutate({ endpointId: editing.id, payload });
  };

  const results = endpoints.data?.results ?? [];
  const activeModal = createOpen ? 'create' : editing ? 'edit' : null;

  if (project.isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-24 animate-pulse rounded-xl border border-slate-800 bg-slate-900/60" />
        <div className="h-64 animate-pulse rounded-xl border border-slate-800 bg-slate-900/60" />
      </div>
    );
  }

  if (project.isError || !project.data) {
    return (
      <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">
        Failed to load this project.{' '}
        <Link to="/projects" className="underline">
          Back to projects
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link
        to="/projects"
        className="inline-flex items-center gap-1.5 text-sm text-slate-400 transition hover:text-slate-200"
      >
        <ArrowLeft className="h-4 w-4" />
        All projects
      </Link>

      {/* Project header */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400">
              <FolderKanban className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-xl font-semibold tracking-tight text-slate-100">
                {project.data.name}
              </h2>
              <p className="mt-0.5 font-mono text-xs text-slate-500">
                {project.data.slug} · {project.data.base_path || '/'}
              </p>
              {project.data.description && (
                <p className="mt-2 max-w-2xl text-sm text-slate-400">
                  {project.data.description}
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge tone="indigo">
                  {formatNumber(project.data.endpoints_count)} endpoints
                </Badge>
                {project.data.tags.map((tag) => (
                  <Badge key={tag}>{tag}</Badge>
                ))}
              </div>
            </div>
          </div>

          <div className="flex min-w-0 flex-col items-end gap-1.5">
            <span className="text-xs text-slate-500">Gateway base URL</span>
            <div className="flex min-w-0 items-center gap-2">
              <code className="max-w-md truncate rounded-md border border-slate-800 bg-slate-950/60 px-2.5 py-1.5 font-mono text-xs text-indigo-300">
                {gatewayBase}
              </code>
              <CopyButton value={gatewayBase} compact />
            </div>
          </div>
        </div>
      </section>

      {/* Endpoints */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-200">Endpoints</h3>
            <p className="text-xs text-slate-500">
              Routes exposed through the gateway for this project.
            </p>
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
          >
            <Plus className="h-4 w-4" />
            New endpoint
          </button>
        </div>

        {endpoints.isLoading ? (
          <div className="space-y-2">
            <div className="h-10 animate-pulse rounded bg-slate-800/50" />
            <div className="h-10 animate-pulse rounded bg-slate-800/50" />
            <div className="h-10 animate-pulse rounded bg-slate-800/50" />
          </div>
        ) : endpoints.isError ? (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">
            Failed to load endpoints.
          </div>
        ) : results.length === 0 ? (
          <EmptyState
            title="No endpoints"
            description="Add your first route to start serving traffic through the gateway."
            action={
              <button
                type="button"
                onClick={openCreate}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
              >
                <Plus className="h-4 w-4" />
                New endpoint
              </button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="pb-2 pr-4 font-medium">Method</th>
                  <th className="pb-2 pr-4 font-medium">Path</th>
                  <th className="pb-2 pr-4 font-medium">Name</th>
                  <th className="pb-2 pr-4 text-right font-medium">Requests</th>
                  <th className="pb-2 pr-4 text-center font-medium">Active</th>
                  <th className="pb-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {results.map((endpoint) => (
                  <tr key={endpoint.id} className="text-slate-300">
                    <td className="py-3 pr-4">
                      <MethodBadge method={endpoint.method} />
                    </td>
                    <td className="max-w-[18rem] truncate py-3 pr-4 font-mono text-xs text-slate-300">
                      {endpoint.path}
                      {endpoint.mock_enabled && (
                        <Badge tone="sky" className="ml-2">
                          mock
                        </Badge>
                      )}
                    </td>
                    <td className="max-w-[14rem] truncate py-3 pr-4 text-slate-400">
                      {endpoint.name}
                    </td>
                    <td className="py-3 pr-4 text-right font-medium text-slate-200">
                      {formatNumber(endpoint.request_count)}
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex justify-center">
                        <Toggle
                          label={`Activate ${endpoint.name}`}
                          showLabel={false}
                          checked={endpoint.is_active}
                          disabled={toggleMutation.isPending}
                          tone="emerald"
                          onChange={(isActive) =>
                            toggleMutation.mutate({ endpointId: endpoint.id, isActive })
                          }
                        />
                      </div>
                    </td>
                    <td className="py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(endpoint)}
                          title="Edit endpoint"
                          aria-label={`Edit ${endpoint.name}`}
                          className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-indigo-400"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleting(endpoint)}
                          title="Delete endpoint"
                          aria-label={`Delete ${endpoint.name}`}
                          className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-rose-400"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {activeModal === 'create' && (
        <EndpointModal
          open
          title="New endpoint"
          form={form}
          gatewayUrl={`${gatewayBase}${form.path.startsWith('/') ? form.path : `/${form.path}`}`}
          submitting={createMutation.isPending}
          error={formError}
          onFormChange={patchForm}
          onClose={() => setCreateOpen(false)}
          onSubmit={onCreateSubmit}
        />
      )}

      {activeModal === 'edit' && editing && (
        <EndpointModal
          open
          title="Edit endpoint"
          form={form}
          gatewayUrl={`${gatewayBase}${form.path.startsWith('/') ? form.path : `/${form.path}`}`}
          submitting={updateMutation.isPending}
          error={formError}
          onFormChange={patchForm}
          onClose={() => setEditing(null)}
          onSubmit={onEditSubmit}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        title="Delete endpoint"
        message={`Delete “${deleting?.name ?? ''}” permanently? Requests to this route will return 404.`}
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
