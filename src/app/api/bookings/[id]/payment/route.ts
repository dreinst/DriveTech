import type { NextResponse } from "next/server";
import { z } from "zod";

import { MAX_PROOF_BYTES, STORAGE_BUCKET_BUKTI } from "@/lib/domain/constants";
import { checkRateLimit, clientIpFrom, rateLimitShared } from "@/lib/rate-limit";
import { getBookingDetail, submitPayment } from "@/lib/services/booking";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { isProofUrlMilikKita } from "@/lib/storage";
import { isServiceRoleConfigured } from "@/lib/supabase/config";
import { submitPaymentSchema } from "@/lib/validation/schemas";
import {
  formText,
  handleRoute,
  isMultipart,
  jsonError,
  jsonRateLimited,
  jsonValidationError,
  mapResultToResponse,
  readJsonObject,
  INVALID_JSON_MESSAGE,
} from "@/app/api/_lib/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Next 15: params pada route handler adalah Promise.
type RouteContext = { params: Promise<{ id: string }> };

const JENIS_BUKTI_DIIZINKAN = ["image/jpeg", "image/png", "image/webp"];

function ekstensiBukti(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

/** Payload yang sudah dinormalkan dari JSON maupun multipart. */
type PayloadPembayaran = { method: string; proofUrl: string };

/**
 * Unggah bukti pembayaran QRIS ke bucket `bukti-transfer` (PRIVATE sejak 2026-08-29;
 * ditampilkan lewat signed URL — lihat lib/storage.ts) dan kembalikan URL
 * identitasnya. Mengembalikan NextResponse (error siap kirim) kalau berkasnya
 * ditolak. HANYA boleh dipanggil setelah booking terverifikasi ada — endpoint
 * publik ini sempat bisa dipakai menumpang unggah gambar dengan nama bebas
 * sebelum bookingId diperiksa (temuan audit 2026-08-29).
 */
async function unggahBukti(
  bookingId: string,
  berkas: File,
): Promise<{ url: string } | { response: NextResponse }> {
  if (berkas.size > MAX_PROOF_BYTES) {
    return {
      response: jsonError("Ukuran bukti pembayaran maksimal 2 MB.", 413, {
        code: "PROOF_TOO_LARGE",
        fieldErrors: { proof: "Ukuran bukti pembayaran maksimal 2 MB." },
      }),
    };
  }
  if (!JENIS_BUKTI_DIIZINKAN.includes(berkas.type)) {
    return {
      response: jsonError("Format bukti pembayaran harus JPG, PNG, atau WEBP.", 415, {
        code: "PROOF_TYPE",
        fieldErrors: { proof: "Format bukti pembayaran harus JPG, PNG, atau WEBP." },
      }),
    };
  }

  const supabase = createAdminSupabase();
  const nama = `${bookingId}-api.${ekstensiBukti(berkas.type)}`;
  const unggah = await supabase.storage.from(STORAGE_BUCKET_BUKTI).upload(nama, berkas, {
    upsert: true,
    contentType: berkas.type,
    cacheControl: "3600",
  });

  if (unggah.error) {
    return {
      response: jsonError("Bukti pembayaran gagal diunggah, coba lagi.", 502, {
        code: "UPLOAD_FAILED",
        fieldErrors: { proof: "Bukti pembayaran gagal diunggah, coba lagi." },
      }),
    };
  }

  const { data } = supabase.storage.from(STORAGE_BUCKET_BUKTI).getPublicUrl(nama);
  return { url: data.publicUrl };
}

/**
 * POST /api/bookings/{bookingId}/payment
 *
 * Menerima DUA bentuk body (dideteksi lewat header Content-Type):
 *  1. application/json      -> { method: "qris", proofUrl?: string }
 *     (cash dihapus 2026-08-28, transfer bank dihapus 2026-09-02 — booking
 *      hanya dikunci lewat pembayaran QRIS + bukti)
 *  2. multipart/form-data   -> field "method", "proof" (berkas gambar), "proofUrl" (opsional)
 *
 * Urutan penting: bookingId divalidasi dan bookingnya dimuat DULU, baru berkas
 * diunggah — supaya endpoint ini tidak bisa dipakai sebagai hosting gambar.
 * Sukses 200: { bookingId }
 */
export async function POST(request: Request, { params }: RouteContext): Promise<NextResponse> {
  return handleRoute("POST /api/bookings/[id]/payment", async () => {
    const laju = checkRateLimit(`payment:${clientIpFrom(request)}`, 10, 60_000);
    if (!laju.allowed) return jsonRateLimited(laju.retryAfterSeconds);

    const { id: bookingId } = await params;
    if (!z.uuid().safeParse(bookingId).success) {
      return jsonError("ID booking tidak valid.", 400, {
        code: "VALIDATION",
        fieldErrors: { bookingId: "ID booking tidak valid." },
      });
    }
    if (!isServiceRoleConfigured()) {
      return jsonError(
        "Supabase belum dikonfigurasi. Isi SUPABASE_SERVICE_ROLE_KEY pada .env.local.",
        503,
        { code: "NO_CONFIG" },
      );
    }
    // Pembatas bersama per booking: bukti tidak perlu dikirim ulang puluhan kali
    // per jam; juga menahan pemakaian endpoint ini sebagai penulis storage.
    if (!(await rateLimitShared(`payment:booking:${bookingId}`, 10, 3600))) {
      return jsonRateLimited(600);
    }

    const bookingResult = await getBookingDetail(bookingId);
    if (!bookingResult.ok) return mapResultToResponse(bookingResult);
    const booking = bookingResult.data;
    if (booking.status === "cancelled") {
      return jsonError("Booking ini sudah dibatalkan.", 409, { code: "CANCELLED" });
    }
    if (booking.payment?.status === "verified") {
      return jsonError("Pembayaran booking ini sudah terverifikasi.", 409, {
        code: "ALREADY_VERIFIED",
      });
    }

    let payload: PayloadPembayaran;

    if (isMultipart(request)) {
      const form = await request.formData();
      payload = { method: formText(form, "method"), proofUrl: formText(form, "proofUrl") };

      const berkasMentah = form.get("proof");
      const berkas = berkasMentah instanceof File && berkasMentah.size > 0 ? berkasMentah : null;

      if (berkas !== null) {
        const hasil = await unggahBukti(booking.id, berkas);
        if ("response" in hasil) return hasil.response;
        payload.proofUrl = hasil.url;
      }
    } else {
      const body = await readJsonObject(request);
      if (body === null) return jsonError(INVALID_JSON_MESSAGE, 400, { code: "INVALID_BODY" });
      payload = {
        method: typeof body.method === "string" ? body.method : "",
        proofUrl: typeof body.proofUrl === "string" ? body.proofUrl : "",
      };
    }

    // Bukti hanya sah kalau berkasnya memang ada di storage kita. Tanpa ini,
    // tautan gambar acak dari internet bisa dipakai mengunci slot gratis
    // sampai 72 jam tanpa pernah membayar (temuan audit 2026-08-30).
    if (payload.proofUrl.length > 0 && !isProofUrlMilikKita(payload.proofUrl)) {
      return jsonError(
        "Bukti pembayaran harus diunggah lewat formulir ini, bukan berupa tautan dari luar.",
        422,
        {
          code: "PROOF_NOT_UPLOADED",
          fieldErrors: { proofUrl: "Unggah berkas buktinya, jangan kirim tautan luar." },
        },
      );
    }

    const parsed = submitPaymentSchema.safeParse({
      bookingId: booking.id,
      method: payload.method,
      proofUrl: payload.proofUrl,
    });
    if (!parsed.success) {
      return jsonValidationError("Data pembayaran tidak valid.", parsed.error);
    }

    const result = await submitPayment(parsed.data);
    return mapResultToResponse(result);
  });
}
