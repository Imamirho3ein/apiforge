import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  accent?: 'indigo' | 'emerald' | 'amber' | 'sky';
}

const ACCENTS: Record<NonNullable<StatCardProps['accent']>, string> = {
  indigo: 'bg-indigo-500/10 text-indigo-400',
  emerald: 'bg-emerald-500/10 text-emerald-400',
  amber: 'bg-amber-500/10 text-amber-400',
  sky: 'bg-sky-500/10 text-sky-400',
};

export function StatCard({ title, value, hint, icon: Icon, accent = 'indigo' }: StatCardProps) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 shadow-sm transition hover:border-slate-700">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm text-slate-400">{title}</p>
          <p className="mt-2 truncate text-2xl font-semibold tracking-tight text-slate-100">
            {value}
          </p>
          {hint && <p className="mt-1 truncate text-xs text-slate-500">{hint}</p>}
        </div>
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${ACCENTS[accent]}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}
