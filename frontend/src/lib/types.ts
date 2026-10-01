// DTOs derived from docs/api-contract.md — keep in sync with the backend.

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type Scope = 'read' | 'write' | 'admin';
export type StatusClass = '2xx' | '3xx' | '4xx' | '5xx';
export type RangeDays = 1 | 7 | 30;
export type TimeseriesInterval = 'hour' | 'day';

/* ------------------------------------------------------------------ auth */

export interface User {
  id: string;
  email: string;
  username: string;
  first_name: string;
  last_name: string;
  avatar_url: string;
  company: string;
  bio: string;
}

export type ProfileUpdate = Partial<
  Pick<User, 'first_name' | 'last_name' | 'company' | 'bio' | 'avatar_url'>
>;

export interface AuthResponse {
  access: string;
  refresh: string;
  user: User;
}

export interface RefreshResponse {
  access: string;
  refresh?: string;
}

export interface RegisterPayload {
  email: string;
  username: string;
  password: string;
  first_name?: string;
  last_name?: string;
}

/* -------------------------------------------------------------- pagination */

export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

/** `/api/logs/` cursor pagination — no `count`, `next` is a cursor URL. */
export interface CursorPaginated<T> {
  next: string | null;
  previous: string | null;
  results: T[];
}

/* -------------------------------------------------------------- projects */

export interface Project {
  id: string;
  name: string;
  slug: string;
  description: string;
  base_path: string;
  is_public: boolean;
  tags: string[];
  endpoints_count: number;
  created_at: string;
  updated_at: string;
}

export interface ProjectCreatePayload {
  name: string;
  description?: string;
  base_path?: string;
  is_public?: boolean;
  tags?: string[];
}

export interface ProjectUpdatePayload extends Partial<ProjectCreatePayload> {}

/* ------------------------------------------------------------- endpoints */

export interface Endpoint {
  id: string;
  project: string;
  name: string;
  method: HttpMethod;
  path: string;
  description: string;
  is_active: boolean;
  mock_enabled: boolean;
  mock_status: number;
  mock_body: Record<string, unknown>;
  target_url: string;
  request_count: number;
  gateway_url: string;
  created_at: string;
  updated_at: string;
}

export interface EndpointPayload {
  project?: string;
  name?: string;
  method?: HttpMethod;
  path?: string;
  description?: string;
  is_active?: boolean;
  mock_enabled?: boolean;
  mock_status?: number;
  mock_body?: Record<string, unknown>;
  target_url?: string;
}

/* --------------------------------------------------------------- api keys */

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  masked_key: string;
  project: string | null;
  project_name: string | null;
  scopes: Scope[];
  rate_limit: number;
  is_active: boolean;
  expires_at: string | null;
  last_used_at: string | null;
  total_requests: number;
  created_at: string;
}

/** Returned only from create/rotate responses. */
export interface ApiKeySecret extends ApiKey {
  api_key: string;
}

export interface ApiKeyCreatePayload {
  name: string;
  project?: string | null;
  scopes?: Scope[];
  rate_limit?: number;
  expires_at?: string | null;
}

export interface ApiKeyUpdatePayload {
  name?: string;
  scopes?: Scope[];
  rate_limit?: number;
  expires_at?: string | null;
}

/** `GET /api/keys/stats/` — aggregate key counters for the dashboard. */
export interface KeyStats {
  total: number;
  active: number;
  revoked: number;
  expired: number;
  total_requests: number;
}

/* ------------------------------------------------------------- analytics */

export interface AnalyticsSummary {
  total_requests: number;
  success_rate: number;
  error_count: number;
  avg_latency_ms: number;
  unique_keys: number;
  projects: number;
  period: {
    days: number;
    since: string;
  };
}

export interface TimeseriesPoint {
  bucket: string;
  total: number;
  errors: number;
}

export interface TimeseriesResponse {
  interval: TimeseriesInterval;
  points: TimeseriesPoint[];
}

export interface StatusClassBucket {
  bucket: string;
  count: number;
}

export interface StatusCodeBucket {
  status: number;
  count: number;
}

export interface StatusDistribution {
  by_class: StatusClassBucket[];
  by_code: StatusCodeBucket[];
}

export interface TopEndpoint {
  method: HttpMethod;
  path: string;
  count: number;
  avg_latency_ms: number;
}

export interface TopEndpointsResponse {
  results: TopEndpoint[];
}

/* ------------------------------------------------------------------- logs */

export interface LogEntry {
  id: string;
  project: string;
  project_name: string;
  endpoint: string | null;
  endpoint_name: string | null;
  method: HttpMethod;
  path: string;
  status_code: number;
  latency_ms: number;
  api_key: string | null;
  key_name: string | null;
  ip_address: string;
  user_agent: string;
  created_at: string;
}

export interface LogFilters {
  search?: string;
  project?: string;
  method?: HttpMethod;
  status_class?: StatusClass;
  min_status?: number;
  max_status?: number;
  since?: string;
  until?: string;
}

export interface WsLogMessage {
  type: 'log.created';
  data: LogEntry;
}
