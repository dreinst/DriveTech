/**
 * Konfigurasi env Supabase. Modul ini TIDAK BOLEH melempar saat diimpor supaya
 * "next build" dan halaman publik tetap jalan walau env belum diisi.
 */

export const SUPABASE_URL: string = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY: string = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export function isSupabaseConfigured(): boolean {
  return SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;
}

export function isServiceRoleConfigured(): boolean {
  return isSupabaseConfigured() && (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").length > 0;
}

/** Pesan seragam saat env belum diisi — dipakai sebagai fallback UI. */
export const SUPABASE_NOT_CONFIGURED_MESSAGE =
  "Koneksi database belum dikonfigurasi. Isi NEXT_PUBLIC_SUPABASE_URL dan NEXT_PUBLIC_SUPABASE_ANON_KEY pada file .env.local.";
