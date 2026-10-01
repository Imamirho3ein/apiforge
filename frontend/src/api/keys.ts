import { api } from '../lib/api';
import type {
  ApiKey,
  ApiKeyCreatePayload,
  ApiKeySecret,
  ApiKeyUpdatePayload,
  KeyStats,
  Paginated,
} from '../lib/types';

export async function fetchKeys(
  search?: string,
  project?: string,
): Promise<Paginated<ApiKey>> {
  const { data } = await api.get<Paginated<ApiKey>>('/api/keys/', {
    params: {
      ...(search ? { search } : {}),
      ...(project ? { project } : {}),
    },
  });
  return data;
}

/** Aggregate counters used by the dashboard "Active keys" card. */
export async function fetchKeyStats(): Promise<KeyStats> {
  const { data } = await api.get<KeyStats>('/api/keys/stats/');
  return data;
}

/** 201 response includes the plaintext `api_key` — shown to the user once. */
export async function createKey(payload: ApiKeyCreatePayload): Promise<ApiKeySecret> {
  const { data } = await api.post<ApiKeySecret>('/api/keys/', payload);
  return data;
}

export async function updateKey(
  id: string,
  payload: ApiKeyUpdatePayload,
): Promise<ApiKey> {
  const { data } = await api.patch<ApiKey>(`/api/keys/${id}/`, payload);
  return data;
}

export async function revokeKey(id: string): Promise<ApiKey> {
  const { data } = await api.post<ApiKey>(`/api/keys/${id}/revoke/`);
  return data;
}

/** Returns the key with a brand-new plaintext `api_key`. */
export async function rotateKey(id: string): Promise<ApiKeySecret> {
  const { data } = await api.post<ApiKeySecret>(`/api/keys/${id}/rotate/`);
  return data;
}

export async function deleteKey(id: string): Promise<void> {
  await api.delete(`/api/keys/${id}/`);
}
