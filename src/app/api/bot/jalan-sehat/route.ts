import type { NextResponse } from "next/server";

import { handleRoute, jsonError, jsonOk, readJsonObject } from "@/app/api/_lib/respond";
import { pendaftaranOnlineDibuka } from "@/lib/domain/jalan-sehat";
import { botAuthorized } from "@/lib/services/bot";
import { buatPesanan, pesananByPhone } from "@/lib/services/jalan-sehat";
import { jalanSehatSchema, zodFieldErrors } from "@/lib/validation/schemas";
import { ringkasDenganTiket, ringkasPesanan } from "./ringkas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/bot/jalan-sehat (khusus bot WhatsApp kantor, header x-bot-key)
 * Body { phone } saja: keadaan nomor pengirim chat = { dibuka, menunggu (pesanan belum lunas terbaru atau null),
 * lunas (pesanan lunas) }.
 * Body { phone, nama, domisili, jumlah, chat }: buat pesanan baru bersumber 'wa' (201) berisi tautan kartu QRIS.
 * phone diambil bot dari pengirim chat (62..., boleh tanpa +), bukan dari ketikan peserta.
 */
export async function POST(request: Request): Promise<NextResponse> {
  return handleRoute("POST /api/bot/jalan-sehat", async () => {
    if (!botAuthorized(request)) return jsonError("Tidak diizinkan.", 401, { code: "UNAUTHORIZED" });
    const body = (await readJsonObject(request)) ?? {};

    if (body.nama === undefined) {
      const hp = jalanSehatSchema.shape.phone.safeParse(String(body.phone ?? ""));
      if (!hp.success) return jsonError("Nomor tidak valid.", 400, { code: "VALIDATION" });
      const semua = await pesananByPhone(hp.data);
      if (!semua.ok) return jsonError(semua.error, 502, { code: "DB" });
      const menunggu = semua.data.find((p) => p.status === "menunggu" || p.status === "dicek");
      return jsonOk({
        dibuka: pendaftaranOnlineDibuka(),
        menunggu: menunggu ? ringkasPesanan(menunggu) : null,
        lunas: await Promise.all(semua.data.filter((p) => p.status === "lunas").map(ringkasDenganTiket)),
      });
    }

    const parsed = jalanSehatSchema.safeParse({
      nama: body.nama,
      phone: body.phone,
      domisili: body.domisili,
      jumlah: body.jumlah,
    });
    if (!parsed.success) {
      return jsonError("Isian belum sesuai.", 400, { code: "VALIDATION", fieldErrors: zodFieldErrors(parsed.error) });
    }
    const chat = typeof body.chat === "string" ? body.chat.trim() : null;
    const hasil = await buatPesanan({ ...parsed.data, sumber: "wa", waChat: chat || null });
    if (!hasil.ok) {
      return jsonError(hasil.error, hasil.code === "TUTUP" ? 403 : 502, { code: hasil.code });
    }
    return jsonOk(ringkasPesanan(hasil.data), 201);
  });
}
