import { NextResponse } from "next/server";
import { z } from "zod";

import type { Result } from "@/lib/result";
import { zodFieldErrors } from "@/lib/validation/schemas";

/**
 * Helper respons JSON untuk seluruh Route Handler di src/app/api.
 *
 * Semua endpoint memakai bentuk yang sama supaya integrasi eksternal cukup
 * memeriksa satu pola:
 *   sukses -> { ...data }                 (2xx)
 *   gagal  -> { error, code?, fieldErrors? } (4xx / 5xx)
 * Pesan `error` selalu berbahasa Indonesia dan aman ditampilkan ke pengguna;
 * detail teknis (stack, query) TIDAK pernah dikirim ke klien.
 */

/** Bentuk body error yang dikirim ke klien. */
export type ApiErrorBody = {
  error: string;
  code?: string;
  fieldErrors?: Record<string, string>;
};

/** Pesan generik untuk kesalahan tak terduga (500) — jangan bocorkan detail internal. */
export const GENERIC_ERROR_MESSAGE =
  "Terjadi kesalahan pada server. Coba lagi beberapa saat lagi.";

/** Pesan saat body permintaan bukan JSON yang valid. */
export const INVALID_JSON_MESSAGE =
  "Body permintaan harus berupa JSON yang valid.";

/** Respons API tidak boleh di-cache: statusnya berubah setiap saat. */
const NO_STORE_HEADERS: Record<string, string> = { "Cache-Control": "no-store" };

/* ------------------------------------------------------------------ */
/* Respons dasar                                                       */
/* ------------------------------------------------------------------ */

/** Respons sukses. Status default 200; pakai 201 untuk pembuatan sumber daya baru. */
export function jsonOk<T>(data: T, status = 200): NextResponse<T> {
  return NextResponse.json(data, { status, headers: NO_STORE_HEADERS });
}

/** Respons gagal. `extra` boleh berisi `code` dan/atau `fieldErrors`. */
export function jsonError(
  message: string,
  status: number,
  extra?: Partial<Omit<ApiErrorBody, "error">>,
): NextResponse<ApiErrorBody> {
  const body: ApiErrorBody = { error: message };
  if (extra?.code) body.code = extra.code;
  if (extra?.fieldErrors && Object.keys(extra.fieldErrors).length > 0) {
    body.fieldErrors = extra.fieldErrors;
  }
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

/** 429 dengan header Retry-After — dipakai bersama lib/rate-limit.ts. */
export function jsonRateLimited(retryAfterSeconds: number): NextResponse<ApiErrorBody> {
  return NextResponse.json(
    {
      error: "Terlalu banyak permintaan dari alamat Anda. Coba lagi sebentar lagi.",
      code: "RATE_LIMITED",
    } satisfies ApiErrorBody,
    {
      status: 429,
      headers: { ...NO_STORE_HEADERS, "Retry-After": String(Math.max(1, retryAfterSeconds)) },
    },
  );
}

/** 400 lengkap dengan peta error per field dari zod. */
export function jsonValidationError(
  message: string,
  error: z.ZodError,
): NextResponse<ApiErrorBody> {
  return jsonError(message, 400, { code: "VALIDATION", fieldErrors: zodFieldErrors(error) });
}

/* ------------------------------------------------------------------ */
/* Pemetaan Result -> HTTP                                             */
/* ------------------------------------------------------------------ */

/**
 * Peta kode Result (lihat src/lib/services/*) ke status HTTP.
 *
 * Wajib menurut kontrak: SLOT_TAKEN -> 409, NO_CONFIG -> 503, VALIDATION -> 400,
 * selebihnya 500. Beberapa kode bisnis lain sengaja dipetakan ke 4xx karena
 * jelas-jelas kesalahan pemanggil, bukan kesalahan server (didokumentasikan di README).
 */
const STATUS_BY_CODE: Record<string, number> = {
  VALIDATION: 400,
  NOT_FOUND: 404,
  SLOT_TAKEN: 409,
  DATE_TAKEN: 409,
  ALREADY_EXISTS: 409,
  ALREADY_VERIFIED: 409,
  CANCELLED: 409,
  NOT_BOOKABLE: 422,
  ZONE_CLOSED: 422,
  NOT_CREDIT: 422,
  INACTIVE_PARTNER: 422,
  NOT_SUBMITTED: 422,
  TOO_MANY_PENDING: 429,
  NO_CONFIG: 503,
};

/** Status HTTP untuk satu kode Result. Kode tak dikenal (mis. kode error Postgres) -> 500. */
export function statusFromResultCode(code?: string): number {
  if (!code) return 500;
  return STATUS_BY_CODE[code] ?? 500;
}

/**
 * Ubah Result<T> dari lapisan service menjadi NextResponse.
 * Sukses memakai `successStatus`; gagal memakai peta kode di atas.
 * Pesan kegagalan dari service sudah berbahasa Indonesia dan aman ditampilkan.
 */
export function mapResultToResponse<T>(
  result: Result<T>,
  successStatus = 200,
): NextResponse<T | ApiErrorBody> {
  if (result.ok) return jsonOk(result.data, successStatus);
  const status = statusFromResultCode(result.code);
  // Kode tak dikenal berarti kegagalan internal: sembunyikan detailnya.
  const message = status === 500 ? GENERIC_ERROR_MESSAGE : result.error;
  return jsonError(message, status, { code: result.code });
}

/* ------------------------------------------------------------------ */
/* Pembaca body                                                        */
/* ------------------------------------------------------------------ */

/** Apakah permintaan mengirim multipart/form-data (unggah berkas)? */
export function isMultipart(request: Request): boolean {
  const tipe = request.headers.get("content-type") ?? "";
  return tipe.toLowerCase().includes("multipart/form-data");
}

/**
 * Baca body JSON menjadi objek biasa.
 * Mengembalikan null kalau body kosong, bukan JSON, atau bukan objek —
 * pemanggil membalas 400 dengan INVALID_JSON_MESSAGE.
 */
export async function readJsonObject(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Ambil satu nilai teks dari FormData ("" kalau tidak ada / bukan teks). */
export function formText(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value : "";
}

/* ------------------------------------------------------------------ */
/* Pembungkus penanganan error                                         */
/* ------------------------------------------------------------------ */

/**
 * Jalankan handler; kesalahan tak terduga apa pun jadi 500 dengan pesan generik.
 * Detail aslinya hanya dicatat di log server.
 */
export async function handleRoute(
  konteks: string,
  handler: () => Promise<NextResponse>,
): Promise<NextResponse> {
  try {
    return await handler();
  } catch (error) {
    console.error(`[api] ${konteks}`, error);
    return jsonError(GENERIC_ERROR_MESSAGE, 500, { code: "INTERNAL" });
  }
}
