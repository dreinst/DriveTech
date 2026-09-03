import { qrSvg } from "@/lib/qr";
import { getSiteUrl } from "@/lib/site-url";
import { cn } from "@/lib/utils";

export type VerifikasiQrProps = {
  bookingCode: string;
  bookingId: string;
  className?: string;
};

/**
 * QR verifikasi untuk PANITIA (server component). Isinya URL panel admin
 * yang sudah terfilter kode booking ini: /admin/bookings?q=<kode>. Panitia
 * memindai dari layar HP penyewa saat registrasi -> panel admin (butuh login)
 * menampilkan bukti QRIS, nominal, dan waktu kirim (submitted_at) untuk
 * dicocokkan dengan waktu pembayaran pada bukti. Bukan QR pembayaran.
 */
export async function VerifikasiQr({ bookingCode, bookingId, className }: VerifikasiQrProps) {
  const url = new URL("/admin/bookings", getSiteUrl());
  url.searchParams.set("q", bookingCode);
  const svg = await qrSvg(url.toString());

  return (
    <section
      aria-labelledby="verifikasi-qr-judul"
      data-booking-id={bookingId}
      className={cn("rounded-[var(--radius)] border border-line bg-card p-4 sm:p-5", className)}
    >
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        {/* Kotak putih agar kontras QR tetap tinggi di atas tema gelap. */}
        <div
          role="img"
          aria-label={`QR verifikasi booking ${bookingCode} untuk dipindai panitia`}
          className="h-44 w-44 shrink-0 rounded-[var(--radius-sm)] border border-line bg-white p-2 [&>svg]:h-full [&>svg]:w-full"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        <div className="min-w-0 text-center sm:text-left">
          <p
            id="verifikasi-qr-judul"
            className="text-xs font-medium uppercase tracking-[0.08em] text-subtle"
          >
            QR verifikasi panitia
          </p>
          <p className="tabular mt-1 font-mono text-2xl font-bold tracking-widest text-ink">
            {bookingCode}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-muted">
            Tunjukkan QR ini ke panitia saat registrasi di lokasi. Pindaian membuka data booking
            ini di panel admin (bukti, nominal, waktu kirim) untuk dicocokkan dengan waktu
            pembayaran pada bukti.
          </p>
        </div>
      </div>
    </section>
  );
}
