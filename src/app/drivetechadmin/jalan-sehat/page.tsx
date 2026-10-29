import type { Metadata } from "next";
import Link from "next/link";

import { ExportCsvButton } from "@/components/admin/ExportCsvButton";
import { AksiPesanan, AktifkanTiket, BuatTiketKosong } from "@/components/admin/TiketJalanSehat";
import { UndiDoorprize } from "@/components/admin/UndiDoorprize";
import { Alert } from "@/components/ui/Alert";
import { buttonClass } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Field";
import { totalBayar, totalBersih } from "@/lib/domain/harga";
import { HARGA_TIKET_JS, nomorTiket, STATUS_PESANAN_JS, SUMBER_JALAN_SEHAT } from "@/lib/domain/jalan-sehat";
import { requireAdmin } from "@/lib/services/auth";
import { listPesanan, listPesertaJalanSehat, type PesertaJalanSehat } from "@/lib/services/jalan-sehat";
import { resolveProofUrl } from "@/lib/storage";
import { formatRupiah, formatTanggalWaktu } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Jalan Sehat" };

type PageProps = { searchParams: Promise<{ q?: string }> };

// Pesanan yang perlu tindakan tampil di atas.
const URUT_STATUS = { dicek: 0, menunggu: 1, lunas: 2, batal: 3 } as const;

/** Cocokkan pencarian panitia: nomor tiket (0127 atau 127), nama, atau nomor WA. */
function cocok(p: PesertaJalanSehat, q: string): boolean {
  if (/^\d{1,6}$/.test(q) && Number(q) === p.id) return true;
  const teks = q.toLowerCase();
  return [p.nama, p.phone, p.domisili].some((x) => x?.toLowerCase().includes(teks));
}

function status(p: PesertaJalanSehat): string {
  if (!p.aktif) return "Belum terjual";
  return p.menang_at ? "Menang" : "Ikut undian";
}

export default async function AdminJalanSehatPage({ searchParams }: PageProps) {
  await requireAdmin();
  const q = ((await searchParams).q ?? "").trim();
  const [hasil, hasilPesanan] = await Promise.all([listPesertaJalanSehat(), listPesanan()]);

  if (!hasil.ok || !hasilPesanan.ok) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-[-0.02em] text-ink sm:text-4xl">Jalan Sehat</h1>
        <Alert tone="error" title="Peserta belum bisa dimuat">
          {!hasil.ok ? hasil.error : !hasilPesanan.ok ? hasilPesanan.error : null}
        </Alert>
      </div>
    );
  }

  const peserta = hasil.data;
  const aktif = peserta.filter((p) => p.aktif);
  const pemenang = peserta
    .filter((p) => p.menang_at)
    .sort((a, b) => (b.menang_at ?? "").localeCompare(a.menang_at ?? ""));
  const pesanan = [...hasilPesanan.data].sort(
    (a, b) => URUT_STATUS[a.status] - URUT_STATUS[b.status] || b.id - a.id,
  );
  const bukti = new Map(
    await Promise.all(pesanan.map(async (p) => [p.id, await resolveProofUrl(p.proof_url)] as const)),
  );
  const lunas = pesanan.filter((p) => p.status === "lunas");
  const uangOnline = lunas.reduce((n, p) => n + totalBersih(p), 0);
  const perlu = pesanan.filter((p) => p.status === "dicek").length;
  const kosong = peserta.filter((p) => p.sumber === "tempat");
  const kosongTerjual = kosong.filter((p) => p.aktif).length;
  const belumDicetak = aktif.filter((p) => !p.dicetak_at && p.sumber !== "tempat").length;
  const tampil = q ? peserta.filter((p) => cocok(p, q)) : peserta;

  const barisCsv = peserta.map((p) => ({
    Tiket: nomorTiket(p.id),
    Nama: p.nama ?? "",
    WhatsApp: p.phone ?? "",
    Domisili: p.domisili ?? "",
    Sumber: SUMBER_JALAN_SEHAT[p.sumber],
    Status: status(p),
    Dicetak: p.dicetak_at ? formatTanggalWaktu(p.dicetak_at) : "",
    Daftar: formatTanggalWaktu(p.created_at),
    Menang: p.menang_at ? formatTanggalWaktu(p.menang_at) : "",
  }));

  const cetak = (pilih: string) => `/drivetechadmin/jalan-sehat/cetak?pilih=${pilih}`;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-[-0.02em] text-ink sm:text-4xl">Jalan Sehat</h1>
          <p className="text-sm text-muted sm:text-base">
            {aktif.length} tiket ikut undian, {pemenang.length} sudah menang doorprize.
          </p>
        </div>
        <ExportCsvButton filename="peserta-jalan-sehat.csv" rows={barisCsv} />
      </header>

      <dl className="grid gap-3 sm:grid-cols-3">
        {(
          [
            ["Tiket online lunas", `${aktif.length - kosongTerjual}`],
            ["Uang masuk QRIS", formatRupiah(uangOnline)],
            ["Tiket tunai di lokasi", `${kosongTerjual} dari ${kosong.length} (${formatRupiah(kosongTerjual * HARGA_TIKET_JS)})`],
          ] as const
        ).map(([label, nilai]) => (
          <div key={label} className="border border-line bg-card p-4">
            <dt className="text-xs font-medium tracking-wide text-subtle uppercase">{label}</dt>
            <dd className="mt-1 text-2xl font-semibold text-ink">{nilai}</dd>
          </div>
        ))}
      </dl>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-ink">
          Pesanan online{perlu > 0 ? ` (${perlu} bukti perlu dicek)` : ""}
        </h2>
        <p className="text-sm text-muted">
          Cocokkan total bayar dengan mutasi GoPay Merchant, lalu tekan Lunas. Tiket dibuat saat itu dan bot
          WhatsApp mengirim PDF-nya ke chat pemesan. Pesanan tanpa bukti batal otomatis setelah batas bayar.
        </p>
        {pesanan.length === 0 ? (
          <p className="text-sm text-muted">Belum ada pesanan.</p>
        ) : (
          <div className="overflow-x-auto border border-line bg-card">
            <table className="w-full min-w-[960px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-line bg-surface-2 text-left text-xs font-medium tracking-wide text-subtle uppercase">
                  <th scope="col" className="px-3 py-2.5">Kode</th>
                  <th scope="col" className="px-3 py-2.5">Pemesan</th>
                  <th scope="col" className="px-3 py-2.5">Peserta</th>
                  <th scope="col" className="px-3 py-2.5">Total bayar</th>
                  <th scope="col" className="px-3 py-2.5">Status</th>
                  <th scope="col" className="px-3 py-2.5">Bukti</th>
                  <th scope="col" className="px-3 py-2.5">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {pesanan.map((p) => (
                  <tr key={p.id} className="align-top hover:bg-surface-2">
                    <td className="px-3 py-2.5 font-mono font-semibold text-ink">
                      {p.kode}
                      <div className="font-sans text-xs font-normal text-subtle">{SUMBER_JALAN_SEHAT[p.sumber]}</div>
                    </td>
                    <td className="px-3 py-2.5 text-ink">
                      {p.nama}
                      <div className="text-xs text-muted">
                        {p.phone}, {p.domisili}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-ink">{p.jumlah}</td>
                    <td className="px-3 py-2.5 font-semibold whitespace-nowrap text-ink">
                      {formatRupiah(totalBayar(p))}
                      <div className="text-xs font-normal text-subtle">kode unik {p.unique_code ?? "-"}</div>
                    </td>
                    <td className="px-3 py-2.5 text-xs">
                      <span className={p.status === "dicek" ? "font-semibold text-accent" : "text-ink"}>
                        {STATUS_PESANAN_JS[p.status]}
                      </span>
                      <div className="text-subtle">
                        {p.status === "menunggu" ? `batas ${formatTanggalWaktu(p.batas_bayar)}` : null}
                        {p.status === "dicek" ? `masuk ${formatTanggalWaktu(p.submitted_at)}` : null}
                        {p.status === "lunas" ? formatTanggalWaktu(p.verified_at) : null}
                      </div>
                      {p.alasan_tolak && p.status === "menunggu" ? (
                        <div className="text-danger">Ditolak: {p.alasan_tolak}</div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5 text-xs">
                      {bukti.get(p.id) ? (
                        <a href={bukti.get(p.id) ?? "#"} target="_blank" rel="noopener noreferrer" className="text-accent underline">
                          Lihat
                        </a>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <AksiPesanan id={p.id} status={p.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-3 border border-line bg-card p-5">
        <h2 className="text-lg font-semibold text-ink">Cetak tiket</h2>
        <p className="text-sm text-muted">
          Lembar A4 berisi 8 tiket, diurutkan per pesanan supaya tiket satu rombongan bisa diklip jadi satu.
          Setelah dicetak, tekan &quot;Tandai sudah dicetak&quot; supaya cetakan berikutnya cukup memuat tiket
          baru ({belumDicetak} tiket online belum dicetak).
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href={cetak("baru")} className={buttonClass("primary", "sm")}>
            Tiket online belum dicetak
          </Link>
          <Link href={cetak("semua")} className={buttonClass("secondary", "sm")}>
            Semua tiket online
          </Link>
          <Link href={cetak("kosong")} className={buttonClass("secondary", "sm")}>
            Tiket kosong belum dicetak
          </Link>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <BuatTiketKosong />
        <AktifkanTiket />
      </div>

      <Alert tone="info" title="Undian di acara">
        MC atau panitia membuka{" "}
        <Link href="/jalan-sehat/undi" target="_blank" className="font-semibold text-accent underline underline-offset-4">
          /jalan-sehat/undi
        </Link>{" "}
        tanpa login. Layar hanya menampilkan nomor undian dari tiket yang ikut undian. Cocokkan pemenang
        dengan mencari nomornya di tabel bawah (QR di tiket PDF langsung membuka pencarian itu).
      </Alert>

      <UndiDoorprize sisa={aktif.length - aktif.filter((p) => p.menang_at).length} />

      {pemenang.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-ink">Pemenang</h2>
          <ol className="divide-y divide-line border border-line bg-card text-sm">
            {pemenang.map((p) => (
              <li key={p.id} className="flex flex-wrap gap-x-4 px-3 py-2">
                <span className="font-mono font-semibold text-accent">{nomorTiket(p.id)}</span>
                <span className="text-ink">{p.nama ?? "-"}</span>
                <span className="text-muted">{p.domisili}</span>
                <span className="ml-auto text-xs text-subtle">{formatTanggalWaktu(p.menang_at)}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <form className="flex flex-wrap items-center gap-3" role="search">
        <div className="w-full max-w-xs">
          <Input name="q" defaultValue={q} placeholder="Cari nomor tiket, nama, atau WA" aria-label="Cari peserta" />
        </div>
        <button type="submit" className={buttonClass("secondary", "sm")}>
          Cari
        </button>
        {q ? (
          <Link href="/drivetechadmin/jalan-sehat" className="text-sm text-accent underline underline-offset-4">
            Tampilkan semua
          </Link>
        ) : null}
      </form>

      {tampil.length === 0 ? (
        <EmptyState
          title={q ? "Tidak ada yang cocok" : "Belum ada peserta"}
          description={
            q
              ? `Tidak ada tiket atau peserta yang cocok dengan "${q}".`
              : "Tiket muncul di sini setelah pesanan lunas atau tiket kosong dibuat."
          }
        />
      ) : (
        <div className="overflow-x-auto border border-line bg-card">
          <table className="w-full min-w-[880px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line bg-surface-2 text-left text-xs font-medium tracking-wide text-subtle uppercase">
                <th scope="col" className="px-3 py-2.5">Tiket</th>
                <th scope="col" className="px-3 py-2.5">Nama</th>
                <th scope="col" className="px-3 py-2.5">WhatsApp</th>
                <th scope="col" className="px-3 py-2.5">Domisili</th>
                <th scope="col" className="px-3 py-2.5">Sumber</th>
                <th scope="col" className="px-3 py-2.5">Status</th>
                <th scope="col" className="px-3 py-2.5">Dicetak</th>
                <th scope="col" className="px-3 py-2.5">Daftar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {tampil.map((p) => (
                <tr key={p.id} className="hover:bg-surface-2">
                  <td className="px-3 py-2.5 font-mono font-semibold text-ink">{nomorTiket(p.id)}</td>
                  <td className="px-3 py-2.5 text-ink">{p.nama ?? "-"}</td>
                  <td className="px-3 py-2.5 text-muted">{p.phone ?? "-"}</td>
                  <td className="px-3 py-2.5 text-muted">{p.domisili ?? "-"}</td>
                  <td className="px-3 py-2.5 text-muted">{SUMBER_JALAN_SEHAT[p.sumber]}</td>
                  <td className="px-3 py-2.5 text-xs">
                    <span className={p.menang_at ? "font-semibold text-accent" : p.aktif ? "text-ink" : "text-subtle"}>
                      {status(p)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-xs whitespace-nowrap text-muted">
                    {p.dicetak_at ? formatTanggalWaktu(p.dicetak_at) : "-"}
                  </td>
                  <td className="px-3 py-2.5 text-xs whitespace-nowrap text-muted">
                    {formatTanggalWaktu(p.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
