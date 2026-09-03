import QRCode from "qrcode";

/**
 * Pembuat kode QR (SVG) di sisi server — dipakai QR verifikasi panitia pada
 * halaman status booking. Pustaka `qrcode` memakai API Node, jadi modul ini
 * KHUSUS SERVER (pola yang sama dengan services/*).
 */
if (typeof window !== "undefined") {
  throw new Error("src/lib/qr.ts hanya boleh dipakai di server.");
}

export type QrSvgOptions = {
  /** Tepi kosong dalam satuan modul QR (default 1). */
  margin?: number;
  /** Tingkat koreksi galat (default "M"; cukup untuk URL pendek). */
  errorCorrectionLevel?: "L" | "M" | "Q" | "H";
  /** Lebar piksel eksplisit; tanpa ini SVG mengikuti ukuran wadahnya. */
  width?: number;
};

/** Kembalikan markup <svg> kode QR untuk teks/URL yang diberikan. */
export async function qrSvg(text: string, opts: QrSvgOptions = {}): Promise<string> {
  return QRCode.toString(text, {
    type: "svg",
    margin: opts.margin ?? 1,
    errorCorrectionLevel: opts.errorCorrectionLevel ?? "M",
    ...(opts.width ? { width: opts.width } : {}),
  });
}
