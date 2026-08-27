import type { NextResponse } from "next/server";

import { MAX_PROOF_BYTES, STORAGE_BUCKET_BUKTI } from "@/lib/domain/constants";
import { submitPayment } from "@/lib/services/booking";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { isServiceRoleConfigured } from "@/lib/supabase/config";
import { submitPaymentSchema } from "@/lib/validation/schemas";
import {
  formText,
  handleRoute,
  isMultipart,
  jsonError,
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
 * Unggah bukti transfer ke bucket publik `bukti-transfer` dan kembalikan URL publiknya.
 * Mengembalikan NextResponse (error siap kirim) kalau berkasnya ditolak.
 */
async function unggahBukti(
  bookingId: string,
  berkas: File,
): Promise<{ url: string } | { response: NextResponse }> {
  if (berkas.size > MAX_PROOF_BYTES) {
    return {
      response: jsonError("Ukuran bukti transfer maksimal 2 MB.", 413, {
        code: "PROOF_TOO_LARGE",
        fieldErrors: { proof: "Ukuran bukti transfer maksimal 2 MB." },
      }),
    };
  }
  if (!JENIS_BUKTI_DIIZINKAN.includes(berkas.type)) {
    return {
      response: jsonError("Format bukti transfer harus JPG, PNG, atau WEBP.", 415, {
        code: "PROOF_TYPE",
        fieldErrors: { proof: "Format bukti transfer harus JPG, PNG, atau WEBP." },
      }),
    };
  }
  if (!isServiceRoleConfigured()) {
    return {
      response: jsonError(
        "Supabase belum dikonfigurasi. Isi SUPABASE_SERVICE_ROLE_KEY pada .env.local.",
        503,
        { code: "NO_CONFIG" },
      ),
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
      response: jsonError("Bukti transfer gagal diunggah, coba lagi.", 502, {
        code: "UPLOAD_FAILED",
        fieldErrors: { proof: "Bukti transfer gagal diunggah, coba lagi." },
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
 *  1. application/json      -> { method: "cash" | "transfer", proofUrl?: string }
 *  2. multipart/form-data   -> field "method", "proof" (berkas gambar), "proofUrl" (opsional)
 *
 * Sukses 200: { bookingId }
 */
export async function POST(request: Request, { params }: RouteContext): Promise<NextResponse> {
  return handleRoute("POST /api/bookings/[id]/payment", async () => {
    const { id: bookingId } = await params;

    let payload: PayloadPembayaran;

    if (isMultipart(request)) {
      const form = await request.formData();
      payload = { method: formText(form, "method"), proofUrl: formText(form, "proofUrl") };

      const berkasMentah = form.get("proof");
      const berkas = berkasMentah instanceof File && berkasMentah.size > 0 ? berkasMentah : null;

      if (berkas !== null) {
        const hasil = await unggahBukti(bookingId, berkas);
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

    const parsed = submitPaymentSchema.safeParse({
      bookingId,
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
