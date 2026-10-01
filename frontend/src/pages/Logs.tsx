import { useEffect, useMemo, useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import {
  ChevronDown,
  Filter,
  Radio,
  RotateCcw,
  ScrollText,
  WifiOff,
} from 'lucide-react';
import { fetchLogsPage } from '../api/logs';
import { fetchProjects } from '../api/projects';
import { HTTP_METHODS } from '../api/endpoints';
import { EmptyState } from '../components/EmptyState';
import { FormSelect, FormTextInput } from '../components/FormField';
import { MethodBadge } from '../components/MethodBadge';
import { Spinner } from '../components/Spinner';
import { StatusBadge } from '../components/StatusBadge';
import { useLiveLogs } from '../hooks/useLiveLogs';
import { getApiErrorMessage } from '../lib/api';
import type { SocketStatus } from '../lib/ws';
import {
  formatDateTime,
  formatLatency,
  formatNumber,
  statusClassOf,
  toIsoUtc,
} from '../lib/format';
import type { HttpMethod, LogEntry, LogFilters, StatusClass } from '../lib/types';

const STATUS_CLASSES: StatusClass[] = ['2xx', '4xx', '5xx'];

/** Upper bound on rendered rows; the REST pages and live buffer are unlimited. */
const MAX_RENDERED_ROWS = 300;

const METHOD_OPTIONS = [
  { value: '', label: 'Any method' },
  ...HTTP_METHODS.map((method) => ({ value: method, label: method })),
];

const STATUS_CLASS_OPTIONS = [
  { value: '', label: 'Any status' },
  ...STATUS_CLASSES.map((value) => ({ value, label: value })),
];

interface LogFilterState {
  search: string;
  project: string;
  method: string;
  statusClass: string;
  since: string;
  until: string;
}

const EMPTY_FILTERS: LogFilterState = {
  search: '',
  project: '',
  method: '',
  statusClass: '',
  since: '',
  until: '',
};

/** Only the applied (non-debounced) filters are sent to the API. */
function toApiFilters(state: LogFilterState): LogFilters {
  const filters: LogFilters = {};
  if (state.search.trim()) filters.search = state.search.trim();
  if (state.project) filters.project = state.project;
  if (state.method) filters.method = state.method as HttpMethod;
  if (state.statusClass) filters.status_class = state.statusClass as StatusClass;
  const since = toIsoUtc(state.since);
  if (since) filters.since = since;
  const until = toIsoUtc(state.until);
  if (until) filters.until = until;
  return filters;
}

/** Client-side match so pushed rows respect the filters the user is looking at. */
function matchesFilters(log: LogEntry, state: LogFilterState): boolean {
  if (state.project && log.project !== state.project) return false;
  if (state.method && log.method !== state.method) return false;
  if (state.statusClass) {
    if (statusClassOf(log.status_code) !== state.statusClass) return false;
  }
  if (state.search.trim()) {
    const needle = state.search.trim().toLowerCase();
    const haystack = `${log.method} ${log.path} ${log.project_name ?? ''} ${
      log.key_name ?? ''
    } ${log.ip_address} ${log.status_code}`.toLowerCase();
    if (!haystack.includes(needle)) return false;
  }
  return true;
}

function mergeRows(fetched: LogEntry[], live: LogEntry[]): LogEntry[] {
  const seen = new Set<string>();
  const rows: LogEntry[] = [];
  for (const log of [...live, ...fetched]) {
    if (seen.has(log.id)) continue;
    seen.add(log.id);
    rows.push(log);
  }
  return rows;
}

function LiveIndicator({ enabled, status }: { enabled: boolean; status: SocketStatus }) {
  if (!enabled) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-800/60 px-2.5 py-1 text-xs font-medium text-slate-400">
        <WifiOff className="h-3 w-3" />
        Live off
      </span>
    );
  }
  if (status !== 'open') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-300">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
        {status === 'connecting' ? 'Connecting' : 'Reconnecting'}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-xs font-medium text-rose-300">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500" />
      </span>
      Live
    </span>
  );
}

function RowSkeleton() {
  return (
    <tr className="border-t border-slate-800/70">
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-3.5 w-full animate-pulse rounded bg-slate-800/70" />
        </td>
      ))}
    </tr>
  );
}

export function Logs() {
  const [draft, setDraft] = useState<LogFilterState>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<LogFilterState>(EMPTY_FILTERS);
  const [liveEnabled, setLiveEnabled] = useState(true);

  // Filters are debounced so typing in the search box does not spam the API.
  useEffect(() => {
    const timer = setTimeout(() => setApplied(draft), 350);
    return () => clearTimeout(timer);
  }, [draft]);

  const projects = useQuery({
    queryKey: ['projects', ''],
    queryFn: () => fetchProjects(),
  });

  const apiFilters = useMemo(() => toApiFilters(applied), [applied]);

  const logs = useInfiniteQuery({
    queryKey: ['logs', apiFilters],
    queryFn: ({ pageParam }) => fetchLogsPage(apiFilters, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.next,
  });

  // Reconnect (and reset the buffer) whenever the user changes the filters.
  const streamKey = JSON.stringify(apiFilters);
  const { liveLogs, status, clearLiveLogs } = useLiveLogs(
    liveEnabled,
    streamKey,
  );

  const fetchedRows = useMemo(
    () => (logs.data?.pages ?? []).flatMap((page) => page.results),
    [logs.data],
  );

  const visibleLiveLogs = useMemo(
    () => liveLogs.filter((log) => matchesFilters(log, applied)),
    [liveLogs, applied],
  );

  const liveLogIds = useMemo(
    () => new Set(visibleLiveLogs.map((log) => log.id)),
    [visibleLiveLogs],
  );

  const rows = useMemo(
    () => mergeRows(fetchedRows, visibleLiveLogs),
    [fetchedRows, visibleLiveLogs],
  );

  // Rendering cap: the DOM stays responsive even with a long cursor history.
  const visibleRows = useMemo(() => rows.slice(0, MAX_RENDERED_ROWS), [rows]);

  const hasFilters =
    applied.search !== '' ||
    applied.project !== '' ||
    applied.method !== '' ||
    applied.statusClass !== '' ||
    applied.since !== '' ||
    applied.until !== '';

  const patch = (key: keyof LogFilterState) => (value: string) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-slate-100">Request logs</h2>
          <p className="text-sm text-slate-400">
            Every call that passed through the gateway, newest first.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <LiveIndicator enabled={liveEnabled} status={status} />
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-400">
            <input
              type="checkbox"
              checked={liveEnabled}
              onChange={(event) => {
                setLiveEnabled(event.target.checked);
                if (!event.target.checked) clearLiveLogs();
              }}
              className="h-4 w-4 rounded border-slate-700 bg-slate-950 text-indigo-600 focus:ring-1 focus:ring-indigo-500"
            />
            Stream
          </label>
        </div>
      </div>

      {/* Filter row */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <FormTextInput
            label="Search"
            type="search"
            value={draft.search}
            onChange={(event) => patch('search')(event.target.value)}
            placeholder="path, key, IP…"
            fieldClassName="xl:col-span-2"
          />
          <FormSelect
            label="Project"
            value={draft.project}
            onChange={(event) => patch('project')(event.target.value)}
            options={[
              { value: '', label: 'All projects' },
              ...(projects.data?.results ?? []).map((project) => ({
                value: project.id,
                label: project.name,
              })),
            ]}
          />
          <FormSelect
            label="Method"
            value={draft.method}
            onChange={(event) => patch('method')(event.target.value)}
            options={METHOD_OPTIONS}
          />
          <FormSelect
            label="Status"
            value={draft.statusClass}
            onChange={(event) => patch('statusClass')(event.target.value)}
            options={STATUS_CLASS_OPTIONS}
          />
          <div className="grid grid-cols-2 gap-2">
            <FormTextInput
              label="Since"
              type="datetime-local"
              value={draft.since}
              onChange={(event) => patch('since')(event.target.value)}
            />
            <FormTextInput
              label="Until"
              type="datetime-local"
              value={draft.until}
              onChange={(event) => patch('until')(event.target.value)}
            />
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2 border-t border-slate-800 pt-3">
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
            <Filter className="h-3.5 w-3.5" />
            {logs.data ? `${formatNumber(rows.length)} shown` : 'Applying filters…'}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setDraft(EMPTY_FILTERS);
                setApplied(EMPTY_FILTERS);
              }}
              disabled={!hasFilters}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 px-2.5 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-slate-800 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <RotateCcw className="h-3 w-3" />
              Reset
            </button>
            <button
              type="button"
              onClick={() => setApplied(draft)}
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-500"
            >
              Apply now
            </button>
          </div>
        </div>
      </section>

      {logs.isError ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">
          <span className="truncate">{getApiErrorMessage(logs.error)}</span>
          <button
            type="button"
            onClick={() => logs.refetch()}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-rose-500/30 px-2.5 py-1 text-xs font-medium text-rose-300 transition hover:bg-rose-500/20"
          >
            <RotateCcw className="h-3 w-3" />
            Retry
          </button>
        </div>
      ) : null}

      <section className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/60">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[62rem] text-sm">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/40 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3 font-medium">Time</th>
                <th className="px-4 py-3 font-medium">Method</th>
                <th className="px-4 py-3 font-medium">Path</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Latency</th>
                <th className="px-4 py-3 font-medium">Project</th>
                <th className="px-4 py-3 font-medium">Key</th>
                <th className="px-4 py-3 font-medium">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {logs.isLoading ? (
                <>
                  <RowSkeleton />
                  <RowSkeleton />
                  <RowSkeleton />
                  <RowSkeleton />
                  <RowSkeleton />
                </>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10">
                    <EmptyState
                      icon={ScrollText}
                      title={hasFilters ? 'No logs match these filters' : 'No requests yet'}
                      description={
                        hasFilters
                          ? 'Widen the status class, method or time window to see more.'
                          : 'Send a request to your gateway base URL and it will appear here instantly.'
                      }
                    />
                  </td>
                </tr>
              ) : (
                visibleRows.map((log, index) => (
                  <tr
                    key={log.id}
                    className={`text-slate-300 transition hover:bg-slate-800/30 ${
                      index === 0 && liveLogIds.has(log.id)
                        ? 'bg-indigo-500/5 ring-1 ring-inset ring-indigo-500/20'
                        : ''
                    }`}
                  >
                    <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-slate-500">
                      {formatDateTime(log.created_at)}
                    </td>
                    <td className="px-4 py-2.5">
                      <MethodBadge method={log.method} />
                    </td>
                    <td
                      className="max-w-[22rem] truncate px-4 py-2.5 font-mono text-xs"
                      title={log.path}
                    >
                      {log.path}
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusBadge code={log.status_code} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right text-slate-400">
                      {formatLatency(log.latency_ms)}
                    </td>
                    <td
                      className="max-w-[10rem] truncate px-4 py-2.5 text-slate-400"
                      title={log.project_name ?? ''}
                    >
                      {log.project_name || <span className="text-slate-600">—</span>}
                    </td>
                    <td
                      className="max-w-[9rem] truncate px-4 py-2.5 text-slate-400"
                      title={log.key_name ?? ''}
                    >
                      {log.key_name || <span className="text-slate-600">anonymous</span>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-slate-500">
                      {log.ip_address}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {logs.hasNextPage && (
          <div className="flex flex-wrap items-center justify-center gap-3 border-t border-slate-800 px-4 py-3">
            <button
              type="button"
              onClick={() => logs.fetchNextPage()}
              disabled={logs.isFetchingNextPage}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition hover:border-slate-600 hover:bg-slate-800 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {logs.isFetchingNextPage ? (
                <Spinner className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
              Load more
            </button>
            <span className="text-xs text-slate-500">
              {formatNumber(fetchedRows.length)} loaded · page {logs.data?.pages.length ?? 1}
              {rows.length > MAX_RENDERED_ROWS
                ? ` · showing latest ${formatNumber(MAX_RENDERED_ROWS)}`
                : ''}
            </span>
          </div>
        )}
      </section>

      <p className="flex items-center gap-1.5 text-xs text-slate-600">
        <Radio className="h-3 w-3 shrink-0" />
        Live rows arrive over <code className="text-slate-500">/ws/logs/</code> and are merged at the
        top of the table; the cursor pages below them are left untouched.
      </p>

      <div className="sr-only" aria-live="polite">
        {liveLogs.length > 0 ? `${liveLogs.length} live log rows buffered` : ''}
      </div>
    </div>
  );
}
