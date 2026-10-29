import type { Metadata } from "next";

import { JALAN_SEHAT } from "@/lib/domain/jalan-sehat";
import { nomorTiketAktif } from "@/lib/services/jalan-sehat";
import { UndiTiket } from "./UndiTiket";

export const metadata: Metadata = {
  title: `Undian Doorprize ${JALAN_SEHAT.judul}`,
  robots: { index: false, follow: false },
};

// Daftar nomor diambil tiap kali halaman dibuka atau diperbarui, supaya pendaftar terakhir ikut.
export const dynamic = "force-dynamic";

/** Halaman undian untuk MC/panitia: tanpa login, hanya nomor tiket aktif yang dikirim ke perangkat. */
export default async function UndiPage() {
  const hasil = await nomorTiketAktif();
  return <UndiTiket nomor={hasil.ok ? hasil.data : []} galat={hasil.ok ? null : hasil.error} />;
}
