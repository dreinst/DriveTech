import { crc32 } from "node:zlib";

/**
 * Arsip ZIP tanpa kompresi (metode "stored"). Cukup untuk membundel bukti
 * bayar: gambarnya sudah terkompresi, jadi tidak perlu pustaka ZIP.
 * Batas format ini (tanpa ZIP64): 65.535 berkas dan total di bawah 4 GB.
 */
export function buatZip(berkas: { nama: string; isi: Buffer }[]): Buffer {
  const kini = new Date();
  const jam = (kini.getHours() << 11) | (kini.getMinutes() << 5) | (kini.getSeconds() >> 1);
  const hari = ((kini.getFullYear() - 1980) << 9) | ((kini.getMonth() + 1) << 5) | kini.getDate();

  const isiArsip: Buffer[] = [];
  const direktori: Buffer[] = [];
  let posisi = 0;
  for (const { nama, isi } of berkas) {
    const namaBuf = Buffer.from(nama, "utf8");
    const lokal = Buffer.alloc(30);
    lokal.writeUInt32LE(0x04034b50, 0);
    lokal.writeUInt16LE(20, 4); // versi minimal pembuka
    lokal.writeUInt16LE(0x0800, 6); // nama berkas UTF-8
    lokal.writeUInt16LE(0, 8); // metode 0 = stored
    lokal.writeUInt16LE(jam, 10);
    lokal.writeUInt16LE(hari, 12);
    lokal.writeUInt32LE(crc32(isi), 14);
    lokal.writeUInt32LE(isi.length, 18);
    lokal.writeUInt32LE(isi.length, 22);
    lokal.writeUInt16LE(namaBuf.length, 26);

    // Entri direktori pusat memuat ulang byte 4..29 header lokal, digeser 2 byte.
    const pusat = Buffer.alloc(46);
    pusat.writeUInt32LE(0x02014b50, 0);
    pusat.writeUInt16LE(20, 4);
    lokal.copy(pusat, 6, 4, 30);
    pusat.writeUInt32LE(posisi, 42);

    isiArsip.push(lokal, namaBuf, isi);
    direktori.push(pusat, namaBuf);
    posisi += lokal.length + namaBuf.length + isi.length;
  }

  const ukuranDirektori = direktori.reduce((n, b) => n + b.length, 0);
  const akhir = Buffer.alloc(22);
  akhir.writeUInt32LE(0x06054b50, 0);
  akhir.writeUInt16LE(berkas.length, 8);
  akhir.writeUInt16LE(berkas.length, 10);
  akhir.writeUInt32LE(ukuranDirektori, 12);
  akhir.writeUInt32LE(posisi, 16);
  return Buffer.concat([...isiArsip, ...direktori, akhir]);
}
