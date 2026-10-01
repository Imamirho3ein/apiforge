import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  ChevronRight,
  FolderKanban,
  Globe,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import {
  createProject,
  deleteProject,
  fetchProjects,
  updateProject,
} from '../api/projects';
import { Badge } from '../components/Badge';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { EmptyState } from '../components/EmptyState';
import {
  FormError,
  FormTextarea,
  FormTextInput,
  Toggle,
} from '../components/FormField';
import { Modal } from '../components/Modal';
import { Spinner } from '../components/Spinner';
import { getApiErrorMessage } from '../lib/api';
import { formatDateTime, formatNumber } from '../lib/format';
import type { Project } from '../lib/types';

interface ProjectFormState {
  name: string;
  description: string;
  base_path: string;
  is_public: boolean;
  tags: string;
}

const EMPTY_FORM: ProjectFormState = {
  name: '',
  description: '',
  base_path: '/v1',
  is_public: false,
  tags: '',
};

function toFormState(project: Project): ProjectFormState {
  return {
    name: project.name,
    description: project.description ?? '',
    base_path: project.base_path ?? '',
    is_public: project.is_public,
    tags: project.tags.join(', '),
  };
}

function parseTags(raw: string): string[] {
  return raw
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function Projects() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<ProjectFormState>(EMPTY_FORM);
  const [editing, setEditing] = useState<Project | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Project | null>(null);

  const projects = useQuery({
    queryKey: ['projects', search],
    queryFn: () => fetchProjects(search || undefined),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['projects'] });
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
    setFormError(null);
  };

  const createMutation = useMutation({
    mutationFn: createProject,
    onSuccess: (project) => {
      invalidate();
      closeModal();
      navigate(`/projects/${project.id}`);
    },
    onError: (error) => setFormError(getApiErrorMessage(error)),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Parameters<typeof updateProject>[1] }) =>
      updateProject(id, payload),
    onSuccess: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ['project', editing?.id] });
      closeModal();
    },
    onError: (error) => setFormError(getApiErrorMessage(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteProject,
    onSuccess: () => {
      invalidate();
      setDeleting(null);
    },
  });

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setEditing(null);
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = (project: Project) => {
    setForm(toFormState(project));
    setEditing(project);
    setFormError(null);
    setModalOpen(true);
  };

  const patch = (key: keyof ProjectFormState) => (value: string | boolean) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    const basePath = form.base_path.trim();
    if (basePath !== '' && !basePath.startsWith('/')) {
      setFormError('Base path must start with “/”.');
      return;
    }
    const tags = parseTags(form.tags);
    const payload = {
      name: form.name.trim(),
      ...(form.description.trim() ? { description: form.description.trim() } : {}),
      ...(basePath ? { base_path: basePath } : {}),
      is_public: form.is_public,
      tags,
    };
    if (editing) {
      updateMutation.mutate({ id: editing.id, payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const saving = createMutation.isPending || updateMutation.isPending;
  const results = projects.data?.results ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-slate-100">Projects</h2>
          <p className="text-sm text-slate-400">
            Group related endpoints behind a gateway base path.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
        >
          <Plus className="h-4 w-4" />
          New project
        </button>
      </div>

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search projects…"
          aria-label="Search projects"
          className="w-full rounded-lg border border-slate-700 bg-slate-950/60 py-2 pl-9 pr-3 text-sm text-slate-200 placeholder-slate-500 transition focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>

      {projects.isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-44 animate-pulse rounded-xl border border-slate-800 bg-slate-900/60"
            />
          ))}
        </div>
      ) : projects.isError ? (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">
          {getApiErrorMessage(projects.error)}
        </div>
      ) : results.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title={search ? 'No projects match your search' : 'No projects yet'}
          description="Create your first project to start defining endpoints and routing traffic through the gateway."
          action={
            !search && (
              <button
                type="button"
                onClick={openCreate}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
              >
                <Plus className="h-4 w-4" />
                New project
              </button>
            )
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {results.map((project) => (
              <div
                key={project.id}
                className="group relative rounded-xl border border-slate-800 bg-slate-900/60 p-5 text-left shadow-sm transition hover:border-indigo-500/50 hover:bg-slate-900"
              >
                <button
                  type="button"
                  onClick={() => navigate(`/projects/${project.id}`)}
                  className="block w-full text-left"
                  aria-label={`Open ${project.name}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400">
                      <FolderKanban className="h-4 w-4" />
                    </div>
                    <div className="flex items-center gap-1.5">
                      {project.is_public && (
                        <Badge tone="emerald" title="Public project">
                          <Globe className="h-3 w-3" />
                          Public
                        </Badge>
                      )}
                      <ChevronRight className="h-4 w-4 text-slate-600 transition group-hover:translate-x-0.5 group-hover:text-indigo-400" />
                    </div>
                  </div>
                  <h3 className="mt-3 truncate text-sm font-semibold text-slate-100">
                    {project.name}
                  </h3>
                  <p className="mt-0.5 font-mono text-xs text-slate-500">
                    {project.base_path || '/'} · {project.slug}
                  </p>
                  {project.description && (
                    <p className="mt-2 line-clamp-2 text-sm text-slate-400">
                      {project.description}
                    </p>
                  )}
                </button>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Badge tone="indigo">
                    {formatNumber(project.endpoints_count)} endpoint
                    {project.endpoints_count === 1 ? '' : 's'}
                  </Badge>
                  {project.tags.map((tag) => (
                    <Badge key={tag}>{tag}</Badge>
                  ))}
                </div>

                <div className="mt-3 flex items-center justify-between gap-2">
                  <p className="truncate text-xs text-slate-600">
                    Created {formatDateTime(project.created_at)}
                  </p>
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => openEdit(project)}
                      title="Edit project"
                      aria-label={`Edit ${project.name}`}
                      className="rounded-md p-1.5 text-slate-500 transition hover:bg-slate-800 hover:text-indigo-400"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleting(project)}
                      title="Delete project"
                      aria-label={`Delete ${project.name}`}
                      className="rounded-md p-1.5 text-slate-500 transition hover:bg-slate-800 hover:text-rose-400"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {typeof projects.data?.count === 'number' && projects.data.count > results.length && (
            <p className="text-center text-xs text-slate-600">
              Showing {results.length} of {formatNumber(projects.data.count)} projects.
            </p>
          )}
        </>
      )}

      <Modal
        open={modalOpen}
        title={editing ? 'Edit project' : 'New project'}
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
              form="project-form"
              disabled={saving || form.name.trim() === ''}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
            >
              {saving && <Spinner className="h-4 w-4 border-white/30 border-t-white" />}
              {editing ? 'Save changes' : 'Create project'}
            </button>
          </>
        }
      >
        <form id="project-form" onSubmit={onSubmit} className="space-y-4">
          <FormError message={formError} />

          <FormTextInput
            label="Name"
            required
            value={form.name}
            onChange={(event) => patch('name')(event.target.value)}
            placeholder="Payments API"
            hint={editing ? undefined : 'A URL-safe slug is generated automatically.'}
          />

          <FormTextarea
            label="Description"
            rows={3}
            value={form.description}
            onChange={(event) => patch('description')(event.target.value)}
            placeholder="What this API does…"
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormTextInput
              label="Base path"
              value={form.base_path}
              onChange={(event) => patch('base_path')(event.target.value)}
              placeholder="/v1"
              hint="Must start with “/”."
            />
            <FormTextInput
              label="Tags"
              value={form.tags}
              onChange={(event) => patch('tags')(event.target.value)}
              placeholder="payments, public"
              hint="Comma separated."
            />
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-4">
            <Toggle
              label="Public project"
              description="Public projects are listed in the public directory of the developer portal."
              checked={form.is_public}
              onChange={(checked) => patch('is_public')(checked)}
            />
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        title="Delete project"
        message={`Delete “${deleting?.name ?? ''}” and its ${formatNumber(
          deleting?.endpoints_count ?? 0,
        )} endpoint${deleting?.endpoints_count === 1 ? '' : 's'}? Their log history is removed too. This cannot be undone.`}
        confirmLabel="Delete project"
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
