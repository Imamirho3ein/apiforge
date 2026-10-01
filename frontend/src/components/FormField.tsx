import type { ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes, InputHTMLAttributes } from 'react';
import { useId } from 'react';

export const inputClassName =
  'w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 transition focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-60';

interface FieldShellProps {
  label: string;
  htmlFor: string;
  required?: boolean;
  hint?: string;
  error?: string | null;
  className?: string;
  children: ReactNode;
}

/** Label + control + hint/error wrapper shared by every form in the app. */
export function FormField({
  label,
  htmlFor,
  required = false,
  hint,
  error,
  className = '',
  children,
}: FieldShellProps) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-slate-300">
        {label}
        {required && <span className="ml-0.5 text-rose-400">*</span>}
      </label>
      {children}
      {error ? (
        <p className="mt-1 text-xs text-rose-400">{error}</p>
      ) : (
        hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>
      )}
    </div>
  );
}

interface FormTextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string | null;
  fieldClassName?: string;
}

export function FormTextInput({
  label,
  hint,
  error,
  fieldClassName,
  required,
  id,
  ...inputProps
}: FormTextInputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return (
    <FormField
      label={label}
      htmlFor={inputId}
      required={required}
      hint={hint}
      error={error}
      className={fieldClassName}
    >
      <input
        {...inputProps}
        id={inputId}
        required={required}
        aria-invalid={error ? true : undefined}
        className={`${inputClassName} ${inputProps.className ?? ''}`}
      />
    </FormField>
  );
}

interface FormTextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  hint?: string;
  error?: string | null;
  fieldClassName?: string;
}

export function FormTextarea({
  label,
  hint,
  error,
  fieldClassName,
  required,
  id,
  rows = 3,
  ...textareaProps
}: FormTextareaProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return (
    <FormField
      label={label}
      htmlFor={inputId}
      required={required}
      hint={hint}
      error={error}
      className={fieldClassName}
    >
      <textarea
        {...textareaProps}
        id={inputId}
        rows={rows}
        required={required}
        aria-invalid={error ? true : undefined}
        className={`${inputClassName} resize-y ${textareaProps.className ?? ''}`}
      />
    </FormField>
  );
}

export interface SelectOption {
  value: string;
  label: string;
}

interface FormSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  options: SelectOption[];
  hint?: string;
  error?: string | null;
  fieldClassName?: string;
}

export function FormSelect({
  label,
  options,
  hint,
  error,
  fieldClassName,
  required,
  id,
  ...selectProps
}: FormSelectProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return (
    <FormField
      label={label}
      htmlFor={inputId}
      required={required}
      hint={hint}
      error={error}
      className={fieldClassName}
    >
      <select
        {...selectProps}
        id={inputId}
        required={required}
        aria-invalid={error ? true : undefined}
        className={`${inputClassName} ${selectProps.className ?? ''}`}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FormField>
  );
}

const TOGGLE_TRACKS = {
  indigo: 'peer-checked:bg-indigo-600',
  emerald: 'peer-checked:bg-emerald-600',
} as const;

interface ToggleProps {
  /** Doubles as the accessible name when `showLabel` is false. */
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  tone?: keyof typeof TOGGLE_TRACKS;
  showLabel?: boolean;
}

/** Accessible on/off switch backed by a real checkbox. */
export function Toggle({
  label,
  description,
  checked,
  onChange,
  disabled = false,
  tone = 'indigo',
  showLabel = true,
}: ToggleProps) {
  const id = useId();
  return (
    <div className={showLabel ? 'flex items-start justify-between gap-4' : 'inline-flex'}>
      {showLabel && (
        <div className="min-w-0">
          <label htmlFor={id} className="block text-sm font-medium text-slate-200">
            {label}
          </label>
          {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
        </div>
      )}
      <span className="relative inline-flex shrink-0">
        <input
          id={id}
          type="checkbox"
          role="switch"
          aria-label={showLabel ? undefined : label}
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
          className="peer sr-only"
        />
        <span
          className={`h-6 w-11 rounded-full bg-slate-700 transition disabled:opacity-50 ${TOGGLE_TRACKS[tone]}`}
        />
        <span className="pointer-events-none absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition peer-checked:translate-x-5" />
      </span>
    </div>
  );
}

interface FormErrorProps {
  message: string | null;
}

/** Inline error banner used at the top of every submit form. */
export function FormError({ message }: FormErrorProps) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-400"
    >
      {message}
    </p>
  );
}
