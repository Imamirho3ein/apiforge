import type { ReactNode } from 'react';

type BadgeTone = 'default' | 'green' | 'emerald' | 'amber' | 'red' | 'indigo' | 'sky';

const TONES: Record<BadgeTone, string> = {
  default: 'border-slate-700 bg-slate-800/60 text-slate-300',
  green: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400',
  emerald: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400',
  amber: 'border-amber-500/20 bg-amber-500/10 text-amber-400',
  red: 'border-rose-500/20 bg-rose-500/10 text-rose-400',
  indigo: 'border-indigo-500/20 bg-indigo-500/10 text-indigo-400',
  sky: 'border-sky-500/20 bg-sky-500/10 text-sky-400',
};

interface BadgeProps {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
  title?: string;
}

export function Badge({ children, tone = 'default', className = '', title }: BadgeProps) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
