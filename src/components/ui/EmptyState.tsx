import type { ReactNode } from "react";

export type EmptyStateProps = {
  title: string;
  description?: string;
  action?: ReactNode;
};

/** Tampilan saat daftar kosong / data tidak ditemukan. */
export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[var(--radius)] border border-dashed border-line-strong bg-card px-6 py-12 text-center">
      <span
        className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-surface-3 text-muted"
        aria-hidden="true"
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="4" width="18" height="16" rx="2.5" />
          <path d="M3 9h18" />
          <path d="M9 13.5h6" />
        </svg>
      </span>
      <p className="text-sm font-semibold text-ink">{title}</p>
      {description ? <p className="mt-1 max-w-md text-sm text-muted">{description}</p> : null}
      {action ? <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}
