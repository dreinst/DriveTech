import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type BlockProps = {
  className?: string;
  children?: ReactNode;
};

/** Kartu putih standar: rounded-xl, border slate-200, shadow-sm. */
export function Card({ className, children }: BlockProps) {
  return (
    <div className={cn("rounded-xl border border-slate-200 bg-white shadow-sm", className)}>
      {children}
    </div>
  );
}

export function CardHeader({ className, children }: BlockProps) {
  return <div className={cn("space-y-1 border-b border-slate-100 px-4 py-3 sm:px-5", className)}>{children}</div>;
}

export function CardTitle({ className, children }: BlockProps) {
  return <h2 className={cn("text-base font-semibold text-slate-900", className)}>{children}</h2>;
}

export function CardDescription({ className, children }: BlockProps) {
  return <p className={cn("text-sm text-slate-500", className)}>{children}</p>;
}

export function CardContent({ className, children }: BlockProps) {
  return <div className={cn("px-4 py-4 sm:px-5", className)}>{children}</div>;
}

export function CardFooter({ className, children }: BlockProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 border-t border-slate-100 bg-slate-50/60 px-4 py-3 sm:px-5",
        className,
      )}
    >
      {children}
    </div>
  );
}
