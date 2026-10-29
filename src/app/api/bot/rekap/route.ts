import type { NextResponse } from "next/server";

import { handleRoute, jsonError, jsonOk } from "@/app/api/_lib/respond";
import { coba, sql } from "@/lib/db";
import { totalBayar } from "@/lib/domain/harga";
import { hitungBiaya, kodeDealer, LAPAK_DEALER, TANGGAL_DEALER } from "@/lib/domain/formulir-dealer";
import { botAuthorized } from "@/lib/services/bot";
import { listPendaftaranDealer } from "@/lib/services/formulir-dealer";
import { listPesanan } from "@/lib/services/jalan-sehat";
import { getSiteUrl } from "@/lib/site-url";
import { resolveProofUrl } from "@/lib/storage";
import { formatRupiah, slotDisplayName } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Baris = {
  kode: string; status: string; status_bayar: string | null; amount: number | string | null; unique_code: number | null;
  proof_url: string | null; submitted_at: string | null; nama: string; hp: string | null; jenis: string;
  slot_number: number | null; slot_label: string | null; zona: string; tanggal: string[] | null;
};

/**
 * GET /api/bot/rekap (khusus bot D'Pro Ops, header x-bot-key)
 * Tracking pembayaran DriveTech untuk Discord: bukti yang menunggu verifikasi (dengan URL bukti bertanda tangan
 * berumur 1 jam), total pemasukan terverifikasi, dan jumlah tagihan belum dibayar, untuk booking lapak dan untuk
 * pesanan jalan sehat (kunci jalanSehat). Bukti bayar lapak dealer (kode DL-...) ikut di `menunggu` supaya kartu
 * Setujui/Tolak Discord yang sudah ada langsung dipakai (putusannya diteruskan route booking ke dealer); totalnya
 * di kunci dealer. Dengan ?hp=<nomor> hanya
 * membalas booking milik nomor itu (dicocokkan 10 digit terakhir), dipakai kartu chat pelanggan.
 */
export async function GET(request: Request): Promise<NextResponse> {
  return handleRoute("GET /api/bot/rekap", async () => {
    if (!botAuthorized(request)) return jsonError("Tidak diizinkan.", 401, { code: "UNAUTHORIZED" });
    const hp = (new URL(request.url).searchParams.get("hp") ?? "").replace(/\D/g, "").slice(-10);
    if (hp && hp.length < 10) return jsonOk({ booking: [] });

    const r = await coba(sql<Baris[]>`
      select b.booking_code as kode, b.status, p.status as status_bayar, p.amount, p.unique_code, p.proof_url,
             p.submitted_at, t.name as nama, t.phone as hp, t.tenant_type as jenis, s.slot_number, s.slot_label, z.name as zona,
             (select array_agg(to_char(d.event_date, 'DD/MM') order by d.event_date) from booking_dates d
               where d.booking_id = b.id and d.is_active) as tanggal
        from bookings b
        join tenants t on t.id = b.tenant_id
        join slots s on s.id = b.slot_id
        join zones z on z.id = s.zone_id
        left join admin_fee_payments p on p.booking_id = b.id
       where ${hp ? sql`right(regexp_replace(coalesce(t.phone, ''), '\\D', '', 'g'), 10) = ${hp}` : sql`true`}
       order by b.created_at`);
    if (r.error) return jsonError("Gagal memuat rekap.", 502, { code: "DB" });

    const situs = getSiteUrl().replace(/\/+$/, "");
    const ringkas = async (x: Baris) => {
      const total = x.amount === null ? null : totalBayar({ amount: x.amount, unique_code: x.unique_code });
      const bukti = await resolveProofUrl(x.proof_url);
      return {
        kode: x.kode, status: x.status, statusBayar: x.status_bayar, nama: x.nama, hp: x.hp, jenis: x.jenis,
        lapak: `${slotDisplayName(x)} (${x.zona})`, tanggal: x.tanggal ?? [], kodeUnik: x.unique_code,
        total, totalTeks: total === null ? null : formatRupiah(total),
        bukti: bukti && bukti.startsWith("/") ? situs + bukti : bukti,
        buktiAt: x.submitted_at,
      };
    };

    if (hp) return jsonOk({ booking: await Promise.all(r.data.map(ringkas)) });
    const lunas = r.data.filter((x) => x.status_bayar === "verified" && x.amount !== null);
    const js = await listPesanan();
    if (!js.ok) return jsonError("Gagal memuat pesanan jalan sehat.", 502, { code: "DB" });
    const jsLunas = js.data.filter((x) => x.status === "lunas");
    const dl = await listPendaftaranDealer();
    if (!dl.ok) return jsonError("Gagal memuat tagihan dealer.", 502, { code: "DB" });
    const dlTagihan = dl.data.filter((x) => x.amount !== null);
    const dlLunas = dlTagihan.filter((x) => x.status_bayar === "lunas");
    const dlTotal = (x: (typeof dlTagihan)[number]) => totalBayar({ amount: x.amount ?? 0, unique_code: x.unique_code });
    const dlMenunggu = await Promise.all(dlTagihan.filter((x) => x.status_bayar === "dicek").map(async (x) => {
      const bukti = await resolveProofUrl(x.proof_url);
      const total = dlTotal(x);
      const lapak = LAPAK_DEALER.filter((l) => Number(x.data[`jumlah_${l.kode}`]) > 0)
        .map((l) => `${x.data[`jumlah_${l.kode}`]} ${l.kode.toUpperCase()}`).join(", ");
      return {
        kode: kodeDealer(x.id), status: "dealer", statusBayar: x.status_bayar, nama: x.data.nama_dealer ?? "",
        hp: x.data.wa_pic ?? null, jenis: "dealer", lapak: `Dealer ${lapak} (${hitungBiaya(x.data).tanggal} tanggal)`,
        tanggal: TANGGAL_DEALER.filter((_, i) => x.data[`tgl_${i + 1}`] === "ya"), kodeUnik: x.unique_code,
        total, totalTeks: formatRupiah(total),
        bukti: bukti && bukti.startsWith("/") ? situs + bukti : bukti,
        buktiAt: x.submitted_at,
      };
    }));
    return jsonOk({
      menunggu: [
        ...(await Promise.all(r.data.filter((x) => x.status_bayar === "submitted" && x.status !== "cancelled").map(ringkas))),
        ...dlMenunggu,
      ],
      pemasukan: lunas.reduce((n, x) => n + totalBayar({ amount: x.amount ?? 0, unique_code: x.unique_code }), 0),
      lunas: lunas.length,
      belumBayar: r.data.filter((x) => x.status_bayar === "unpaid" && x.status === "pending_payment").length,
      jalanSehat: {
        menunggu: await Promise.all(js.data.filter((x) => x.status === "dicek").map(async (x) => {
          const bukti = await resolveProofUrl(x.proof_url);
          const total = totalBayar(x);
          return {
            kode: x.kode, nama: x.nama, hp: x.phone, domisili: x.domisili, jumlah: x.jumlah, sumber: x.sumber,
            kodeUnik: x.unique_code, total, totalTeks: formatRupiah(total),
            bukti: bukti && bukti.startsWith("/") ? situs + bukti : bukti, buktiAt: x.submitted_at,
          };
        })),
        pemasukan: jsLunas.reduce((n, x) => n + totalBayar(x), 0),
        lunas: jsLunas.length,
        peserta: jsLunas.reduce((n, x) => n + x.jumlah, 0),
        belumBayar: js.data.filter((x) => x.status === "menunggu").length,
      },
      dealer: {
        menunggu: dlMenunggu.length,
        pemasukan: dlLunas.reduce((n, x) => n + dlTotal(x), 0),
        lunas: dlLunas.length,
        belumBayar: dlTagihan.filter((x) => x.status_bayar === "belum").length,
      },
    });
  });
}
