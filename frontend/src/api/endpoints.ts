import { api } from '../lib/api';
import type {
  Endpoint,
  EndpointPayload,
  HttpMethod,
  Paginated,
} from '../lib/types';

export async function fetchEndpoints(
  project: string,
  search?: string,
): Promise<Paginated<Endpoint>> {
  const { data } = await api.get<Paginated<Endpoint>>('/api/endpoints/', {
    params: { project, ...(search ? { search } : {}) },
  });
  return data;
}

export async function createEndpoint(
  payload: EndpointPayload,
): Promise<Endpoint> {
  const { data } = await api.post<Endpoint>('/api/endpoints/', payload);
  return data;
}

export async function updateEndpoint(
  id: string,
  payload: EndpointPayload,
): Promise<Endpoint> {
  const { data } = await api.patch<Endpoint>(`/api/endpoints/${id}/`, payload);
  return data;
}

export async function deleteEndpoint(id: string): Promise<void> {
  await api.delete(`/api/endpoints/${id}/`);
}

export const HTTP_METHODS: HttpMethod[] = [
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
];
