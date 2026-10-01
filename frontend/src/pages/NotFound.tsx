import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';

export function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-slate-800 bg-slate-900/40 px-6 py-20 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-800/70 text-slate-400">
        <Compass className="h-6 w-6" />
      </span>
      <div>
        <h2 className="text-lg font-semibold text-slate-100">Page not found</h2>
        <p className="mt-1 text-sm text-slate-400">
          The page you are looking for doesn’t exist or was moved.
        </p>
      </div>
      <Link
        to="/"
        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
      >
        Back to dashboard
      </Link>
    </div>
  );
}
