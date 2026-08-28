"use client";

import Link from "next/link";
import { useActionState, useId, useState } from "react";
import type { FormEvent, ReactNode } from "react";

import { DateChips, type DateChipStatus } from "@/components/denah/DateChips";
import { FotoInput } from "@/components/forms/FotoInput";
import { Alert } from "@/components/ui/Alert";
import { buttonClass } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { createBookingAction } from "@/lib/actions/booking";
import { initialActionState } from "@/lib/actions/state";
import {
  EVENT_INFO,
  isVehicleZoneType,
  TRANSMISSION_LABEL,
  TRANSMISSION_OPTIONS,
} from "@/lib/domain/constants";
import { slotAdminFee } from "@/lib/domain/harga";
import { hitungTotalBiaya } from "@/lib/domain/ketersediaan";
import { TENANT_TYPE_BY_ZONE_TYPE, TENANT_TYPE_LABEL } from "@/lib/domain/labels";
import type { BookingStatus, SlotDetail, TenantType } from "@/lib/types/database";
import { formatRupiah } from "@/lib/utils";

const TENANT_TYPES: readonly TenantType[] = [
  "dealer_mobil_baru",
  "individu_bekas",
  "umkm",
  "warung",
];

export type BookingFormProps = {
  slot: SlotDetail;
  /** Tanggal gelaran aktif mendatang ("YYYY-MM-DD", urut naik) — kandidat chip. */
  eventDates: string[];
  /** Tanggal yang SUDAH dipegang booking aktif lain untuk slot ini. */
  takenDates: Record<string, BookingStatus>;
  /** Pilihan awal (dari ?tanggal= di URL, sudah disaring halaman). */
  initialDates: string[];
};

/**
 * Form data penyewa + pemilih tanggal sewa (model per tanggal).
 *
 * KONTRAK dengan server action: tanggal terpilih dikirim lewat SATU hidden input
 * name="eventDates" berisi JSON array string "YYYY-MM-DD" — dibaca
 * ambilEventDates() di src/lib/actions/booking.ts lalu divalidasi zod + service.
 *
 * Field tambahan per jenis tenant dikirim dengan awalan "detail.<key>" dan
 * dikumpulkan server action jadi kolom jsonb tenants.detail — sesuai
 * createBookingSchema yang menerima `detail: Record<string, unknown>`.
 */
export function BookingForm({ slot, eventDates, takenDates, initialDates }: BookingFormProps) {
  const [state, formAction] = useActionState(createBookingAction, initialActionState);
  const id = useId();

  /* ---------- Tanggal sewa (>= 1, hanya tanggal yang masih bebas) ---------- */
  const [dipilih, setDipilih] = useState<string[]>(initialDates);
  const [galatTanggal, setGalatTanggal] = useState<string | null>(null);

  function toggleTanggal(tanggal: string) {
    setGalatTanggal(null);
    setDipilih((sebelum) =>
      sebelum.includes(tanggal)
        ? sebelum.filter((t) => t !== tanggal)
        : [...sebelum, tanggal].sort(),
    );
  }

  /** Validasi client min 1 tanggal; server tetap memvalidasi ulang lewat zod. */
  function cekSebelumKirim(event: FormEvent<HTMLFormElement>) {
    if (dipilih.length === 0) {
      event.preventDefault();
      setGalatTanggal("Pilih minimal satu tanggal gelaran.");
    }
  }

  // Harga efektif WAJIB lewat slotAdminFee (override per slot ?? harga zona) —
  // nilai inilah yang dipakai server saat menagih (createBooking).
  const biayaPerTanggal = slotAdminFee(slot, slot.zone);
  const totalBiaya = hitungTotalBiaya(biayaPerTanggal, dipilih.length);
  const adaTerisi = eventDates.some((t) => takenDates[t] !== undefined);

  /** Status chip per tanggal untuk slot INI (dipakai DateChips sadar-slot). */
  function statusTanggal(tanggal: string): DateChipStatus {
    const status = takenDates[tanggal];
    if (status === "confirmed") return "confirmed";
    if (status === "pending_payment") return "pending";
    return "free";
  }

  // Jenis tenant mengikuti tipe zona slot. Zona non-bookable tidak pernah sampai
  // ke form ini, tapi kalau petanya null, select dikunci sebagai pengaman.
  const otomatis = TENANT_TYPE_BY_ZONE_TYPE[slot.zone.zone_type];
  const terkunci = otomatis === null;
  const [tenantType, setTenantType] = useState<TenantType>(otomatis ?? "umkm");

  const errors = state.fieldErrors ?? {};
  const pesanUmum = state.status === "error" ? state.message : undefined;

  const galatEventDates = galatTanggal ?? errors.eventDates;

  return (
    <form action={formAction} onSubmit={cekSebelumKirim} className="space-y-4" noValidate>
      <input type="hidden" name="slotId" value={slot.id} />
      {/* KONTRAK action: satu hidden input JSON array "YYYY-MM-DD". */}
      <input type="hidden" name="eventDates" value={JSON.stringify(dipilih)} />

      {pesanUmum ? (
        <div className="anim-rise">
          <Alert tone="error" title="Booking belum bisa diproses">
            {pesanUmum}
          </Alert>
        </div>
      ) : null}

      {/* ---------- Pilih tanggal sewa (chips ala pilih jadwal bioskop) ---------- */}
      <fieldset>
        <legend className="text-sm font-medium text-ink">
          Tanggal sewa
          <span className="ml-0.5 text-danger" aria-hidden="true">
            *
          </span>
        </legend>
        <p className="mt-1 text-xs text-muted">
          Jadwal gelaran: {EVENT_INFO.scheduleText}. Bisa pilih lebih dari satu tanggal.
        </p>

        <DateChips
          className="mt-2.5"
          dates={eventDates}
          statusFor={statusTanggal}
          selected={dipilih}
          onToggle={toggleTanggal}
        />

        {adaTerisi ? (
          <p className="mt-2 text-xs text-subtle">
            Tanggal berlabel status sudah dipesan penyewa lain untuk slot ini.
          </p>
        ) : null}
        {galatEventDates ? (
          <p className="mt-2 text-xs font-medium text-danger" role="alert">
            {galatEventDates}
          </p>
        ) : null}
      </fieldset>

      {/* ---------- Ringkasan biaya: Rp <fee> / tanggal x jumlah tanggal ---------- */}
      <div className="rounded-[var(--radius)] border border-line bg-surface-2 p-4 sm:p-5">
        <dl>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-sm text-muted">Biaya admin</dt>
            <dd className="tabular text-sm font-medium text-ink">
              {formatRupiah(biayaPerTanggal)} / tanggal
            </dd>
          </div>
          <div className="mt-1.5 flex items-baseline justify-between gap-3">
            <dt className="text-sm text-muted">Jumlah tanggal</dt>
            <dd className="tabular text-sm font-medium text-ink">{dipilih.length}</dd>
          </div>
          <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-line pt-3">
            <dt className="text-sm font-semibold text-ink">Total</dt>
            <dd className="tabular text-2xl font-bold tracking-[-0.01em] text-accent sm:text-3xl">
              {formatRupiah(totalBiaya)}
            </dd>
          </div>
        </dl>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Nama penyewa"
          htmlFor={`${id}-nama`}
          error={errors.tenantName}
          required
        >
          <Input
            id={`${id}-nama`}
            name="tenantName"
            autoComplete="name"
            placeholder="Contoh: Budi Santoso"
            aria-invalid={errors.tenantName ? true : undefined}
            required
          />
        </Field>

        <Field
          label="Nomor HP / WhatsApp"
          htmlFor={`${id}-hp`}
          hint="Dipakai panitia untuk konfirmasi."
          error={errors.tenantPhone}
          required
        >
          <Input
            id={`${id}-hp`}
            name="tenantPhone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="081234567890"
            aria-invalid={errors.tenantPhone ? true : undefined}
            required
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Email (opsional)" htmlFor={`${id}-email`} error={errors.tenantEmail}>
          <Input
            id={`${id}-email`}
            name="tenantEmail"
            type="email"
            autoComplete="email"
            placeholder="nama@email.com"
            aria-invalid={errors.tenantEmail ? true : undefined}
          />
        </Field>

        <Field
          label="Jenis tenant"
          htmlFor={`${id}-jenis`}
          hint="Mengikuti tipe zona slot yang dipilih."
          error={errors.tenantType}
          required
        >
          <Select
            id={`${id}-jenis`}
            name={terkunci ? undefined : "tenantType"}
            value={tenantType}
            onChange={(event) => setTenantType(event.target.value as TenantType)}
            disabled={terkunci}
            aria-invalid={errors.tenantType ? true : undefined}
            required
          >
            {TENANT_TYPES.map((tipe) => (
              <option key={tipe} value={tipe}>
                {TENANT_TYPE_LABEL[tipe]}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {/* Select yang disabled tidak ikut terkirim — kirim nilainya lewat hidden input. */}
      {terkunci ? <input type="hidden" name="tenantType" value={tenantType} /> : null}

      <DetailFields tenantType={tenantType} idPrefix={id} errors={errors} />

      {isVehicleZoneType(slot.zone.zone_type) ? (
        <VehicleFields
          idPrefix={id}
          errors={errors}
          tampilkanKm={slot.zone.zone_type !== "mobil_baru"}
          pilihJenis={slot.zone.zone_type === "mobil_motor_bekas"}
        />
      ) : null}

      <div className="border-t border-line pt-4">
        <Field
          label="Catatan untuk panitia (opsional)"
          htmlFor={`${id}-catatan`}
          error={errors.notes}
        >
          <Textarea id={`${id}-catatan`} name="notes" rows={3} placeholder="Tulis di sini…" />
        </Field>
      </div>

      {/* Footer aksi: ghost "Batal" kiri, submit pil hitam kanan. */}
      <div className="space-y-3 border-t border-line pt-4">
        <p className="text-xs text-muted">
          Slot langsung dikunci untuk tanggal terpilih begitu formulir dikirim.
        </p>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/" className={buttonClass("ghost", "md")}>
            Batal
          </Link>
          <SubmitButton pendingText="Mengunci slot…">Lanjutkan ke Pembayaran</SubmitButton>
        </div>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Field tambahan per jenis tenant (disimpan ke tenants.detail jsonb)   */
/* ------------------------------------------------------------------ */

type DetailFieldsProps = {
  tenantType: TenantType;
  idPrefix: string;
  errors: Record<string, string>;
};

function DetailFields({ tenantType, idPrefix, errors }: DetailFieldsProps) {
  if (tenantType === "umkm") {
    return (
      <DetailGroup judul="Data UMKM">
        <Field
          label="Kategori produk"
          htmlFor={`${idPrefix}-kategori`}
          error={errors["detail.kategori_produk"]}
        >
          <Input
            id={`${idPrefix}-kategori`}
            name="detail.kategori_produk"
            placeholder="Contoh: Fashion, kerajinan, aksesori"
          />
        </Field>
        <Field
          label="Nama brand"
          htmlFor={`${idPrefix}-brand`}
          error={errors["detail.nama_brand"]}
        >
          <Input
            id={`${idPrefix}-brand`}
            name="detail.nama_brand"
            placeholder="Contoh: Batik Nusantara"
          />
        </Field>
      </DetailGroup>
    );
  }

  if (tenantType === "dealer_mobil_baru") {
    return (
      <DetailGroup judul="Data Dealer">
        <Field
          label="Nama dealer"
          htmlFor={`${idPrefix}-dealer`}
          error={errors["detail.nama_dealer"]}
        >
          <Input
            id={`${idPrefix}-dealer`}
            name="detail.nama_dealer"
            placeholder="Contoh: Auto Prima Motor"
          />
        </Field>
        <Field
          label="Merek yang dibawa"
          htmlFor={`${idPrefix}-merek`}
          hint="Pisahkan dengan koma kalau lebih dari satu."
          error={errors["detail.merek_dibawa"]}
        >
          <Input
            id={`${idPrefix}-merek`}
            name="detail.merek_dibawa"
            placeholder="Contoh: Toyota, Daihatsu"
          />
        </Field>
      </DetailGroup>
    );
  }

  if (tenantType === "individu_bekas") {
    return (
      <DetailGroup judul="Data Unit Bekas">
        <Field
          label="Jumlah unit"
          htmlFor={`${idPrefix}-jumlah`}
          hint="Perkiraan jumlah kendaraan yang dipajang."
          error={errors["detail.jumlah_unit"]}
        >
          <Input
            id={`${idPrefix}-jumlah`}
            name="detail.jumlah_unit"
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            placeholder="Contoh: 3"
          />
        </Field>
        <Field
          label="Merek / tipe unit"
          htmlFor={`${idPrefix}-tipe`}
          error={errors["detail.merek_tipe_unit"]}
        >
          <Input
            id={`${idPrefix}-tipe`}
            name="detail.merek_tipe_unit"
            placeholder="Contoh: Honda Beat 2019, Avanza 2016"
          />
        </Field>
      </DetailGroup>
    );
  }

  return (
    <DetailGroup judul="Data Warung">
      <Field
        label="Jenis makanan / minuman"
        htmlFor={`${idPrefix}-dagangan`}
        error={errors["detail.jenis_dagangan"]}
      >
        <Input
          id={`${idPrefix}-dagangan`}
          name="detail.jenis_dagangan"
          placeholder="Contoh: Mie rebus, kopi, es teh"
        />
      </Field>

      <div className="space-y-1.5">
        <span className="block text-sm font-medium text-ink">Kebutuhan listrik</span>
        {/*
          Checkbox HTML tidak mengirim apa pun saat tidak dicentang. Hidden input
          bernama sama diletakkan LEBIH DULU sebagai nilai bawaan "Tidak";
          saat dicentang, nilai checkbox ("Ya") yang datang belakangan menimpanya
          di server action (ambilDetail memakai penugasan terakhir).
        */}
        <input type="hidden" name="detail.butuh_listrik" value="Tidak" />
        <label className="flex min-h-11 items-center gap-2.5 text-sm text-ink">
          <input
            type="checkbox"
            name="detail.butuh_listrik"
            value="Ya"
            className="h-4 w-4 rounded border-line-strong accent-accent"
          />
          Butuh sambungan listrik di lokasi warung
        </label>
      </div>
    </DetailGroup>
  );
}

/* ------------------------------------------------------------------ */
/* Data kendaraan untuk katalog publik (khusus zona kendaraan)          */
/* ------------------------------------------------------------------ */

type VehicleFieldsProps = {
  idPrefix: string;
  errors: Record<string, string>;
  /** Kilometer hanya relevan untuk kendaraan bekas. */
  tampilkanKm: boolean;
  /** Pilihan mobil/motor hanya di zona campuran; zona lain selalu mobil. */
  pilihJenis: boolean;
};

/**
 * Diisi penyewa slot; hasilnya tampil di /katalog untuk pengunjung umum
 * SETELAH pembayaran diverifikasi panitia. 1 slot = 1 kendaraan.
 */
function VehicleFields({ idPrefix, errors, tampilkanKm, pilihJenis }: VehicleFieldsProps) {
  return (
    <div role="group" aria-label="Data kendaraan" className="space-y-4 border-t border-line pt-4">
      <div>
        <p className="text-xs font-semibold tracking-wide text-subtle uppercase">
          Data Kendaraan untuk Katalog
        </p>
        <p className="mt-1 text-xs text-muted">
          Ditampilkan di katalog online untuk pengunjung setelah pembayaran terverifikasi —
          lengkapi agar unit Anda mudah ditemukan pembeli.
        </p>
      </div>

      {pilihJenis ? (
        <Field
          label="Jenis kendaraan"
          htmlFor={`${idPrefix}-jenis-kendaraan`}
          error={errors["vehicle.kind"]}
          required
        >
          <Select
            id={`${idPrefix}-jenis-kendaraan`}
            name="vehicleKind"
            defaultValue="mobil"
            aria-invalid={errors["vehicle.kind"] ? true : undefined}
            required
          >
            <option value="mobil">Mobil</option>
            <option value="motor">Motor</option>
          </Select>
        </Field>
      ) : (
        <input type="hidden" name="vehicleKind" value="mobil" />
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Nama kendaraan"
          htmlFor={`${idPrefix}-kendaraan`}
          error={errors["vehicle.vehicleName"]}
          required
        >
          <Input
            id={`${idPrefix}-kendaraan`}
            name="vehicleName"
            placeholder="Contoh: Toyota Avanza G 2019"
            aria-invalid={errors["vehicle.vehicleName"] ? true : undefined}
            required
          />
        </Field>

        <Field
          label="Nomor plat"
          htmlFor={`${idPrefix}-plat`}
          error={errors["vehicle.plateNumber"]}
          required
        >
          <Input
            id={`${idPrefix}-plat`}
            name="plateNumber"
            placeholder="Contoh: N 1234 AB"
            className="uppercase"
            aria-invalid={errors["vehicle.plateNumber"] ? true : undefined}
            required
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Harga jual (Rp)"
          htmlFor={`${idPrefix}-harga`}
          error={errors["vehicle.price"]}
          required
        >
          <Input
            id={`${idPrefix}-harga`}
            name="vehiclePrice"
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            placeholder="Contoh: 135000000"
            aria-invalid={errors["vehicle.price"] ? true : undefined}
            required
          />
        </Field>

        <Field label="Tahun" htmlFor={`${idPrefix}-tahun`} error={errors["vehicle.year"]}>
          <Input
            id={`${idPrefix}-tahun`}
            name="vehicleYear"
            type="number"
            inputMode="numeric"
            min={1950}
            max={2100}
            step={1}
            placeholder="Contoh: 2019"
            aria-invalid={errors["vehicle.year"] ? true : undefined}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {tampilkanKm ? (
          <Field
            label="Kilometer"
            htmlFor={`${idPrefix}-km`}
            error={errors["vehicle.mileageKm"]}
          >
            <Input
              id={`${idPrefix}-km`}
              name="vehicleMileage"
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              placeholder="Contoh: 45000"
              aria-invalid={errors["vehicle.mileageKm"] ? true : undefined}
            />
          </Field>
        ) : null}

        <Field
          label="Transmisi"
          htmlFor={`${idPrefix}-transmisi`}
          error={errors["vehicle.transmission"]}
        >
          <Select
            id={`${idPrefix}-transmisi`}
            name="vehicleTransmission"
            defaultValue=""
            aria-invalid={errors["vehicle.transmission"] ? true : undefined}
          >
            <option value="">Pilih transmisi…</option>
            {TRANSMISSION_OPTIONS.map((opsi) => (
              <option key={opsi} value={opsi}>
                {TRANSMISSION_LABEL[opsi]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Warna" htmlFor={`${idPrefix}-warna`} error={errors["vehicle.color"]}>
          <Input
            id={`${idPrefix}-warna`}
            name="vehicleColor"
            placeholder="Contoh: Hitam metalik"
          />
        </Field>
      </div>

      <Field
        label="Deskripsi unit (opsional)"
        htmlFor={`${idPrefix}-deskripsi`}
        hint="Kondisi, kelengkapan surat, keunggulan unit, dsb."
        error={errors["vehicle.description"]}
      >
        <Textarea
          id={`${idPrefix}-deskripsi`}
          name="vehicleDescription"
          rows={3}
          placeholder="Contoh: Pajak hidup, servis rutin, tangan pertama…"
        />
      </Field>

      <FotoInput
        name="vehiclePhoto"
        id={`${idPrefix}-foto`}
        label="Foto terbaik kendaraan"
        error={errors.vehiclePhoto ?? errors["vehicle.photoUrl"]}
        required
      />
    </div>
  );
}

/** Kelompok field tambahan: dipisah garis + judul kecil, bukan kartu bersarang. */
function DetailGroup({ judul, children }: { judul: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={judul} className="space-y-4 border-t border-line pt-4">
      <p className="text-xs font-semibold tracking-wide text-subtle uppercase">{judul}</p>
      {children}
    </div>
  );
}
