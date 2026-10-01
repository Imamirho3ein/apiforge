import { format, formatDistanceToNow, parseISO } from 'date-fns';
import type { RangeDays, StatusClass, TimeseriesInterval } from './types';

const numberFormatter = new Intl.NumberFormat('en-US');

export function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function formatLatency(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '—';
  if (ms < 1000) return `${ms.toFixed(ms < 10 ? 1 : 0)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return format(parseISO(iso), 'MMM d, yyyy HH:mm');
  } catch {
    return '—';
  }
}

export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return 'Never';
  try {
    return formatDistanceToNow(parseISO(iso), { addSuffix: true });
  } catch {
    return '—';
  }
}

export function statusClassOf(code: number): StatusClass {
  if (code >= 500) return '5xx';
  if (code >= 400) return '4xx';
  if (code >= 300) return '3xx';
  return '2xx';
}

/** Tailwind classes for HTTP status codes: 2xx green, 4xx amber, 5xx red. */
export function statusCodeClass(code: number): string {
  const cls = statusClassOf(code);
  switch (cls) {
    case '2xx':
      return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    case '3xx':
      return 'bg-sky-500/10 text-sky-400 border-sky-500/20';
    case '4xx':
      return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    case '5xx':
      return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
  }
}

export const STATUS_CLASS_COLORS: Record<string, string> = {
  '2xx': '#22c55e',
  '3xx': '#38bdf8',
  '4xx': '#f59e0b',
  '5xx': '#ef4444',
};

/** Tailwind classes for HTTP methods. */
export function methodClass(method: string): string {
  switch (method) {
    case 'GET':
      return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    case 'POST':
      return 'bg-sky-500/10 text-sky-400 border-sky-500/20';
    case 'PUT':
    case 'PATCH':
      return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    case 'DELETE':
      return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
    default:
      return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
  }
}

export function bucketLabel(bucket: string, interval: TimeseriesInterval): string {
  try {
    const date = parseISO(bucket);
    return interval === 'hour' ? format(date, 'HH:mm') : format(date, 'MMM d');
  } catch {
    return bucket;
  }
}

export function rangeDaysLabel(days: RangeDays): string {
  return days === 1 ? 'Last 24 hours' : `Last ${days} days`;
}

/** Convert an http(s) URL (or relative origin) to a ws(s) URL. */
export function toWebSocketUrl(base: string, path: string): string {
  if (!base) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}${path}`;
  }
  const url = new URL(base);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = path;
  url.search = '';
  return url.toString();
}

/** Copy text to the clipboard, falling back to a hidden textarea. */
export async function copyToClipboard(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

/** Convert a `datetime-local` input value to an ISO-8601 UTC string. */
export function toIsoUtc(localValue: string): string | undefined {
  if (!localValue) return undefined;
  const date = new Date(localValue);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}
