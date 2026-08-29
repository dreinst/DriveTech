import { STORAGE_BUCKET_BUKTI } from "@/lib/domain/constants";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { isServiceRoleConfigured } from "@/lib/supabase/config";

// Modul KHUSUS SERVER (lihat catatan "server-only" di services/slots.ts).
if (typeof window !== "undefined") {
  throw new Error("src/lib/storage.ts hanya boleh dipakai di server.");
}

/**
 * Bucket bukti-transfer PRIVATE sejak 2026-08-29 (bukti transfer = data
 * finansial pribadi). Kolom proof_url tetap menyimpan URL gaya publik
 * (`.../object/public/bukti-transfer/<nama>`) sebagai identitas berkas —
 * kompatibel dengan baris lama — dan URL tersebut TIDAK bisa diakses langsung;
 * halaman yang menampilkan bukti wajib menukarnya dulu lewat resolveProofUrl.
 */
const PUBLIC_PATH_MARKER = `/storage/v1/object/public/${STORAGE_BUCKET_BUKTI}/`;

/** Umur signed URL: cukup untuk satu sesi memeriksa bukti, tidak permanen. */
const SIGNED_URL_TTL_SECONDS = 60 * 60;

/**
 * Tukar proof_url tersimpan menjadi URL yang benar-benar bisa dibuka:
 *  - URL bucket bukti-transfer -> signed URL berumur 1 jam (service role);
 *  - tautan eksternal (proofUrl kiriman API) -> diteruskan apa adanya;
 *  - null -> null. Kalau penandatanganan gagal, URL asli dikembalikan supaya
 *    UI tetap merender tautan (walau kemungkinan 403).
 */
export async function resolveProofUrl(url: string | null): Promise<string | null> {
  if (!url) return null;

  const markerIndex = url.indexOf(PUBLIC_PATH_MARKER);
  if (markerIndex === -1) return url;
  if (!isServiceRoleConfigured()) return url;

  const objectPath = url.slice(markerIndex + PUBLIC_PATH_MARKER.length);
  if (objectPath.length === 0) return url;

  try {
    const supabase = createAdminSupabase();
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET_BUKTI)
      .createSignedUrl(objectPath, SIGNED_URL_TTL_SECONDS);
    if (error || !data?.signedUrl) return url;
    return data.signedUrl;
  } catch {
    return url;
  }
}
