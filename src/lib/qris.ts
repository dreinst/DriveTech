// QRIS dinamis dari QRIS statis merchant (disalin dari KUWERA 5K, merchant GoPay yang sama). Payload statis dibaca,
// penanda "statis" (tag 01 = 11) diganti "dinamis" (12), nominal dimasukkan ke tag 54, lalu CRC16 dihitung ulang.
// Aplikasi pembayaran langsung menampilkan nominalnya; panitia tetap mencocokkan uang masuk di GoPay Merchant.

type Tlv = [tag: string, value: string];

function parse(payload: string): Tlv[] {
  const out: Tlv[] = [];
  for (let i = 0; i < payload.length; ) {
    const tag = payload.slice(i, i + 2);
    const len = Number(payload.slice(i + 2, i + 4));
    if (!/^\d{2}$/.test(tag) || !Number.isInteger(len)) throw new Error("Payload QRIS tidak valid");
    out.push([tag, payload.slice(i + 4, i + 4 + len)]);
    i += 4 + len;
  }
  return out;
}

export function crc16(s: string) {
  let crc = 0xffff;
  for (const byte of Buffer.from(s, "utf8")) {
    crc ^= byte << 8;
    for (let b = 0; b < 8; b++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export function dynamicQris(staticPayload: string, amount: number) {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error("Nominal QRIS harus bilangan bulat positif");
  const fields = parse(staticPayload.trim())
    .filter(([tag]) => tag !== "54" && tag !== "63")
    .map(([tag, v]): Tlv => [tag, tag === "01" ? "12" : v]);
  fields.push(["54", String(amount)]);
  fields.sort((a, b) => a[0].localeCompare(b[0]));
  const body = fields.map(([tag, v]) => `${tag}${String(v.length).padStart(2, "0")}${v}`).join("") + "6304";
  return body + crc16(body);
}

// Isi QR pada public/qris-drivetech.jpg (merchant "Drive Tech", NMID ID1026472717465, terminal A01). Bukan rahasia,
// karena gambar QRIS-nya memang dibagikan. Bisa diganti lewat env QRIS_STATIC_PAYLOAD tanpa mengubah kode.
const QRIS_STATIC_DRIVETECH =
  "00020101021126610014COM.GO-JEK.WWW01189360091430182701300210G0182701300303UMI51440014ID.CO.QRIS.WWW0215ID10264727174650303UMI5204573453033605802ID5910Drive Tech6006MALANG61056514662070703A01630482F5";
export const qrisStatic = () => process.env.QRIS_STATIC_PAYLOAD?.trim() || QRIS_STATIC_DRIVETECH;
