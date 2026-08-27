import Link from "next/link";
import type { ReactNode } from "react";

export type PageHeaderProps = {
  title: string;
  description?: string;
  backHref?: string;
  backLabel?: string;
  action?: ReactNode;
};

/** Judul halaman + deskripsi, tautan kembali opsional, dan aksi di kanan. */
export function PageHeader({ title, description, backHref, backLabel, action }: PageHeaderProps) {
  return (
    <header className="mb-5 space-y-2">
      {backHref ? (
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-slate-900"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 4.5 6.5 10l5.5 5.5" />
          </svg>
          {backLabel ?? "Kembali"}
        </Link>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">{title}</h1>
          {description ? <p className="max-w-2xl text-sm text-slate-500">{description}</p> : null}
        </div>
        {action ? <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div> : null}
      </div>
    </header>
  );
}
