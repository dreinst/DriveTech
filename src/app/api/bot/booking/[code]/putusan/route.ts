import type { NextResponse } from "next/server";

import { handleRoute, jsonError, jsonOk, mapResultToResponse, readJsonObject } from "@/app/api/_lib/respond";
import { rejectPayment, verifyPayment } from "@/lib/services/admin";
import { adminPenyetuju, bookingByCode, botAuthorized, ringkasanBot } from "@/lib/services/bot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ code: string }> };

/**
 * POST /api/bot/booking/{kode}/putusan (khusus bot D'Pro Ops, header x-bot-key)
 * Body { aksi: "setujui" | "tolak", alasan?, oleh? } dari tombol Setujui/Tolak di Discord. Memakai
 * verifyPayment/rejectPayment yang sama dengan /admin/bookings, jadi email dan kabar WhatsApp ikut terkirim.
 */
export async function POST(request: Request, { params }: RouteContext): Promise<NextResponse> {
  return handleRoute("POST /api/bot/booking/[code]/putusan", async () => {
    if (!botAuthorized(request)) return jsonError("Tidak diizinkan.", 401, { code: "UNAUTHORIZED" });
    const { code } = await params;
    const body = (await readJsonObject(request)) ?? {};
    const aksi = body.aksi;
    if (aksi !== "setujui" && aksi !== "tolak") return jsonError("Aksi harus setujui atau tolak.", 400, { code: "VALIDATION" });
    const alasan = typeof body.alasan === "string" && body.alasan.trim() ? body.alasan.trim().slice(0, 200) : "Pembayaran belum kami temukan";

    const found = await bookingByCode(code);
    if (!found.ok) return mapResultToResponse(found);
    const payment = found.data.payment;
    if (!payment) return jsonError("Booking ini belum punya tagihan.", 409, { code: "NO_PAYMENT" });

    const admin = await adminPenyetuju();
    if (!admin.ok) return mapResultToResponse(admin);
    const hasil = aksi === "setujui" ? await verifyPayment(payment.id, admin.data) : await rejectPayment(payment.id, admin.data, alasan);
    if (!hasil.ok) return mapResultToResponse(hasil);

    const terbaru = await bookingByCode(code);
    return terbaru.ok ? jsonOk(ringkasanBot(terbaru.data)) : mapResultToResponse(terbaru);
  });
}
