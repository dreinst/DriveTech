import { forwardRef } from "react";
import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { cn } from "@/lib/utils";

/**
 * PENTING (mobile): ukuran teks di HP WAJIB >= 16px (`text-base`). Kalau lebih
 * kecil, iOS Safari otomatis MEMPERBESAR halaman begitu kolom disentuh, dan
 * pengguna awam sering tidak tahu cara mengembalikannya. Di layar >= sm ukuran
 * dikembalikan ke 14px agar tampilan desktop tetap seperti semula.
 */
const CONTROL_CLASS =
  "block w-full rounded-xl border border-line bg-surface-2 px-3.5 py-2 text-base sm:text-sm text-ink transition-[border-color,box-shadow] duration-150 placeholder:text-subtle hover:border-line-strong focus:border-accent focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft)] disabled:cursor-not-allowed disabled:bg-surface-3 disabled:text-muted aria-[invalid=true]:border-danger";

export type FieldProps = {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
};

/** Pembungkus satu isian form: label, kontrol, keterangan, dan pesan galat. */
export function Field({ label, htmlFor, hint, error, required, children }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-ink">
        {label}
        {required ? (
          <span className="ml-0.5 text-danger" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>
      {children}
      {hint && !error ? <p className="text-xs text-muted">{hint}</p> : null}
      {error ? (
        <p className="text-xs font-medium text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(CONTROL_CLASS, "min-h-11", className)} {...props} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, ...props }, ref) {
    return <select ref={ref} className={cn(CONTROL_CLASS, "min-h-11 pr-8", className)} {...props} />;
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, rows = 3, ...props }, ref) {
    return <textarea ref={ref} rows={rows} className={cn(CONTROL_CLASS, "resize-y", className)} {...props} />;
  },
);
