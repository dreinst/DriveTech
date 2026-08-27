import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/types/database";
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from "./config";

/**
 * Client Supabase untuk Server Component / Route Handler / Server Action.
 * cookies() di Next 15 async, jadi fungsi ini async.
 */
export async function createServerSupabase(): Promise<SupabaseClient<Database>> {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase belum dikonfigurasi (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY kosong).");
  }

  const cookieStore = await cookies();

  return createServerClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Dipanggil dari Server Component: penulisan cookie diabaikan,
          // sesi tetap disegarkan oleh middleware.
        }
      },
    },
  });
}
