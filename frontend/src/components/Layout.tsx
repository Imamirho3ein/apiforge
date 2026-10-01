import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import type { RangeDays } from '../lib/types';

const RANGES: { days: RangeDays; label: string; title: string }[] = [
  { days: 1, label: '1d', title: 'Last 24 hours' },
  { days: 7, label: '7d', title: 'Last 7 days' },
  { days: 30, label: '30d', title: 'Last 30 days' },
];

interface RangeContextValue {
  days: RangeDays;
  setDays: (days: RangeDays) => void;
}

const RangeContext = createContext<RangeContextValue | null>(null);

/**
 * Owns the analytics time window so the selector can live in the topbar while
 * the page below stays a pure consumer. Defaults to 7 days.
 */
export function RangeProvider({ children }: { children: ReactNode }) {
  const [days, setDays] = useState<RangeDays>(7);
  return <RangeContext.Provider value={{ days, setDays }}>{children}</RangeContext.Provider>;
}

export function useRange(): RangeContextValue {
  const value = useContext(RangeContext);
  if (!value) {
    throw new Error('useRange must be used inside <RangeProvider> (see App routes).');
  }
  return value;
}

function RangeSelector({ days, onChange }: { days: RangeDays; onChange: (d: RangeDays) => void }) {
  return (
    <div
      role="group"
      aria-label="Time range"
      className="inline-flex rounded-lg border border-slate-800 bg-slate-900/60 p-0.5"
    >
      {RANGES.map((range) => (
        <button
          key={range.days}
          type="button"
          title={range.title}
          aria-pressed={days === range.days}
          onClick={() => onChange(range.days)}
          className={`rounded-md px-3 py-1 text-sm font-medium transition ${
            days === range.days
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
          }`}
        >
          {range.label}
        </button>
      ))}
    </div>
  );
}

function pageTitle(pathname: string): string {
  if (pathname === '/') return 'Dashboard';
  if (/^\/projects\/[^/]+/.test(pathname)) return 'Project';
  if (pathname.startsWith('/projects')) return 'Projects';
  if (pathname.startsWith('/keys')) return 'API Keys';
  if (pathname.startsWith('/logs')) return 'Logs';
  if (pathname.startsWith('/settings')) return 'Settings';
  return 'Not found';
}

/** Pages that expose a time window in the topbar. */
const RANGE_PAGES = new Set(['/']);

export function Layout() {
  const { pathname } = useLocation();
  const { days, setDays } = useRange();

  return (
    <div className="min-h-screen bg-slate-950">
      <Sidebar />
      <div className="flex min-h-screen min-w-0 flex-col pl-64">
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-4 border-b border-slate-800 bg-slate-950/85 px-6 backdrop-blur">
          <h1 className="truncate text-lg font-semibold tracking-tight text-slate-100">
            {pageTitle(pathname)}
          </h1>
          <div className="flex shrink-0 items-center gap-3">
            {RANGE_PAGES.has(pathname) && (
              <RangeSelector days={days} onChange={setDays} />
            )}
          </div>
        </header>
        <main className="min-w-0 flex-1 px-6 py-6">
          <div className="mx-auto w-full max-w-7xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
