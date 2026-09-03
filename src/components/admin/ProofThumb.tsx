import Link from "next/link";

export type ProofThumbProps = {
  /** URL (signed) bukti pembayaran QRIS di Supabase Storage. */
  url: string | null;
  /** Teks alternatif gambar. */
  alt?: string;
};

/**
 * Pratinjau kecil bukti pembayaran beserta tautan ke ukuran penuh.
 *
 * Server-safe (tanpa "use client"). Sengaja memakai <img> biasa, bukan
 * next/image: host bukti pembayaran berasal dari Supabase Storage yang belum
 * tentu terdaftar di images.remotePatterns, dan ukurannya memang kecil.
 */
export function ProofThumb({ url, alt = "Bukti pembayaran" }: ProofThumbProps) {
  if (!url) {
    return <span className="text-xs text-subtle">Belum ada bukti</span>;
  }

  return (
    <Link
      href={url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-sm)] border border-line bg-card p-1 pr-2 transition-[border-color,background-color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:border-line-strong"
      title="Buka bukti pembayaran di tab baru"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={alt}
        width={36}
        height={36}
        loading="lazy"
        className="h-9 w-9 shrink-0 rounded-md border border-line bg-app object-cover"
      />
      <span className="text-xs font-medium text-muted">Lihat</span>
    </Link>
  );
}
