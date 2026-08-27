import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

const BASE_CLASS =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg border font-medium leading-none transition-colors disabled:pointer-events-none disabled:opacity-50";

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: "border-slate-900 bg-slate-900 text-white hover:border-slate-700 hover:bg-slate-700",
  secondary: "border-slate-300 bg-white text-slate-900 hover:bg-slate-50",
  ghost: "border-transparent bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900",
  danger: "border-red-600 bg-red-600 text-white hover:border-red-700 hover:bg-red-700",
};

const SIZE_CLASS: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
};

/**
 * Kelas tombol tanpa elemen <button> — dipakai untuk <Link> atau <a>.
 * Contoh: <Link href="/" className={buttonClass("secondary", "sm")}>Kembali</Link>
 */
export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md"): string {
  return cn(BASE_CLASS, VARIANT_CLASS[variant], SIZE_CLASS[size]);
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

/** Tombol dasar. Defaultnya type="button"; untuk submit form pakai <SubmitButton />. */
export function Button({
  variant = "primary",
  size = "md",
  className,
  type = "button",
  ...props
}: ButtonProps) {
  return <button type={type} className={cn(buttonClass(variant, size), className)} {...props} />;
}
