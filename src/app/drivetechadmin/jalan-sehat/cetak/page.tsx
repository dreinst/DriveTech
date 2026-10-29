import type { Metadata } from "next";
import Link from "next/link";

import { TombolCetak } from "@/components/admin/TiketJalanSehat";
import { Alert } from "@/components/ui/Alert";
import { JALAN_SEHAT, nomorTiket, SYARAT_AMBIL_HADIAH } from "@/lib/domain/jalan-sehat";
import { requireAdmin } from "@/lib/services/auth";
import { listPesertaJalanSehat, type PesertaJalanSehat } from "@/lib/services/jalan-sehat";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Cetak Tiket Jalan Sehat" };

const PILIHAN = {
  baru: {
    judul: "Tiket online belum dicetak",
    saring: (p: PesertaJalanSehat) => p.aktif && p.sumber !== "tempat" && !p.dicetak_at,
  },
  semua: { judul: "Semua tiket online", saring: (p: PesertaJalanSehat) => p.aktif && p.sumber !== "tempat" },
  kosong: {
    judul: "Tiket kosong belum dicetak",
    saring: (p: PesertaJalanSehat) => p.sumber === "tempat" && !p.dicetak_at,
  },
} as const;

type PageProps = { searchParams: Promise<{ pilih?: string }> };

/** Satu tiket ukuran seperdelapan A4 (105 x 74 mm). */
function Tiket({ p, urutan }: { p: PesertaJalanSehat; urutan: string | null }) {
  const kosong = p.sumber === "tempat";
  return (
    <article className="tiket-cetak flex flex-col border border-dashed border-black/50 p-[5mm] text-black">
      <div className="flex items-baseline justify-between border-b-2 border-[#ff7b00] pb-[1.5mm]">
        <span className="judul text-[15pt] leading-none">{JALAN_SEHAT.judul}</span>
        <span className="text-[7.5pt] tracking-widest uppercase">Tiket undian</span>
      </div>
      <div className="flex flex-1 items-center gap-[4mm]">
        <span className="judul text-[54pt] leading-none text-[#c25e00] tabular-nums">{nomorTiket(p.id)}</span>
        <div className="min-w-0 flex-1 text-[9pt] leading-snug">
          {kosong && !p.nama ? (
            <>
              <p className="mt-[3mm] border-b border-black/60 pb-[0.5mm] text-black/60">Nama</p>
              <p className="mt-[4mm] border-b border-black/60 pb-[0.5mm] text-black/60">No. HP</p>
            </>
          ) : (
            <>
              <p className="truncate text-[11pt] font-semibold">{p.nama}</p>
              {p.domisili ? <p className="truncate text-black/70">{p.domisili}</p> : null}
              {urutan ? <p className="text-black/70">{urutan}</p> : null}
            </>
          )}
        </div>
      </div>
      <p className="text-[7.5pt] leading-snug text-black/80">
        {JALAN_SEHAT.tanggal}, mulai {JALAN_SEHAT.mulai}. {JALAN_SEHAT.lokasi}.
      </p>
      <p className="mt-[1mm] text-[7.5pt] leading-snug font-semibold">{SYARAT_AMBIL_HADIAH}</p>
    </article>
  );
}

export default async function CetakTiketPage({ searchParams }: PageProps) {
  await requireAdmin();
  const kunci = (await searchParams).pilih;
  const pilihan = PILIHAN[kunci === "semua" || kunci === "kosong" ? kunci : "baru"];
  const hasil = await listPesertaJalanSehat();
  const semua = hasil.ok ? hasil.data : [];
  // "peserta 2 dari 5" dihitung dari seluruh tiket pesanan, bukan hanya yang tampil di lembar ini.
  const perPesanan = new Map<number, number[]>();
  for (const t of semua) if (t.pesanan_id) perPesanan.set(t.pesanan_id, [...(perPesanan.get(t.pesanan_id) ?? []), t.id]);
  const urutan = (t: PesertaJalanSehat) => {
    const ids = t.pesanan_id ? (perPesanan.get(t.pesanan_id) ?? []) : [];
    return ids.length > 1 ? `peserta ${ids.indexOf(t.id) + 1} dari ${ids.length}` : null;
  };
  // Tiket satu pesanan berdampingan supaya mudah diklip per rombongan.
  const tiket = semua
    .filter(pilihan.saring)
    .sort((a, b) => (a.pesanan_id ?? 0) - (b.pesanan_id ?? 0) || a.id - b.id);

  return (
    <div className="space-y-6">
      {/* Saat dicetak hanya lembar tiket yang tampil, tanpa navigasi admin. */}
      <style>{`
        @page { size: A4; margin: 0; }
        .lembar-cetak { display: grid; grid-template-columns: repeat(2, 105mm); grid-auto-rows: 74mm; width: 210mm; background: #fff; }
        .tiket-cetak { break-inside: avoid; }
        @media print {
          html, body { background: #fff !important; }
          body * { visibility: hidden; }
          .lembar-cetak, .lembar-cetak * { visibility: visible; }
          .lembar-cetak { position: absolute; left: 0; top: 0; }
          .tiket-cetak:nth-child(8n) { break-after: page; }
        }
      `}</style>

      <header className="space-y-2 print:hidden">
        <Link href="/drivetechadmin/jalan-sehat" className="text-sm text-accent underline underline-offset-4">
          Kembali ke Jalan Sehat
        </Link>
        <h1 className="text-3xl font-bold tracking-[-0.02em] text-ink sm:text-4xl">{pilihan.judul}</h1>
        <p className="text-sm text-muted">
          {tiket.length} tiket, {Math.ceil(tiket.length / 8)} lembar A4. Di dialog cetak pilih ukuran A4, skala
          100%, dan matikan header/footer. Pilih &quot;Simpan sebagai PDF&quot; kalau mau dicetak di tempat lain.
        </p>
      </header>

      {!hasil.ok ? (
        <Alert tone="error" title="Tiket belum bisa dimuat">
          {hasil.error}
        </Alert>
      ) : null}

      <TombolCetak ids={tiket.map((p) => p.id)} />

      {tiket.length === 0 ? (
        <p className="text-muted print:hidden">Tidak ada tiket untuk pilihan ini.</p>
      ) : (
        <div className="overflow-x-auto">
          <div className="lembar-cetak">
            {tiket.map((p) => (
              <Tiket key={p.id} p={p} urutan={urutan(p)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
