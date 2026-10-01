import { statusCodeClass } from '../lib/format';

interface StatusBadgeProps {
  code: number;
}

/** Colorized status code: 2xx green, 4xx amber, 5xx red. */
export function StatusBadge({ code }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex min-w-[3rem] justify-center rounded-md border px-2 py-0.5 font-mono text-xs font-semibold ${statusCodeClass(code)}`}
    >
      {code}
    </span>
  );
}
