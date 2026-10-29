import type { NextResponse } from "next/server";

import { handleRoute, jsonError, jsonOk, mapResultToResponse, readJsonObject } from "@/app/api/_lib/respond";
import { kodeDealer } from "@/lib/domain/formulir-dealer";
import { rejectPayment, verifyPayment } from "@/lib/services/admin";
import { dealerByKode, lunaskanDealer, tolakBayarDealer } from "@/lib/services/formulir-dealer";
import { catatLog } from "@/lib/services/log";
import { adminPenyetuju, bookingByCode, botAuthorized, ringkasanBot } from "@/lib/services/bot";
import { totalBayar } from "@/lib/domain/harga";
import { formatRupiah } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ code: string }> };

/**
 * POST /api/bot/booking/{kode}/putusan (khusus bot D'Pro Ops, header x-bot-key)
 * Body { aksi: "setujui" | "tolak", alasan?, oleh? } dari tombol Setujui/Tolak di Discord. Memakai
 * verifyPayment/rejectPayment yang sama dengan /drivetechadmin/bookings, jadi email dan kabar WhatsApp ikut terkirim.
 * Kode DL-... = tagihan lapak dealer (kartunya ikut daftar menunggu di /api/bot/rekap): lunas membuat kwitansi.
 */
export async function POST(request: Request, { params }: RouteContext): Promise<NextResponse> {
  return handleRoute("POST /api/bot/booking/[code]/putusan", async () => {
    if (!botAuthorized(request)) return jsonError("Tidak diizinkan.", 401, { code: "UNAUTHORIZED" });
    const { code } = await params;
    const body = (await readJsonObject(request)) ?? {};
    const aksi = body.aksi;
    if (aksi !== "setujui" && aksi !== "tolak") return jsonError("Aksi harus setujui atau tolak.", 400, { code: "VALIDATION" });
    const alasan = typeof body.alasan === "string" && body.alasan.trim() ? body.alasan.trim().slice(0, 200) : "Pembayaran belum kami temukan";

    if (/^DL-/i.test(code)) {
      const d = await dealerByKode(code);
      if (!d) return jsonError("Formulir dealer tidak ditemukan.", 404, { code: "NOT_FOUND" });
      const admin = await adminPenyetuju();
      if (!admin.ok) return mapResultToResponse(admin);
      const hasil = aksi === "setujui" ? await lunaskanDealer(d.id, admin.data, "discord") : await tolakBayarDealer(d.id, alasan);
      if (!hasil.ok) return mapResultToResponse(hasil);
      const terbaru = (await dealerByKode(code)) ?? d;
      await catatLog(
        admin.data,
        aksi === "setujui" ? "dealer_lunas" : "dealer_bayar_tolak",
        `${kodeDealer(d.id)} lewat Discord${aksi === "setujui" ? `, kwitansi ${terbaru.kwitansi_no}` : `: ${alasan}`}`,
      );
      return jsonOk({
        kode: kodeDealer(d.id),
        status: aksi === "setujui" ? `dealer lunas, kwitansi ${terbaru.kwitansi_no}` : "dealer menunggu bukti ulang",
        statusBayar: terbaru.status_bayar,
        totalTeks: formatRupiah(totalBayar({ amount: terbaru.amount ?? 0, unique_code: terbaru.unique_code })),
      });
    }

    const found = await bookingByCode(code);
    if (!found.ok) return mapResultToResponse(found);
    const payment = found.data.payment;
    if (!payment) return jsonError("Booking ini belum punya tagihan.", 409, { code: "NO_PAYMENT" });

    const admin = await adminPenyetuju();
    if (!admin.ok) return mapResultToResponse(admin);
    const hasil = aksi === "setujui" ? await verifyPayment(payment.id, admin.data) : await rejectPayment(payment.id, admin.data, alasan);
    if (!hasil.ok) return mapResultToResponse(hasil);
    await catatLog(
      admin.data,
      aksi === "setujui" ? "verifikasi_pembayaran" : "tolak_pembayaran",
      `${found.data.booking_code} lewat bot WhatsApp`,
    );

    const terbaru = await bookingByCode(code);
    return terbaru.ok ? jsonOk(ringkasanBot(terbaru.data)) : mapResultToResponse(terbaru);
  });
}
