import { api } from '../lib/api';
import type { CursorPaginated, LogEntry, LogFilters } from '../lib/types';

/**
 * Fetch one page of logs. Cursor pagination: pass the `next` URL returned by
 * the previous page to append results; otherwise filters are applied.
 */
export async function fetchLogsPage(
  filters: LogFilters = {},
  nextUrl?: string | null,
): Promise<CursorPaginated<LogEntry>> {
  if (nextUrl) {
    const { data } = await api.get<CursorPaginated<LogEntry>>(nextUrl);
    return data;
  }
  const params: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== null && value !== '') {
      params[key] = value as string | number;
    }
  }
  const { data } = await api.get<CursorPaginated<LogEntry>>('/api/logs/', {
    params,
  });
  return data;
}
