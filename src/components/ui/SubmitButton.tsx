"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { buttonClass } from "@/components/ui/Button";
import type { ButtonSize, ButtonVariant } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

export type SubmitButtonProps = {
  children: ReactNode;
  pendingText?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
};

/** Tombol submit form yang otomatis nonaktif selama server action berjalan. */
export function SubmitButton({
  children,
  pendingText,
  variant = "primary",
  size = "md",
  className,
}: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={cn(buttonClass(variant, size), className)}
    >
      {pending ? (
        <>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            className="animate-spin"
            aria-hidden="true"
          >
            <path d="M12 3a9 9 0 1 0 9 9" />
          </svg>
          {pendingText ?? "Memproses…"}
        </>
      ) : (
        children
      )}
    </button>
  );
}
