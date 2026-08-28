/**
 * Sinkronisasi satu arah ke Google Sheets lewat webhook Apps Script
 * (tools/google-sheets-webhook.gs). Fire-and-forget: pemanggil TIDAK boleh
 * menunggu di jalur kritis — panggil dengan `void syncToSheet(...)` SETELAH
 * operasi utama sukses. Semua kegagalan hanya dicatat console.warn dan tidak
 * pernah menggagalkan operasi utama.
 *
 * Di serverless (Vercel), promise yang dibiarkan menggantung bisa ikut
 * dibekukan begitu respons terkirim — pengiriman didaftarkan lewat `after()`
 * (next/server) supaya runtime menahan instance sampai webhook selesai.
 * Di luar konteks request (mis. skrip), `after()` melempar — fallback ke
 * pengiriman langsung.
 *
 * Modul KHUSUS SERVER. Kontrak menyebut `import "server-only"`, tetapi paket
 * npm "server-only" tidak ada di dependencies proyek ini (lihat catatan di
 * src/lib/supabase/admin.ts) — penjagaannya dilakukan runtime, konsisten
 * dengan seluruh lapisan service.
 */
import { after } from "next/server";

if (typeof window !== "undefined") {
  throw new Error("src/lib/sheets.ts hanya boleh dipakai di server.");
}

/** Jenis entitas yang disinkronkan; menjadi nama sheet di spreadsheet tujuan. */
export type SheetEntity = "booking" | "payment" | "purchase" | "leasing" | "vehicle";

/** Batas tunggu webhook (ms) — jangan sampai menahan respons ke pengguna. */
const SHEETS_TIMEOUT_MS = 4000;

/** Kirim payload ke webhook. Tidak pernah melempar — hanya console.warn. */
async function deliver(
  url: string,
  entity: SheetEntity,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entity,
        sentAt: new Date().toISOString(),
        data: payload,
      }),
      signal: AbortSignal.timeout(SHEETS_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.warn(`[sheets] webhook ${entity} membalas status ${response.status}`);
    }
  } catch (error) {
    // Sengaja hanya warning: sinkronisasi sheet tidak boleh mengganggu operasi utama.
    console.warn(`[sheets] gagal sinkron ${entity}:`, error);
  }
}

/**
 * Kirim satu payload entitas ke webhook Apps Script.
 * Tanpa SHEETS_WEBHOOK_URL fungsi ini langsung selesai (fitur opsional).
 */
export async function syncToSheet(
  entity: SheetEntity,
  payload: Record<string, unknown>,
): Promise<void> {
  const url = process.env.SHEETS_WEBHOOK_URL;
  if (!url) return;

  const delivery = deliver(url, entity, payload);
  try {
    after(delivery);
  } catch {
    await delivery;
  }
}
