import Link from "next/link";

export type ProofThumbProps = {
  /** URL publik bukti transfer di Supabase Storage. */
  url: string | null;
  /** Teks alternatif gambar. */
  alt?: string;
};

/**
 * Pratinjau kecil bukti transfer beserta tautan ke ukuran penuh.
 *
 * Server-safe (tanpa "use client"). Sengaja memakai <img> biasa, bukan
 * next/image: host bukti transfer berasal dari Supabase Storage yang belum
 * tentu terdaftar di images.remotePatterns, dan ukurannya memang kecil.
 */
export function ProofThumb({ url, alt = "Bukti transfer" }: ProofThumbProps) {
  if (!url) {
    return <span className="text-xs text-slate-400">Belum ada bukti</span>;
  }

  return (
    <Link
      href={url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-1 pr-2 transition-colors hover:border-slate-400"
      title="Buka bukti transfer di tab baru"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={alt}
        width={36}
        height={36}
        loading="lazy"
        className="h-9 w-9 shrink-0 rounded-md border border-slate-100 bg-slate-50 object-cover"
      />
      <span className="text-xs font-medium text-slate-700">Lihat</span>
    </Link>
  );
}
