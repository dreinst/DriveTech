import { NextResponse } from "next/server";

import { qrBaseUrl, qrBrandSvg, type QrBrandVariant } from "@/lib/qr-brand";
import { goUrl, QR_SLUG_RE } from "@/lib/qr-media";
import { getCurrentAdmin } from "@/lib/services/auth";

export const dynamic = "force-dynamic";

/** Teks keterangan default di bawah kode. */
const TEKS_DEFAULT = "Scan untuk pesan lapak";
const TEKS_MAKS = 40;

/**
 * GET /api/admin/qr?dari=<slug>&variant=branded|plain&caption=1|0&teks=<...>&download=1
 * Mengembalikan SVG kode QR promosi. Khusus admin (sesi Supabase Auth +
 * baris admin_users) — dipakai halaman /admin/qr sebagai <img src> dan
 * sumber unduhan SVG/PNG.
 */
export async function GET(request: Request): Promise<Response> {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Butuh sesi admin." }, { status: 401 });
  }

  const url = new URL(request.url);
  const dari = url.searchParams.get("dari") ?? "";
  if (!QR_SLUG_RE.test(dari)) {
    return NextResponse.json(
      { error: "Slug media tidak valid (huruf kecil, angka, strip; maks 32 karakter)." },
      { status: 400 },
    );
  }

  const variant: QrBrandVariant = url.searchParams.get("variant") === "plain" ? "plain" : "branded";
  const denganKeterangan = url.searchParams.get("caption") !== "0";
  const teksRaw = url.searchParams.get("teks")?.trim() ?? "";
  const teks = (teksRaw || TEKS_DEFAULT).slice(0, TEKS_MAKS);

  const base = qrBaseUrl();
  const svg = qrBrandSvg(goUrl(base, dari), {
    variant,
    caption: denganKeterangan ? teks : undefined,
    // Alamat situs sebagai cadangan kalau kamera gagal membaca kode.
    captionSub: denganKeterangan ? base.replace(/^https?:\/\//, "") : undefined,
  });

  const unduh = url.searchParams.get("download") === "1";
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "private, no-store",
      ...(unduh ? { "Content-Disposition": `attachment; filename="qr-drivetech-${dari}.svg"` } : {}),
    },
  });
}
