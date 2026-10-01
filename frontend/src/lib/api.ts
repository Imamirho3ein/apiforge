import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '../stores/auth';
import type { RefreshResponse } from './types';

export const API_BASE_URL = import.meta.env.VITE_API_URL ?? '';

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

/** Attach the current JWT to every outgoing request. */
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

type RetriableConfig = InternalAxiosRequestConfig & { _retry?: boolean };

/** In-flight refresh promise shared by concurrent 401s. */
let refreshPromise: Promise<string | null> | null = null;

async function performRefresh(): Promise<string | null> {
  const { refreshToken, setTokens, logout } = useAuthStore.getState();
  if (!refreshToken) return null;
  try {
    const { data } = await axios.post<RefreshResponse>(
      `${API_BASE_URL}/api/auth/token/refresh/`,
      { refresh: refreshToken },
      { headers: { 'Content-Type': 'application/json' } },
    );
    // Persist the rotated refresh token whenever the backend issues a new one.
    setTokens(data.access, data.refresh);
    return data.access;
  } catch {
    logout();
    return null;
  }
}

function redirectToLogin(): void {
  if (window.location.pathname !== '/login') {
    window.location.assign('/login');
  }
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as RetriableConfig | undefined;
    const url = original?.url ?? '';
    const isAuthEndpoint =
      url.includes('/api/auth/token') || url.includes('/api/auth/register/');

    if (
      error.response?.status !== 401 ||
      !original ||
      original._retry ||
      isAuthEndpoint
    ) {
      return Promise.reject(error);
    }

    original._retry = true;

    if (!refreshPromise) {
      refreshPromise = performRefresh().finally(() => {
        refreshPromise = null;
      });
    }

    const newToken = await refreshPromise;
    if (!newToken) {
      redirectToLogin();
      return Promise.reject(error);
    }

    original.headers.Authorization = `Bearer ${newToken}`;
    return api(original);
  },
);

/** True when the server rejected our credentials (after any refresh attempt). */
export function isUnauthorizedError(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  const status = error.response?.status;
  return status === 401 || status === 403;
}

/** Turn DRF error payloads (`{detail}` or `{field: [errors]}`) into readable text. */
export function getApiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as
      | Record<string, unknown>
      | string
      | undefined;
    if (data && typeof data === 'object') {
      if (typeof data.detail === 'string') return data.detail;
      const parts: string[] = [];
      for (const [field, value] of Object.entries(data)) {
        if (Array.isArray(value)) {
          parts.push(`${field}: ${value.join(' ')}`);
        } else if (typeof value === 'string') {
          parts.push(value);
        }
      }
      if (parts.length > 0) return parts.join(' — ');
    }
    if (typeof data === 'string' && data.length > 0) return data;
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return 'Something went wrong.';
}
