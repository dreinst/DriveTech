import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type ButtonVariant = "primary" | "accent" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

const BASE_CLASS =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full leading-none transition-[transform,opacity,background-color,border-color,color,box-shadow] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]";

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  /* Pil oranye teks gelap — aksi utama standar (CTA tema gelap). */
  primary: "bg-accent font-semibold text-[#0a0a0a] hover:bg-[var(--accent-hover)]",
  /* Sama dengan primary — dipertahankan untuk aksi pembayaran/konfirmasi penting. */
  accent: "bg-accent font-semibold text-[#0a0a0a] hover:bg-[var(--accent-hover)]",
  /* Pil kartu gelap berbingkai. */
  secondary:
    "border border-line bg-card font-medium text-ink hover:border-line-strong hover:bg-surface-3",
  /* Hanya teks. */
  ghost: "bg-transparent font-medium text-muted hover:bg-ink/5 hover:text-ink",
  /* Merah lembut untuk aksi destruktif. */
  danger: "bg-danger-soft font-medium text-danger hover:bg-danger hover:text-white",
};

const SIZE_CLASS: Record<ButtonSize, string> = {
  sm: "h-9 px-4 text-xs",
  md: "h-11 px-6 text-sm",
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
