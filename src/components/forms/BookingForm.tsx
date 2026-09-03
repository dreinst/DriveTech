"use client";

import Link from "next/link";
import {
  startTransition,
  useActionState,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import type { FormEvent, ReactNode } from "react";

import { DateChips, type DateChipStatus } from "@/components/denah/DateChips";
import { FotoInput } from "@/components/forms/FotoInput";
import { useKonfirmasiKeluar } from "@/components/forms/useKonfirmasiKeluar";
import { Alert } from "@/components/ui/Alert";
import { buttonClass } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { createBookingAction, requestEmailCodeAction } from "@/lib/actions/booking";
import { initialActionState } from "@/lib/actions/state";
import {
  EVENT_INFO,
  isNewVehicleZoneType,
  isVehicleZoneType,
  TRANSMISSION_LABEL,
  TRANSMISSION_OPTIONS,
  vehicleKindForZoneType,
  waHref,
} from "@/lib/domain/constants";
import { slotAdminFee } from "@/lib/domain/harga";
import { hitungTotalBiaya } from "@/lib/domain/ketersediaan";
import { TENANT_TYPE_BY_ZONE_TYPE, TENANT_TYPE_LABEL } from "@/lib/domain/labels";
import type { BookingStatus, SlotDetail, TenantType } from "@/lib/types/database";
import { formatRupiah } from "@/lib/utils";

const TENANT_TYPES: readonly TenantType[] = [
  "dealer_mobil_baru",
  "dealer_motor_baru",
  "individu_bekas",
  "umkm",
  "mitra_booth",
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
  /**
   * True bila pengiriman email aktif di server (isEmailConfigured): form
   * menampilkan tombol "Kirim kode verifikasi" + input kode, dan server
   * mewajibkannya. False = langkah kode disembunyikan (email tetap wajib).
   */
  emailOtpAktif: boolean;
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
export function BookingForm({
  slot,
  eventDates,
  takenDates,
  initialDates,
  emailOtpAktif,
}: BookingFormProps) {
  const [state, formAction] = useActionState(createBookingAction, initialActionState);
  const id = useId();

  /* ---------- Kode verifikasi email (OTP) ----------
     Action terpisah dari submit form utama: dipanggil lewat startTransition
     dengan FormData berisi field "email" saja, jadi tidak memicu onSubmit /
     validasi tanggal. Kode dikirim ke email penyewa dan dimasukkan di input
     emailOtp; server mewajibkannya bila pengiriman email aktif. */
  const [otpState, otpAction, otpPending] = useActionState(
    requestEmailCodeAction,
    initialActionState,
  );
  const emailRef = useRef<HTMLInputElement>(null);
  function kirimKodeVerifikasi() {
    const fd = new FormData();
    fd.set("email", emailRef.current?.value ?? "");
    startTransition(() => otpAction(fd));
  }
  const kontakBantuan = EVENT_INFO.contacts[0];

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
      return;
    }
    // Valid & akan dikirim: lepas penjaga keluar (supaya redirect ke halaman
    // bayar tidak memunculkan dialog) lalu bersihkan draft. Kalau server menolak,
    // effect error menyimpannya ulang dari isian yang masih ada di DOM.
    setSedangKirim(true);
    try {
      localStorage.removeItem(`dt-booking-draft:${slot.id}`);
    } catch {
      // abaikan (mode privat).
    }
  }

  /** Satu titik untuk "pengguna mengubah sesuatu": tandai kotor + simpan draft. */
  function tandaiBerubah() {
    setAdaIsian(true);
    simpanDraft();
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

  /* ---------- Draft otomatis per PERANGKAT (anti-hilang saat tekan back) ----------
     Isian disimpan sementara di localStorage browser ini (per slot) lalu
     dipulihkan saat form dibuka lagi. Hanya di perangkat ini — tidak pernah
     dikirim ke server sampai booking benar-benar dibuat. Foto tidak ikut
     (berkas tak bisa disimpan). Draft dihapus saat booking berhasil dikirim. */
  const formRef = useRef<HTMLFormElement>(null);
  const draftKey = `dt-booking-draft:${slot.id}`;
  const lewatiSimpanPertama = useRef(true);

  /* Penjaga "jangan sampai isian hilang": aktif hanya setelah pengguna benar-benar
     mengisi sesuatu, dan dilepas begitu formulir dikirim. */
  const [adaIsian, setAdaIsian] = useState(false);
  const [sedangKirim, setSedangKirim] = useState(false);
  useKonfirmasiKeluar(
    (adaIsian || dipilih.length > 0) && !sedangKirim,
    "Isian Anda belum dikirim dan bisa hilang. Yakin mau keluar dari halaman ini?",
  );

  const simpanDraft = useCallback(() => {
    const form = formRef.current;
    if (!form) return;
    try {
      const fields: Record<string, string> = {};
      for (const [name, value] of new FormData(form).entries()) {
        if (typeof value !== "string") continue; // lewati berkas (foto)
        if (name === "eventDates" || name === "slotId" || name === "tenantType") continue;
        if (name === "emailOtp") continue; // kode sekali pakai, jangan dipulihkan
        if (value.trim().length === 0) continue;
        fields[name] = value;
      }
      localStorage.setItem(draftKey, JSON.stringify({ fields, dates: dipilih, tenantType }));
    } catch {
      // Mode privat / kuota penuh: draft dilewati, form tetap berjalan normal.
    }
  }, [dipilih, tenantType, draftKey]);

  // Pulihkan draft SEKALI saat form dibuka (mis. setelah tekan back lalu kembali).
  useEffect(() => {
    let draft: { fields?: Record<string, string>; dates?: unknown; tenantType?: unknown } | null =
      null;
    try {
      draft = JSON.parse(localStorage.getItem(draftKey) ?? "null");
    } catch {
      draft = null;
    }
    if (!draft) return;
    if (Array.isArray(draft.dates)) {
      const valid = draft.dates.filter(
        (d): d is string => typeof d === "string" && eventDates.includes(d),
      );
      if (valid.length > 0) setDipilih(valid);
    }
    if (typeof draft.tenantType === "string" && !terkunci) {
      setTenantType(draft.tenantType as TenantType);
    }
    const form = formRef.current;
    if (form && draft.fields) {
      for (const [name, value] of Object.entries(draft.fields)) {
        const el = form.elements.namedItem(name);
        if (
          el &&
          !(el instanceof RadioNodeList) &&
          "value" in el &&
          (el as HTMLInputElement).type !== "file" &&
          (el as HTMLInputElement).type !== "checkbox"
        ) {
          (el as HTMLInputElement).value = String(value);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Simpan saat tanggal / jenis tenant berubah (lewati render pertama agar tidak
  // menimpa draft sebelum pemulihan selesai).
  useEffect(() => {
    if (lewatiSimpanPertama.current) {
      lewatiSimpanPertama.current = false;
      return;
    }
    simpanDraft();
  }, [dipilih, tenantType, simpanDraft]);

  // Setelah error server, DOM masih berisi isian — simpan ulang agar draft
  // konsisten, dan pasang lagi penjaga keluar (pengiriman gagal, isian kembali
  // berharga).
  useEffect(() => {
    if (state.status === "error") {
      setSedangKirim(false);
      simpanDraft();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status]);

  const errors = state.fieldErrors ?? {};
  const pesanUmum = state.status === "error" ? state.message : undefined;

  const galatEventDates = galatTanggal ?? errors.eventDates;

  return (
    <form
      ref={formRef}
      action={formAction}
      onSubmit={cekSebelumKirim}
      onInput={tandaiBerubah}
      onChange={tandaiBerubah}
      className="space-y-4"
      noValidate
    >
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
        <Field
          label="Email (kode booking dikirim ke sini)"
          htmlFor={`${id}-email`}
          hint="Pastikan benar — kode booking dan semua pemberitahuan dikirim ke email ini."
          error={errors.tenantEmail ?? otpState.fieldErrors?.email}
          required
        >
          <Input
            ref={emailRef}
            id={`${id}-email`}
            name="tenantEmail"
            type="email"
            autoComplete="email"
            placeholder="nama@email.com"
            aria-invalid={errors.tenantEmail ? true : undefined}
            required
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

      {emailOtpAktif ? (
        <div
          role="group"
          aria-label="Verifikasi email"
          className="rounded-[var(--radius)] border border-line bg-surface-2 p-4 sm:p-5"
        >
          <p className="text-sm font-medium text-ink">Verifikasi email</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            Kami kirim kode 6 digit ke email di atas untuk memastikan alamatnya benar. Slot
            baru dikunci setelah kodenya cocok.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={kirimKodeVerifikasi}
              disabled={otpPending}
              className={buttonClass("secondary", "sm")}
            >
              {otpPending ? "Mengirim kode…" : "Kirim kode verifikasi"}
            </button>
            {otpState.status !== "idle" && otpState.message ? (
              <p
                role="status"
                className={`text-xs font-medium ${otpState.status === "success" ? "text-ok" : "text-danger"}`}
              >
                {otpState.message}
              </p>
            ) : null}
          </div>
          <div className="mt-3 max-w-xs">
            <Field
              label="Kode verifikasi email"
              htmlFor={`${id}-otp`}
              hint="Cek kotak masuk/spam. Kode berlaku 10 menit."
              error={errors.emailOtp}
              required
            >
              <Input
                id={`${id}-otp`}
                name="emailOtp"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                placeholder="123456"
                className="tabular tracking-[0.3em]"
                aria-invalid={errors.emailOtp ? true : undefined}
                required
              />
            </Field>
          </div>
        </div>
      ) : null}

      <DetailFields tenantType={tenantType} idPrefix={id} errors={errors} />

      {isVehicleZoneType(slot.zone.zone_type) ? (
        <VehicleFields
          idPrefix={id}
          errors={errors}
          tampilkanKm={!isNewVehicleZoneType(slot.zone.zone_type)}
          // Kendaraan baru (mobil/motor) belum berplat -> field plat & km disembunyikan.
          tampilkanPlat={!isNewVehicleZoneType(slot.zone.zone_type)}
          // Jenis mengikuti zonanya: zona motor selalu motor, zona mobil selalu
          // mobil (keputusan pemilik 2026-08-29 — zona 14 slot fokus motor).
          jenis={vehicleKindForZoneType(slot.zone.zone_type)}
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
          Slot langsung dikunci untuk tanggal terpilih begitu formulir dikirim. Kode booking
          dikirim ke email Anda.{" "}
          <span className="whitespace-nowrap">
            Butuh bantuan?{" "}
            <a
              href={waHref(kontakBantuan.phone, "Halo Panitia Drive Tech, saya butuh bantuan booking lapak")}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-accent underline-offset-2 hover:underline"
            >
              WhatsApp {kontakBantuan.phone}
            </a>
          </span>
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

  // Dealer mobil baru & dealer motor baru memakai isian yang sama.
  if (tenantType === "dealer_mobil_baru" || tenantType === "dealer_motor_baru") {
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
            placeholder={tenantType === "dealer_motor_baru" ? "Contoh: Honda, Yamaha" : "Contoh: Toyota, Daihatsu"}
          />
        </Field>
      </DetailGroup>
    );
  }

  if (tenantType === "mitra_booth") {
    return (
      <DetailGroup judul="Data Mitra Booth">
        <Field
          label="Nama perusahaan / brand"
          htmlFor={`${idPrefix}-perusahaan`}
          hint="Booth 11-15 untuk bank/leasing, booth 16-20 untuk brand otomotif (lihat peruntukan slot)."
          error={errors["detail.nama_perusahaan"]}
        >
          <Input
            id={`${idPrefix}-perusahaan`}
            name="detail.nama_perusahaan"
            placeholder="Contoh: BCA Finance / Honda"
          />
        </Field>
        <Field
          label="Produk / layanan yang ditawarkan"
          htmlFor={`${idPrefix}-produk-booth`}
          error={errors["detail.produk_layanan"]}
        >
          <Input
            id={`${idPrefix}-produk-booth`}
            name="detail.produk_layanan"
            placeholder="Contoh: Kredit kendaraan DP ringan / display unit terbaru"
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
  /** Nomor plat disembunyikan untuk kendaraan baru (belum berplat). */
  tampilkanPlat: boolean;
  /** Jenis kendaraan otomatis dari zona slot (mobil / motor). */
  jenis: "mobil" | "motor";
};

/**
 * Diisi penyewa slot; hasilnya tampil di /katalog untuk pengunjung umum
 * SETELAH pembayaran diverifikasi panitia. 1 slot = 1 kendaraan.
 */
function VehicleFields({ idPrefix, errors, tampilkanKm, tampilkanPlat, jenis }: VehicleFieldsProps) {
  return (
    <div role="group" aria-label="Data kendaraan" className="space-y-4 border-t border-line pt-4">
      <div>
        <p className="text-xs font-semibold tracking-wide text-subtle uppercase">
          Data {jenis === "motor" ? "Motor" : "Mobil"} untuk Katalog
        </p>
        <p className="mt-1 text-xs text-muted">
          Ditampilkan di katalog online untuk pengunjung setelah pembayaran terverifikasi —
          lengkapi agar unit Anda mudah ditemukan pembeli.
        </p>
      </div>

      {/* Jenis mengikuti zona slot — tidak bisa dipilih manual. */}
      <input type="hidden" name="vehicleKind" value={jenis} />

      <div className={`grid gap-4 ${tampilkanPlat ? "sm:grid-cols-2" : ""}`}>
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

        {tampilkanPlat ? (
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
        ) : null}
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
