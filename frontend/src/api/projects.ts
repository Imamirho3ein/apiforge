import { api } from '../lib/api';
import type {
  Paginated,
  Project,
  ProjectCreatePayload,
  ProjectUpdatePayload,
} from '../lib/types';

export async function fetchProjects(search?: string): Promise<Paginated<Project>> {
  const { data } = await api.get<Paginated<Project>>('/api/projects/', {
    params: search ? { search } : undefined,
  });
  return data;
}

export async function fetchProject(id: string): Promise<Project> {
  const { data } = await api.get<Project>(`/api/projects/${id}/`);
  return data;
}

export async function createProject(
  payload: ProjectCreatePayload,
): Promise<Project> {
  const { data } = await api.post<Project>('/api/projects/', payload);
  return data;
}

export async function updateProject(
  id: string,
  payload: ProjectUpdatePayload,
): Promise<Project> {
  const { data } = await api.patch<Project>(`/api/projects/${id}/`, payload);
  return data;
}

export async function deleteProject(id: string): Promise<void> {
  await api.delete(`/api/projects/${id}/`);
}
