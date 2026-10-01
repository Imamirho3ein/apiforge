import { methodClass } from '../lib/format';

interface MethodBadgeProps {
  method: string;
}

export function MethodBadge({ method }: MethodBadgeProps) {
  return (
    <span
      className={`inline-flex min-w-[4.5rem] justify-center rounded-md border px-2 py-0.5 font-mono text-xs font-semibold ${methodClass(method)}`}
    >
      {method}
    </span>
  );
}
