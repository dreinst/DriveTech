/**
 * Tes manual kerangka notifikasi (WhatsApp + email) dengan NOMOR DUMMY.
 *
 * Jalankan: `node scripts/test-notifikasi.ts`
 *
 * Tanpa kredensial provider (WA_API_TOKEN / RESEND_API_KEY), semua channel
 * berjalan DRY-RUN: payload dicetak, tidak ada panggilan keluar. Ini sengaja —
 * membuktikan format pesan & alur benar sebelum nomor/provider sungguhan
 * dipasang. Untuk uji kirim sungguhan ke satu nomor, set:
 *   WA_API_TOKEN=xxxx WA_OVERRIDE_RECIPIENT=628xxxx node scripts/test-notifikasi.ts
 */
import {
  DUMMY_WA_RECIPIENT,
  buildBookingWa,
  notifyBooking,
  sendWhatsApp,
  toWaNumber,
  type BookingNotif,
  type BookingNotifKind,
} from "../src/lib/notifications.ts";

const contoh: BookingNotif = {
  tenantName: "Budi Santoso",
  tenantPhone: "081234567890",
  tenantEmail: "budi@example.com",
  bookingCode: "BK-DEMO01",
  slotName: "Slot 07",
  zoneName: "Area Pameran Mobil",
  dates: ["2026-09-12", "2026-09-13"],
  amount: 100000,
  deadlineText: "30 Agustus 2026, 14.05 WIB",
  reason: "Nominal transfer tidak sesuai tagihan",
};

const KINDS: BookingNotifKind[] = ["created", "verified", "rejected", "cancelled"];

async function main(): Promise<void> {
  console.log("=== Uji kerangka notifikasi (mode dry-run bila tanpa kredensial) ===\n");
  console.log(`Nomor tenant contoh 081234567890 -> WA ${toWaNumber("081234567890")}`);
  console.log(`Nomor dummy bawaan               -> ${DUMMY_WA_RECIPIENT}\n`);

  // 1) Pratinjau semua template pesan WA.
  for (const kind of KINDS) {
    console.log(`----- Template WA [${kind}] -----`);
    console.log(buildBookingWa(kind, contoh));
    console.log();
  }

  // 2) Kirim langsung ke nomor dummy (dry-run tanpa token; asli bila token diisi).
  console.log("----- Kirim langsung ke NOMOR DUMMY -----");
  const hasil = await sendWhatsApp(DUMMY_WA_RECIPIENT, buildBookingWa("created", contoh));
  console.log("Hasil sendWhatsApp:", hasil, "\n");

  // 3) Alur notifyBooking lengkap (WA + email) untuk satu peristiwa.
  console.log("----- notifyBooking('verified') lengkap (WA + email) -----");
  await notifyBooking("verified", { ...contoh, tenantPhone: DUMMY_WA_RECIPIENT });

  console.log("\n=== Selesai. Tanpa kredensial = dry-run (tidak ada pesan sungguhan terkirim). ===");
}

main().catch((error) => {
  console.error("Uji notifikasi gagal:", error);
  process.exitCode = 1;
});
