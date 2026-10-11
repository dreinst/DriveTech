import type { NextResponse } from "next/server";

import { handleRoute, jsonError, jsonOk, mapResultToResponse } from "@/app/api/_lib/respond";
import { MAX_PROOF_BYTES, STORAGE_BUCKET_BUKTI } from "@/lib/domain/constants";
import { submitPayment } from "@/lib/services/booking";
import { bookingByCode, botAuthorized, ringkasanBot } from "@/lib/services/bot";
import { simpanBerkas } from "@/lib/storage";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ code: string }> };

const EKSTENSI: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/**
 * POST /api/bot/booking/{kode}/bukti (khusus bot, header x-bot-key)
 * Body = berkas gambar bukti bayar yang dikirim penyewa lewat WhatsApp (Content-Type image/jpeg|png|webp).
 * Berkas disimpan di folder privat bukti-transfer lalu pembayaran ditandai "submitted", sama seperti unggahan
 * dari halaman bayar. Membalas ringkasan booking terbaru.
 */
export async function POST(request: Request, { params }: RouteContext): Promise<NextResponse> {
  return handleRoute("POST /api/bot/booking/[code]/bukti", async () => {
    if (!botAuthorized(request)) return jsonError("Tidak diizinkan.", 401, { code: "UNAUTHORIZED" });
    const { code } = await params;
    const found = await bookingByCode(code);
    if (!found.ok) return mapResultToResponse(found);
    const booking = found.data;
    if (booking.status === "cancelled") return jsonError("Booking ini sudah dibatalkan.", 409, { code: "CANCELLED" });
    if (booking.payment?.status === "verified") return jsonOk(ringkasanBot(booking));

    const mime = (request.headers.get("content-type") ?? "").split(";")[0].trim();
    const ext = EKSTENSI[mime];
    if (!ext) return jsonError("Bukti harus berupa gambar JPG, PNG, atau WEBP.", 415, { code: "PROOF_TYPE" });
    const data = Buffer.from(await request.arrayBuffer());
    // Foto WhatsApp sudah dikompresi; batasnya sedikit lebih longgar dari unggahan web.
    if (data.length === 0 || data.length > MAX_PROOF_BYTES * 3) {
      return jsonError("Ukuran bukti tidak wajar.", 413, { code: "PROOF_TOO_LARGE" });
    }

    const proofUrl = await simpanBerkas(STORAGE_BUCKET_BUKTI, `${booking.id}-wa-${Date.now()}.${ext}`, data);
    if (!proofUrl) return jsonError("Bukti gagal disimpan.", 502, { code: "UPLOAD_FAILED" });

    const hasil = await submitPayment({ bookingId: booking.id, method: "qris", proofUrl });
    if (!hasil.ok) return mapResultToResponse(hasil);
    const terbaru = await bookingByCode(code);
    return terbaru.ok ? jsonOk(ringkasanBot(terbaru.data)) : mapResultToResponse(terbaru);
  });
}
