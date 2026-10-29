"use client";

import { startTransition, useActionState, useState } from "react";
import type { ReactNode } from "react";

import { StempelInput, TandaTanganPad } from "@/components/forms/TandaTanganPad";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Field";
import { kirimFormulirDealerAction } from "@/lib/actions/formulir-dealer";
import { initialActionState } from "@/lib/actions/state";
import {
  hitungBiaya,
  JUMLAH_BARIS_UNIT,
  KOMITMEN_DEALER,
  LAPAK_DEALER,
  rupiah,
  TANGGAL_DEALER,
  type DataDealer,
} from "@/lib/domain/formulir-dealer";

function Bagian({ judul, children }: { judul: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-4 border-t border-line pt-6">
      <legend className="judul -mt-1 pr-3 text-2xl text-ink">{judul}</legend>
      {children}
    </fieldset>
  );
}

const DUA_KOLOM = "grid gap-4 sm:grid-cols-2";

export function FormulirDealerForm() {
  const [state, formAction, isPending] = useActionState(kirimFormulirDealerAction, initialActionState);
  const galat = state.fieldErrors ?? {};
  const [isian, setIsian] = useState<DataDealer>({});
  const [adaTtd, setAdaTtd] = useState(false);
  const biaya = hitungBiaya(isian);

  // Kolom teks bebas: nama form = kunci data = nama kolom PDF.
  const teks = (nama: string, label: string, opsi: { wajib?: boolean; hint?: string; tipe?: string; auto?: string } = {}) => (
    <Field label={label} htmlFor={`dl-${nama}`} error={galat[nama]} hint={opsi.hint} required={opsi.wajib}>
      <Input
        id={`dl-${nama}`}
        name={nama}
        type={opsi.tipe ?? "text"}
        inputMode={opsi.tipe === "tel" ? "tel" : undefined}
        autoComplete={opsi.auto ?? "off"}
        required={opsi.wajib}
        aria-invalid={galat[nama] ? true : undefined}
      />
    </Field>
  );

  return (
    // onSubmit (bukan action=) supaya isian tidak dikosongkan React saat ada galat.
    <form
      className="space-y-8"
      onChange={(e) => {
        const data: DataDealer = {};
        new FormData(e.currentTarget).forEach((v, k) => {
          if (typeof v === "string" && v && k !== "ttd" && k !== "stempel") data[k] = v === "on" ? "ya" : v;
        });
        setIsian(data);
      }}
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => formAction(data));
      }}
    >
      <Bagian judul="A. Data dealer">
        {teks("nama_dealer", "Nama dealer (sesuai papan nama)", { wajib: true, auto: "organization" })}
        {teks("badan_usaha", "Nama badan usaha", { wajib: true, hint: "PT, CV, atau perorangan." })}
        {teks("alamat", "Alamat dealer", { wajib: true, auto: "street-address" })}
        <div className={DUA_KOLOM}>
          {teks("merek", "Merek", { wajib: true, hint: "Contoh: Honda, Toyota, Yamaha." })}
          {teks("telepon_kantor", "Telepon kantor", { tipe: "tel" })}
          {teks("email", "Email", { tipe: "email", auto: "email" })}
          {teks("instagram", "Instagram")}
          {teks("npwp", "NPWP (untuk kuitansi)")}
          {teks("kuitansi_atas_nama", "Kuitansi atas nama")}
        </div>
      </Bagian>

      <Bagian judul="B. Penanggung jawab">
        <div className={DUA_KOLOM}>
          {teks("pimpinan", "Nama pimpinan", { wajib: true, hint: "Nama ini tertulis di bawah tanda tangan." })}
          {teks("jabatan", "Jabatan", { wajib: true })}
          {teks("pic", "PIC pendaftaran", { wajib: true })}
          {teks("wa_pic", "WhatsApp PIC", { wajib: true, tipe: "tel" })}
          {teks("pic_lapangan", "PIC lapangan hari H")}
          {teks("wa_pic_lapangan", "WhatsApp PIC lapangan", { tipe: "tel" })}
          {teks("jumlah_penjaga", "Jumlah penjaga booth per hari", { tipe: "number" })}
        </div>
      </Bagian>

      <Bagian judul="C. Pilihan lapak">
        <p className="text-sm text-muted">
          Nomor lapak mengikuti{" "}
          <a href="/denah" target="_blank" className="font-semibold text-accent underline underline-offset-4">
            denah
          </a>
          . Bila satu nomor lapak diminati lebih dari satu dealer, lapak dikunci untuk dealer yang lebih dulu membayar.
        </p>
        {LAPAK_DEALER.map((l) => (
          <div key={l.kode} className="grid gap-4 border border-line bg-surface-2 p-4 sm:grid-cols-[1fr_8rem_12rem]">
            <div>
              <p className="font-semibold text-ink">{l.label}</p>
              <p className="text-sm text-muted">{rupiah(l.harga)} per lapak per tanggal</p>
            </div>
            <Field label="Jumlah lapak" htmlFor={`dl-jumlah_${l.kode}`} error={galat[`jumlah_${l.kode}`]}>
              <Input id={`dl-jumlah_${l.kode}`} name={`jumlah_${l.kode}`} type="number" min={0} max={20} inputMode="numeric" />
            </Field>
            {teks(`nomor_${l.kode}`, "Nomor lapak pilihan")}
          </div>
        ))}
      </Bagian>

      <Bagian judul="D. Tanggal ikut">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {TANGGAL_DEALER.map((t, i) => (
            <label key={t} className="flex min-h-11 cursor-pointer items-center gap-2 border border-line bg-surface-2 px-3 text-sm text-ink has-[:checked]:border-accent">
              <input type="checkbox" name={`tgl_${i + 1}`} className="size-4 accent-[var(--accent)]" />
              {t}
            </label>
          ))}
        </div>
        {galat.tgl_1 ? <p className="text-xs font-medium text-danger" role="alert">{galat.tgl_1}</p> : null}
        <p className="text-sm text-muted">Pembukaan Sabtu dan Minggu, 7 dan 8 November 2026, dihitung satu tanggal.</p>
      </Bagian>

      <Bagian judul="E. Unit yang dipajang">
        {Array.from({ length: JUMLAH_BARIS_UNIT }, (_, i) => i + 1).map((n) => (
          <div key={n} className="grid grid-cols-2 gap-3 sm:grid-cols-[2fr_1fr_6rem_5rem_7rem]">
            <div className="col-span-2 sm:col-span-1">
              <Input name={`unit_${n}_tipe`} placeholder={`${n}. Merek dan tipe`} aria-label={`Unit ${n}, merek dan tipe`} />
            </div>
            <Input name={`unit_${n}_warna`} placeholder="Warna" aria-label={`Unit ${n}, warna`} />
            <Input name={`unit_${n}_tahun`} placeholder="Tahun" inputMode="numeric" aria-label={`Unit ${n}, tahun model`} />
            <Input name={`unit_${n}_jumlah`} placeholder="Jumlah" inputMode="numeric" aria-label={`Unit ${n}, jumlah`} />
            <Select name={`unit_${n}_test_drive`} defaultValue="" aria-label={`Unit ${n}, test drive`}>
              <option value="">Test drive?</option>
              <option value="ya">Ya</option>
              <option value="tidak">Tidak</option>
            </Select>
          </div>
        ))}
      </Bagian>

      <Bagian judul="F. Kebutuhan teknis">
        <div className={DUA_KOLOM}>
          {teks("daya_listrik", "Perkiraan daya listrik (watt)", { tipe: "number" })}
          {teks("tenda", "Tenda atau kanopi sendiri (ukuran)")}
        </div>
        {teks("peralatan_listrik", "Peralatan listrik yang dibawa", { hint: "Lampu, TV, sound, lainnya." })}
        {teks("kendaraan_loading", "Kendaraan pengangkut saat loading", { hint: "Jenis dan jumlah." })}
        {teks("promo", "Program promo untuk pengunjung")}
      </Bagian>

      <Bagian judul="H. Pembayaran">
        <div className="border border-line bg-surface-2 p-4">
          <p className="text-sm text-muted">
            {biaya.lapak} lapak x {biaya.tanggal} tanggal
          </p>
          <p className="judul mt-1 text-4xl text-accent">{rupiah(biaya.total)}</p>
          <p className="mt-2 text-sm text-muted">
            Pembayaran lewat QRIS. Nominal di atas Rp500.000 ditambah biaya layanan QRIS. Batas pelunasan 3 hari
            sebelum tanggal ikut pertama.
          </p>
        </div>
      </Bagian>

      <Bagian judul="I. Persetujuan dan tanda tangan">
        <details className="border border-line bg-surface-2 p-4 text-sm text-ink/85">
          <summary className="cursor-pointer font-semibold text-ink">Baca Surat Pernyataan Komitmen Dealer</summary>
          <ol className="mt-3 list-decimal space-y-2 pl-5">
            {KOMITMEN_DEALER.map((k) => (
              <li key={k}>{k}</li>
            ))}
          </ol>
        </details>
        <label className="flex cursor-pointer items-start gap-3 text-sm text-ink">
          <input type="checkbox" name="setuju" required className="mt-0.5 size-5 shrink-0 accent-[var(--accent)]" />
          Data di atas benar, dan dealer menyetujui Surat Pernyataan Komitmen Dealer.
        </label>
        {galat.setuju ? <p className="text-xs font-medium text-danger" role="alert">{galat.setuju}</p> : null}

        <div className="space-y-2">
          <p className="text-sm font-medium text-ink">Tanda tangan pimpinan atau pejabat berwenang</p>
          <p className="text-xs text-muted">
            Boleh dikosongkan dulu. Setelah dikirim, tanda tangan bisa menyusul di perangkat lain lewat tautan formulir,
            misalnya di iPad panitia saat di lokasi.
          </p>
          <TandaTanganPad name="ttd" onChange={setAdaTtd} />
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium text-ink">Foto stempel (opsional)</p>
          <StempelInput name="stempel" />
        </div>
      </Bagian>

      {state.status === "error" && state.message ? <Alert tone="error">{state.message}</Alert> : null}
      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? "Menyimpan…" : adaTtd ? "Kirim formulir" : "Kirim, tanda tangan menyusul"}
      </Button>
    </form>
  );
}
