import type { Metadata } from "next";

import { BayarDealerAksi } from "@/components/admin/BayarDealerAksi";
import { PaymentVerifyForm } from "@/components/admin/PaymentVerifyForm";
import { ProofThumb } from "@/components/admin/ProofThumb";
import { Alert } from "@/components/ui/Alert";
import { buttonClass } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Textarea } from "@/components/ui/Field";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { kodeDealer } from "@/lib/domain/formulir-dealer";
import { totalBayar } from "@/lib/domain/harga";
import { requireAdmin } from "@/lib/services/auth";
import { bacaNominal, MAKS_NOMINAL, tagihanCocok } from "@/lib/services/cocok";
import { dealerCocok } from "@/lib/services/formulir-dealer";
import { resolveProofUrl } from "@/lib/storage";
import { formatRupiah, formatTanggalWaktu, slotDisplayName } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Cocokkan Pembayaran",
  description: "Cocokkan nominal yang masuk di mutasi QRIS dengan tagihan booking.",
};

type Props = { searchParams: Promise<{ n?: string | string[] }> };

export default async function AdminCocokPage({ searchParams }: Props) {
  await requireAdmin();
  const { n } = await searchParams;
  const tempelan = (Array.isArray(n) ? n.join("\n") : n) ?? "";
  const nominal = bacaNominal(tempelan);
  const hasil = await tagihanCocok(nominal);
  const dealerHasil = await dealerCocok(nominal);
  const dealer = dealerHasil.ok ? dealerHasil.data : [];
  const tagihan = hasil.ok
    ? await Promise.all(
        hasil.data.map(async (booking) => ({
          booking,
          bukti: await resolveProofUrl(booking.payment?.proof_url ?? null),
        })),
      )
    : [];

  return (
    <div className="space-y-6">
      <header className="min-w-0 space-y-2">
        <h1 className="text-3xl font-bold tracking-[-0.02em] text-ink sm:text-4xl">
          Cocokkan Pembayaran
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted sm:text-base">
          Tempel nominal yang masuk di mutasi QRIS. Setiap tagihan punya kode unik, jadi nominal
          yang sama persis dengan total bayarnya (tagihan, kode unik, dan biaya layanan QRIS bila
          ada) menunjuk ke satu booking atau satu tagihan lapak dealer.
        </p>
      </header>

      <Card className="p-5 sm:p-6">
        <form method="get" className="space-y-3">
          <Field
            label="Nominal masuk"
            htmlFor="cocok-nominal"
            hint={`Satu nominal per baris, paling banyak ${MAKS_NOMINAL}. Contoh: 250412 atau Rp250.412.`}
          >
            <Textarea
              id="cocok-nominal"
              name="n"
              rows={4}
              defaultValue={tempelan}
              inputMode="numeric"
              placeholder="250412"
              className="tabular font-mono"
              required
            />
          </Field>
          <button type="submit" className={buttonClass("primary", "md")}>
            Cocokkan
          </button>
        </form>
      </Card>

      {!hasil.ok ? (
        <Alert tone="error" title="Tagihan belum bisa dicocokkan">
          {hasil.error}
        </Alert>
      ) : null}

      {tempelan.trim() && nominal.length === 0 ? (
        <Alert tone="warning" title="Tidak ada nominal yang terbaca">
          Isi dengan angka rupiah, satu nominal per baris.
        </Alert>
      ) : null}

      {hasil.ok
        ? nominal.map((angka) => {
            const cocok = tagihan.filter(
              ({ booking }) => booking.payment && totalBayar(booking.payment) === angka,
            );
            const cocokDealer = dealer.filter(
              (d) => totalBayar({ amount: d.amount ?? 0, unique_code: d.unique_code }) === angka,
            );
            const jumlahCocok = cocok.length + cocokDealer.length;
            return (
              <Card key={angka}>
                <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-5 py-4 sm:px-6">
                  <h2 className="tabular text-lg font-semibold tracking-tight text-ink">
                    {formatRupiah(angka)}
                  </h2>
                  <p className={`text-sm ${jumlahCocok === 1 ? "text-ok" : "text-warn"}`}>
                    {jumlahCocok === 0
                      ? "Tidak ada tagihan dengan nominal ini"
                      : jumlahCocok === 1
                        ? "1 tagihan cocok"
                        : `${jumlahCocok} tagihan cocok, periksa waktu bayarnya`}
                  </p>
                </div>
                {cocok.length > 0 ? (
                  <ul className="divide-y divide-line">
                    {cocok.map(({ booking, bukti }) => (
                      <li
                        key={booking.id}
                        className="flex flex-col gap-3 px-5 py-4 sm:px-6 lg:flex-row lg:items-start lg:justify-between"
                      >
                        <div className="min-w-0 space-y-1.5">
                          <p className="font-mono text-sm font-semibold text-ink">
                            {booking.booking_code}
                          </p>
                          <p className="text-sm text-ink">
                            {booking.tenant.name}
                            <span className="text-muted"> · {booking.tenant.phone ?? "tanpa nomor"}</span>
                          </p>
                          <p className="text-xs text-muted">
                            {booking.slot.zone.name}, {slotDisplayName(booking.slot)} · tagihan{" "}
                            {formatRupiah(booking.payment?.amount)} + kode unik{" "}
                            {booking.payment?.unique_code ?? 0}
                          </p>
                          <p className="text-xs text-muted">
                            Bukti dikirim:{" "}
                            {booking.payment?.submitted_at
                              ? `${formatTanggalWaktu(booking.payment.submitted_at)} WIB`
                              : "belum ada"}
                          </p>
                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            <StatusBadge status={booking.status} kind="booking" />
                            {booking.payment ? (
                              <StatusBadge status={booking.payment.status} kind="payment" />
                            ) : null}
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-wrap items-start gap-3">
                          <ProofThumb url={bukti} alt={`Bukti ${booking.booking_code}`} />
                          <PaymentVerifyForm
                            paymentId={booking.payment?.id ?? null}
                            paymentStatus={booking.payment?.status ?? null}
                            bookingStatus={booking.status}
                            bookingCode={booking.booking_code}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {cocokDealer.length > 0 ? (
                  <ul className="divide-y divide-line border-t border-line">
                    {cocokDealer.map((d) => (
                      <li
                        key={d.id}
                        className="flex flex-col gap-3 px-5 py-4 sm:px-6 lg:flex-row lg:items-start lg:justify-between"
                      >
                        <div className="min-w-0 space-y-1.5">
                          <p className="font-mono text-sm font-semibold text-ink">{kodeDealer(d.id)} · lapak dealer</p>
                          <p className="text-sm text-ink">
                            {d.data.nama_dealer}
                            <span className="text-muted"> · {d.data.wa_pic || "tanpa nomor"}</span>
                          </p>
                          <p className="text-xs text-muted">
                            tagihan {formatRupiah(d.amount)} + kode unik {d.unique_code ?? 0} · bukti{" "}
                            {d.submitted_at ? `${formatTanggalWaktu(d.submitted_at)} WIB` : "belum ada"}
                          </p>
                          <p className="text-xs font-medium text-ink">
                            {d.status_bayar === "lunas" ? `Lunas, kwitansi ${d.kwitansi_no}` : d.status_bayar === "dicek" ? "Bukti dicek" : "Belum bayar"}
                          </p>
                        </div>
                        <BayarDealerAksi id={d.id} kode={kodeDealer(d.id)} status={d.status_bayar} lewat="cocok" />
                      </li>
                    ))}
                  </ul>
                ) : null}
              </Card>
            );
          })
        : null}
    </div>
  );
}
