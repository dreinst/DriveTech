import type { ReactNode } from "react";

export type AlertTone = "info" | "success" | "warning" | "error";

/** Kartu lembut bg-*-soft + ikon kecil berwarna — tanpa strip kiri. */
const TONE_CLASS: Record<AlertTone, string> = {
  info: "bg-accent-soft",
  success: "bg-ok-soft",
  warning: "bg-warn-soft",
  error: "bg-danger-soft",
};

const ICON_CLASS: Record<AlertTone, string> = {
  info: "text-accent",
  success: "text-ok",
  warning: "text-warn",
  error: "text-danger",
};

/** Ikon inline (tanpa dependency ikon eksternal). */
function AlertIcon({ tone }: { tone: AlertTone }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 20 20",
    fill: "none" as const,
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: `mt-0.5 shrink-0 ${ICON_CLASS[tone]}`,
    "aria-hidden": true,
  };

  if (tone === "success") {
    return (
      <svg {...common}>
        <circle cx="10" cy="10" r="7.5" />
        <path d="M6.8 10.2 9 12.4l4.2-4.6" />
      </svg>
    );
  }

  if (tone === "warning") {
    return (
      <svg {...common}>
        <path d="M10 3.2 2.8 16.2h14.4L10 3.2Z" />
        <path d="M10 8.2v3.4" />
        <path d="M10 13.9h.01" />
      </svg>
    );
  }

  if (tone === "error") {
    return (
      <svg {...common}>
        <circle cx="10" cy="10" r="7.5" />
        <path d="M7.6 7.6l4.8 4.8" />
        <path d="M12.4 7.6l-4.8 4.8" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <circle cx="10" cy="10" r="7.5" />
      <path d="M10 9.2v4.2" />
      <path d="M10 6.5h.01" />
    </svg>
  );
}

export type AlertProps = {
  tone: AlertTone;
  title?: string;
  children?: ReactNode;
};

/** Pesan status: info, berhasil, peringatan, atau galat. */
export function Alert({ tone, title, children }: AlertProps) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`flex items-start gap-2.5 rounded-[var(--radius-sm)] px-4 py-3.5 text-sm text-ink ${TONE_CLASS[tone]}`}
    >
      <AlertIcon tone={tone} />
      <div className="min-w-0 space-y-0.5">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className="[&_a]:underline [&_a]:underline-offset-2">{children}</div> : null}
      </div>
    </div>
  );
}
