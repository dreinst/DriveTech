import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type BlockProps = {
  className?: string;
  children?: ReactNode;
};

/** Kartu standar: bg-card tonal, border-line, radius 16px — tanpa bayangan besar. */
export function Card({ className, children }: BlockProps) {
  return (
    <div
      className={cn("rounded-[var(--radius)] border border-line bg-card", className)}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className, children }: BlockProps) {
  return (
    <div className={cn("space-y-1 border-b border-line px-5 py-4 sm:px-6", className)}>
      {children}
    </div>
  );
}

export function CardTitle({ className, children }: BlockProps) {
  return (
    <h2 className={cn("text-lg font-semibold tracking-tight text-ink", className)}>{children}</h2>
  );
}

export function CardDescription({ className, children }: BlockProps) {
  return <p className={cn("text-sm text-muted", className)}>{children}</p>;
}

export function CardContent({ className, children }: BlockProps) {
  return <div className={cn("px-5 py-4 sm:px-6 sm:py-5", className)}>{children}</div>;
}

export function CardFooter({ className, children }: BlockProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-b-[var(--radius)] border-t border-line bg-surface-2/60 px-5 py-4 sm:px-6",
        className,
      )}
    >
      {children}
    </div>
  );
}
