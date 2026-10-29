import { kodeDealer, kodeWaDealer } from "@/lib/domain/formulir-dealer";
import type { PendaftaranDealer } from "@/lib/services/formulir-dealer";
import { getSiteUrl } from "@/lib/site-url";

/** Ringkasan formulir dealer yang dibutuhkan bot WhatsApp kantor untuk mengirim PDF. */
export function ringkasDealer(d: PendaftaranDealer) {
  const situs = getSiteUrl().replace(/\/+$/, "");
  return {
    id: d.id,
    kode: kodeDealer(d.id),
    kodeWa: kodeWaDealer(d.id, d.token),
    nama: d.data.nama_dealer ?? "",
    status: d.diterima_at ? "diterima" : d.ditandatangani_at ? "ditandatangani" : "belum",
    pdf: `${situs}/dealer/${d.token}/pdf`,
    halaman: `${situs}/dealer/${d.token}`,
  };
}
