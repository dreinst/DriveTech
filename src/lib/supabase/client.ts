import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/types/database";
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from "./config";

/**
 * Client Supabase untuk browser (dipakai komponen client, mis. langganan realtime slots).
 * Panggil isSupabaseConfigured() dulu di pemanggil supaya tidak melempar saat env kosong.
 */
export function createBrowserSupabase(): SupabaseClient<Database> {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase belum dikonfigurasi (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY kosong).");
  }
  return createBrowserClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY);
}
