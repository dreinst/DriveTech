import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/types/database";
import { SUPABASE_URL } from "./config";

// Modul khusus server. Paket "server-only" tidak ada di dependencies proyek ini,
// jadi penjagaannya dilakukan runtime: melempar kalau modul ini sempat jalan di browser.
if (typeof window !== "undefined") {
  throw new Error("src/lib/supabase/admin.ts hanya boleh dipakai di server.");
}

/**
 * Client service role — MEM-BYPASS RLS. Semua penulisan data lewat sini,
 * hanya dari server. Melempar saat dipanggil (bukan saat impor) kalau env kosong.
 */
export function createAdminSupabase(): SupabaseClient<Database> {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!SUPABASE_URL || !serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL belum diisi pada environment.");
  }

  return createClient<Database>(SUPABASE_URL, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
