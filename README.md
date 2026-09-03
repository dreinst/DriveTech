# Drive Tech — Booking Lapak Per Tanggal & Modul Leasing

Aplikasi web untuk **Drive Tech** — pasar otomotif akhir pekan di **Kampung Tentara, Singosari, Malang**,
Musim 1 dibuka **Sabtu–Minggu 12–13 September 2026**, lalu digelar **setiap hari Minggu sampai 1 November 2026** (8 pekan),
untuk mobil & motor baru, mobil & motor bekas, UMKM, otomotif & leasing, dan kuliner.
Pengunjung dan calon tenant melihat **denah interaktif** yang sinkron *realtime* dengan
database, lalu memesan lapak sendiri **per tanggal**: pilih satu atau beberapa tanggal
weekend, dan slot yang sama bisa disewa orang berbeda di tanggal yang berbeda.

Sumber kebenaran fungsionalnya adalah dokumen rencana teknis internal
`Sistem Pameran Arsitektur.md` — dokumen itu **tidak ikut dipublikasikan di repo ini**,
tetapi seluruh keputusannya sudah dirangkum di README ini (§9 Keputusan yang Diambil dan
§10 Denah). Tata letak denah diekstrak dari gambar **`layout-venue-v2.jpeg`** (Layout v2, 2026-09-02) di root,
yang ikut disertakan.

**Stack:** Next.js 15 (App Router) · React 19 · TypeScript strict · Tailwind CSS v4 ·
Supabase (Postgres + Auth + Realtime + Storage) · zod. Tanpa dependency UI eksternal —
semua ikon adalah SVG inline.

---

## 1. Dua Alur Transaksi

Keduanya berbagi entitas **Zone → Slot → Tenant**, tetapi berdiri sendiri.

### A. Booking Engine (tenant menyewa lapak — per tanggal)

```
Denah "/"  →  pilih ZONA → ketuk SLOT di peta → pilih TANGGAL (≥1 tanggal weekend) di panel slot
           →  /booking/{slotId}          isi data tenant            → booking (pending_payment)
                                                                      + baris booking_dates per tanggal
           →  /booking/{bookingId}/bayar bayar QRIS + unggah bukti  → pembayaran (submitted)
           →  /booking/{bookingId}/status pantau verifikasi panitia
                                     ↓
              Admin /admin/bookings  verifikasi                     → booking confirmed
                                     tolak                          → pembayaran rejected, tanggal tetap terkunci
```

Biaya admin berlaku **per tanggal** (kolom `zones.admin_fee`): total tagihan = biaya admin
zona × jumlah tanggal yang dipilih; hanya tanggal yang masih bebas untuk slot itu yang
bisa dipilih (peta menandai slot "Tersedia" selama masih ada minimal satu tanggal kosong).
Anti double-booking dijaga database lewat unique index parsial
`booking_dates_active_slot_date_idx` pada pasangan `(slot_id, event_date)` — slot yang sama
bisa disewa orang berbeda di tanggal yang berbeda. Kolom `slots.status` kini berarti kondisi
slotnya sendiri: `available` = normal, selain itu = **diblokir panitia** untuk semua tanggal
(label UI "Diblokir") — bukan lagi status booking. Daftar tanggal gelaran (tabel
`event_dates`) dikelola panitia di `/admin/pengaturan`.

### B. Modul Leasing (pengunjung membeli unit di lokasi)

```
Denah "/"  →  slot tenant terisi
           →  /beli/{slotId}                 data pembeli + cash / transfer / credit
           →  (kalau credit) /beli/{transactionId}/leasing   pilih mitra, DP, tenor
           →  /beli/{transactionId}/status   pantau status pengajuan
                                     ↓
              Admin /admin/leasing  update status & komisi platform
```

Komisi platform = `(harga unit − DP) × commission_rate mitra`.

---

## 2. Prasyarat

| Kebutuhan | Versi | Catatan |
| --- | --- | --- |
| Node.js | **22+** | Versi terkunci di `.nvmrc` (`nvm use`). |
| npm | 10+ | Ikut Node 22. |
| [Supabase CLI](https://supabase.com/docs/guides/cli) | terbaru | Untuk database lokal & migrasi. |
| Docker Desktop | berjalan | Dibutuhkan `supabase start`. |

---

## 3. Setup

```bash
# 1) Dependensi
npm install

# 2) Environment
cp .env.example .env.local

# 3a) Database lokal (butuh Docker)
supabase start          # menyalakan Postgres, Auth, Storage, Studio
supabase db reset       # menjalankan migrasi + seed.sql dari nol
supabase status         # salin anon key & service_role key ke .env.local

# 3b) ATAU pakai project Supabase cloud
supabase login
supabase link --project-ref <project-ref>
supabase db push                                   # migrasi saja
psql "<connection-string>" -f supabase/seed.sql    # seed dijalankan manual

# 4) Jalankan
npm run dev             # http://localhost:3000
```

Isi `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>   # RAHASIA — server saja
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

> Aplikasi **tetap bisa di-`next build` dan dibuka tanpa env terisi**. Dalam mode itu
> denah ditampilkan dari data cadangan (`src/lib/domain/fallback.ts`) dan tombol
> pemesanan dinonaktifkan. Helper `isSupabaseConfigured()` yang menentukan, bukan
> `throw` saat modul diimpor.

Skrip npm yang tersedia:

| Perintah | Fungsi |
| --- | --- |
| `npm run dev` | Server pengembangan. |
| `npm run build` / `npm start` | Build produksi & menjalankannya. |
| `npm run lint` | ESLint (config Next). |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm run db:reset` / `npm run db:push` | Pintasan Supabase CLI. |

---

## 4. Integrasi Google Sheets

Semua entitas (booking, pembayaran, pembelian unit, pengajuan leasing) bisa disinkronkan
otomatis ke Google Sheets lewat webhook Apps Script — ditambah tombol **Ekspor CSV** manual
di `/admin/bookings`.

Cara pasang (± 3 menit, cukup sekali):

1. Buka spreadsheet tujuan (spreadsheet Google Sheets mana pun milik panitia;
   kalau ganti spreadsheet, pasang ulang skrip lalu perbarui `SHEETS_WEBHOOK_URL`).
2. Menu **Extensions → Apps Script**, hapus isi editor bawaan, lalu tempel seluruh isi
   `tools/google-sheets-webhook.gs`. Skrip memakai `SpreadsheetApp.getActiveSpreadsheet()`,
   jadi wajib dipasang **di dalam** spreadsheet itu — bukan sebagai project Apps Script lepas.
3. **Deploy → New deployment → Web app**: *Execute as* = **Me**, *Who has access* =
   **Anyone**, lalu klik Deploy dan izinkan akses saat diminta.
4. Salin **Web app URL** (berakhiran `/exec`) ke `.env.local`:

```env
SHEETS_WEBHOOK_URL=https://script.google.com/macros/s/…/exec
```

Perilakunya:

* Aplikasi mengirim POST JSON `{ entity, sentAt, data }` setelah operasi sukses — buat
  booking, submit/verifikasi/tolak pembayaran, batal booking, pembelian unit, pengajuan &
  update leasing (lihat `src/lib/sheets.ts`).
* Skrip membuat satu sheet per entitas (**Bookings**, **Payments**, **Purchases**,
  **Leasing**), header otomatis dari keys data, lalu meng-*upsert* baris berdasarkan kolom
  pertama (kode/id) dan mengisi kolom `updated_at`.
* Sinkronisasi bersifat *fire-and-forget*: bila `SHEETS_WEBHOOK_URL` kosong atau webhook
  gagal, operasi utama **tidak ikut gagal** (hanya tercatat `console.warn` di server).

---

## 5. Membuat Admin Pertama

Tabel `admin_users` mengacu ke `auth.users(id)`, jadi user Auth harus dibuat lebih dulu
dan barisnya tidak bisa ikut di-seed. Pendaftaran mandiri sengaja dimatikan.

1. Buka **Supabase Dashboard → Authentication → Users → Add user**
   (lokal: `http://127.0.0.1:54323`). Isi email + password, centang **Auto Confirm User**.
2. Jalankan di **SQL Editor** (ganti email dan namanya):

```sql
insert into public.admin_users (id, email, full_name, role)
select u.id, u.email, 'Nama Admin', 'admin'
from auth.users u
where u.email = 'admin@example.com'
on conflict (id) do nothing;
```

3. Login di `/admin/login`.

Peran yang tersedia: `admin` (akses penuh) dan `verifikator` (fokus verifikasi pembayaran).

---

## 6. Peta Rute

### Publik

| Rute | Isi |
| --- | --- |
| `/` | Landing + denah interaktif ala tiket bioskop: pilih zona → ketuk slot → pilih tanggal di panel slot; legenda status & cek kode booking. |
| `/booking/{slotId}` | Formulir data tenant + ringkasan slot, tanggal terpilih, dan total biaya admin (per tanggal × jumlah tanggal). |
| `/katalog` | Katalog kendaraan publik per tanggal gelaran: unit milik booking terkonfirmasi di zona kendaraan (foto, harga, plat, lokasi slot). Filter zona + chips tanggal. |
| `/katalog/{listingId}` | Detail satu kendaraan: foto besar, spesifikasi, tanggal hadir, lokasi slot. Pembelian offline di lokasi. |
| `/booking/by-svg/{svgElementId}` | Jembatan denah statis → form: cari slot lewat `svg_element_id` lalu redirect ke `/booking/{slotId}`; id tak dikenal → 404. |
| `/booking/{bookingId}/bayar` | Bayar lewat **QRIS panitia** (gambar QRIS statis, nominal diisi pembayar) + unggah tangkapan layar bukti berhasil. Opsi cash dihapus 2026-08-28, transfer bank dihapus 2026-09-02; booking dikunci lewat pembayaran yang diverifikasi. |
| `/booking/{bookingId}/status` | Status booking + pembayaran, tombol batal, dan **QR verifikasi panitia** (memuat `/admin/bookings?q=<kode>` agar panitia bisa mencocokkan bukti, nominal, dan waktu kirim dengan waktu pada bukti). |
| `/beli/{slotId}` | Formulir pembeli unit: cash / transfer / credit. |
| `/beli/{transactionId}/leasing` | Pilih mitra leasing, DP, tenor, simulasi cicilan. |
| `/beli/{transactionId}/status` | Status pengajuan leasing. |

> Catatan implementasi: Next.js hanya mengizinkan **satu** nama slug per posisi segmen,
> sehingga folder `/booking/[slotId]/bayar` dan `/beli/[slotId]/status` memakai nama
> segmen `[slotId]` walau nilainya adalah id booking / id transaksi. Bentuk URL-nya
> tetap persis seperti tabel di atas.

### Admin (butuh sesi Supabase Auth + baris `admin_users`)

| Rute | Isi |
| --- | --- |
| `/admin/login` | Login email + password. |
| `/admin` | Dashboard: okupansi per zona untuk tanggal gelaran terdekat, pembayaran & leasing menunggu. |
| `/admin/slots` | Blokir / buka slot untuk semua tanggal (override panitia). |
| `/admin/bookings` | Verifikasi / tolak pembayaran, chip tanggal sewa, tombol Ekspor CSV. |
| `/admin/leasing` | Kelola mitra leasing, status pengajuan, komisi. |
| `/admin/tenants` | Daftar tenant beserta lapaknya. |
| `/admin/analitik` | Grafik okupansi (per tanggal terdekat), tren booking, leasing, metode bayar. |
| `/admin/pengaturan` | Kelola tanggal event (`event_dates`), biaya admin per zona, info event. |

### API (Route Handler, `runtime = "nodejs"`, `dynamic = "force-dynamic"`)

| Metode | Rute | Fungsi |
| --- | --- | --- |
| `GET` | `/api/bookings` | Daftar slot ringkas untuk polling ketersediaan. |
| `POST` | `/api/bookings` | Buat booking baru. |
| `POST` | `/api/bookings/{bookingId}/payment` | Submit metode + bukti pembayaran. |
| `POST` | `/api/purchases` | Catat transaksi pembelian unit. |
| `POST` | `/api/purchases/{transactionId}/leasing` | Ajukan pembiayaan ke mitra leasing. |

Aksi admin (verifikasi, override slot, update leasing) **tidak** punya endpoint REST —
semuanya memakai Server Action, sesuai rencana teknis bagian 5.

---

## 7. Dokumentasi API

Semua endpoint mengembalikan JSON dengan bentuk seragam:

* Sukses → body data langsung, status `200` / `201`.
* Gagal → `{ "error": "pesan bahasa Indonesia", "code": "KODE", "fieldErrors": { ... } }`.

Peta status HTTP (`src/app/api/_lib/respond.ts`):

| `code` | HTTP | Arti |
| --- | ---: | --- |
| `VALIDATION` / `INVALID_BODY` | 400 | Body atau field tidak valid. |
| `NOT_FOUND` | 404 | Slot / booking / transaksi tidak ada. |
| `SLOT_TAKEN`, `DATE_TAKEN`, `ALREADY_EXISTS`, `ALREADY_VERIFIED`, `CANCELLED` | 409 | Bentrok status (slot diblokir / sebagian tanggal baru saja terisi). |
| `PROOF_TOO_LARGE` | 413 | Bukti transfer > 2 MB. |
| `PROOF_TYPE` | 415 | Bukti transfer bukan JPG/PNG/WEBP. |
| `NOT_BOOKABLE`, `NOT_CREDIT`, `INACTIVE_PARTNER` | 422 | Aturan bisnis dilanggar. |
| `UPLOAD_FAILED` | 502 | Storage Supabase menolak unggahan. |
| `NO_CONFIG` | 503 | Env Supabase belum diisi. |
| lainnya / tak dikenal | 500 | Kesalahan internal, pesan digenerikkan. |

### 7.1 `GET /api/bookings` — polling ketersediaan slot

Query opsional: `status=available|pending|confirmed`, `zone=<svg_group_id>`,
`bookable=true` (hanya slot yang bisa dibooking, fasilitas dibuang).

```bash
curl -s "http://localhost:3000/api/bookings?status=available&zone=zone-umkm"
```

```json
{
  "event": {
    "id": "1f0a…",
    "name": "Drive Tech",
    "location": "Kota Malang",
    "startDate": null,
    "endDate": null
  },
  "eventDates": [{ "id": "5d2c…", "date": "2026-08-29" }],
  "occupancy": [{ "slotId": "3b21…", "date": "2026-08-29", "status": "confirmed" }],
  "total": 28,
  "fetchedAt": "2026-08-26T09:15:00.000Z",
  "slots": [
    {
      "id": "3b21…",
      "slotNumber": 1,
      "slotLabel": null,
      "displayName": "Slot 01",
      "status": "available",
      "svgElementId": "slot-umkm-01",
      "bookable": true,
      "zone": {
        "id": "9c44…",
        "name": "Area UMKM",
        "zoneType": "umkm",
        "svgGroupId": "zone-umkm",
        "adminFee": 300000
      }
    }
  ]
}
```

Model per tanggal: `slots[].status` adalah kondisi slotnya sendiri (`available` = normal,
selain itu = diblokir panitia), sedangkan ketersediaan per tanggal dihitung dari
`eventDates` (tanggal gelaran aktif mendatang) + `occupancy` (baris view
`slot_date_status`). Halaman publik sendiri tidak memakai endpoint ini — ia berlangganan
Realtime tabel `slots` dan `booking_dates`. Endpoint ini disediakan untuk integrasi
eksternal (papan info, bot WhatsApp, dsb.) yang lebih mudah melakukan polling.

### 7.2 `POST /api/bookings` — buat booking

```bash
curl -s -X POST http://localhost:3000/api/bookings \
  -H "Content-Type: application/json" \
  -d '{
    "slotId": "3b21c9d4-0000-4000-8000-000000000001",
    "eventDates": ["2026-08-29", "2026-08-30"],
    "tenantName": "Warung Bu Sri",
    "tenantPhone": "081234567890",
    "tenantEmail": "busri@example.com",
    "tenantType": "umkm",
    "detail": { "kategori": "Kerajinan" },
    "notes": "Butuh colokan listrik"
  }'
```

`201 Created`

```json
{ "bookingId": "7a10c2f6-…", "bookingCode": "BK-A1B2C3" }
```

Gagal validasi — `400`

```json
{
  "error": "Data booking tidak valid.",
  "code": "VALIDATION",
  "fieldErrors": { "tenantPhone": "Nomor telepon tidak valid. Contoh: 081234567890 atau +6281234567890." }
}
```

Sebagian tanggal direbut orang lain — `409`

```json
{ "error": "Sebagian tanggal yang dipilih baru saja terisi. Silakan pilih tanggal lain.", "code": "DATE_TAKEN" }
```

`eventDates` wajib berisi 1–16 tanggal `YYYY-MM-DD` yang terdaftar aktif di `event_dates`
dan belum lewat; slot harus bebas di **semua** tanggal itu. Tagihan yang terbit =
`zones.admin_fee × jumlah tanggal`.

Env belum diisi — `503`

```json
{ "error": "Supabase belum dikonfigurasi. Salin .env.example ke .env.local dan isi kredensialnya.", "code": "NO_CONFIG" }
```

### 7.3 `POST /api/bookings/{bookingId}/payment` — submit pembayaran

Menerima **dua bentuk body**, dideteksi lewat header `Content-Type`.

**JSON** (bukti sudah diunggah sendiri, kirim URL-nya):

```bash
curl -s -X POST http://localhost:3000/api/bookings/7a10c2f6-…/payment \
  -H "Content-Type: application/json" \
  -d '{ "method": "qris", "proofUrl": "https://supabase.187.53.129.205.sslip.io/storage/v1/object/public/bukti-transfer/bukti.jpg" }'
```

**multipart/form-data** (unggah berkas langsung; disimpan ke bucket `bukti-transfer`):

```bash
curl -s -X POST http://localhost:3000/api/bookings/7a10c2f6-…/payment \
  -F "method=qris" \
  -F "proof=@bukti-qris.jpg;type=image/jpeg"
```

Metode `cash` (2026-08-28) dan `transfer` (2026-09-02) sudah tidak diterima: satu-satunya
metode adalah `qris` + bukti, dan booking yang tidak membayar dalam 24 jam dibatalkan
otomatis oleh `expire_unpaid_bookings()` (pg_cron, tiap 15 menit). Nilai enum lama tetap
ada di database untuk data historis.

`200 OK`

```json
{ "bookingId": "7a10c2f6-…" }
```

QRIS tanpa bukti — `400`

```json
{
  "error": "Data pembayaran tidak valid.",
  "code": "VALIDATION",
  "fieldErrors": { "proofUrl": "Bukti pembayaran QRIS wajib diunggah." }
}
```

Batas berkas: **2 MB**, tipe `image/jpeg`, `image/png`, `image/webp`.

### 7.4 `POST /api/purchases` — transaksi pembelian unit

```bash
curl -s -X POST http://localhost:3000/api/purchases \
  -H "Content-Type: application/json" \
  -d '{
    "slotId": "3b21c9d4-0000-4000-8000-000000000001",
    "buyerName": "Budi Santoso",
    "buyerPhone": "081298765432",
    "paymentMethod": "credit",
    "unitDescription": "Toyota Avanza 2018",
    "unitPrice": 150000000,
    "notes": "Minta simulasi tenor 36 bulan"
  }'
```

`201 Created`

```json
{ "transactionId": "b8d1…", "transactionCode": "TX-D4E5F6", "needsLeasing": true }
```

`needsLeasing` bernilai `true` bila `paymentMethod = "credit"` — lanjutkan ke endpoint
berikutnya. Slot **tidak** berubah statusnya: slot adalah lapak tenant, bukan unit yang dijual.

### 7.5 `POST /api/purchases/{transactionId}/leasing` — pengajuan pembiayaan

```bash
curl -s -X POST http://localhost:3000/api/purchases/b8d1…/leasing \
  -H "Content-Type: application/json" \
  -d '{
    "leasingPartnerId": "c5f0…",
    "dpAmount": 30000000,
    "tenorBulan": 36,
    "notes": "Dokumen menyusul"
  }'
```

`201 Created`

```json
{ "leasingApplicationId": "e91b…" }
```

Transaksi bukan kredit — `422`

```json
{ "error": "Pengajuan leasing hanya untuk pembelian dengan metode kredit.", "code": "NOT_CREDIT" }
```

Sudah pernah diajukan (relasi 1:1) — `409`

```json
{ "error": "Transaksi ini sudah punya pengajuan leasing.", "code": "ALREADY_EXISTS" }
```

Tenor yang diterima: `12, 18, 24, 36, 48, 60`. Komisi platform dihitung otomatis dari
`commission_rate` mitra.

---

## 8. Struktur Folder

```
.
├── layout-venue-v2.jpeg  Denah asli event (Layout v2, 2026-09-02) — sumber kebenaran tata letak
├── public/denah.svg               Denah statis hasil generator (fallback & pratinjau)
├── tools/                         Skrip bantu: generator SVG denah + webhook Google Sheets (.gs)
├── supabase/
│   ├── migrations/                Skema: enum, tabel, index, trigger, RLS, Realtime, Storage
│   ├── seed.sql                   1 event, 9 tanggal Musim 1 (12-13 Sep, lalu tiap Minggu s.d. 1 Nov 2026), 8 zona, 107 slot, 3 mitra leasing
│   └── README.md                  Panduan database (lokal, cloud, RLS, Storage)
└── src/
    ├── middleware.ts              Refresh sesi Supabase di setiap request
    ├── app/
    │   ├── page.tsx               Landing + denah interaktif
    │   ├── booking/               Alur sewa lapak (data tenant → bayar → status)
    │   ├── beli/                  Alur beli unit (pembeli → leasing → status)
    │   ├── admin/                 Dashboard & modul verifikasi panitia
    │   └── api/                   Route Handler REST + helper respons (_lib/respond.ts)
    ├── components/
    │   ├── ui/                    Kit dasar: Button, Card, Badge, Field, Alert, Stepper…
    │   ├── layout/                Header & footer situs
    │   ├── denah/                 Denah SVG, legenda, langganan Realtime, saran slot
    │   ├── forms/                 Form publik (booking, pembayaran, pembelian, leasing)
    │   └── admin/                 Komponen khusus panel admin
    └── lib/
        ├── domain/                Konstanta, label Indonesia, geometri denah, saran slot
        ├── services/              Akses database (service role) — semua kembalikan Result<T>
        ├── actions/               Server Action ("use server") pembungkus service
        ├── supabase/              Klien browser / server / admin / middleware + cek env
        ├── validation/            Skema zod semua input
        ├── types/database.ts      Tipe hasil skema Postgres
        ├── result.ts              Tipe Result<T> + helper ok() / fail()
        ├── utils.ts               cn, formatRupiah, formatTanggal, slotDisplayName
        └── image.ts               Kompresi bukti transfer di sisi klien (canvas)
```

---

## 9. Keputusan yang Diambil

Menjawab tiga pertanyaan terbuka di bagian 6 rencana teknis.

### (a) Auth admin — Supabase Auth + tabel `admin_users` dengan peran

Memakai **Supabase Auth email/password**, ditambah tabel `admin_users` yang mengacu
`auth.users(id)` dan menyimpan kolom `role` bertipe enum `admin_role`:

| Role | Maksud |
| --- | --- |
| `admin` | Akses penuh seluruh menu admin. |
| `verifikator` | Fokus verifikasi pembayaran biaya admin. |

Ini sengaja dipilih sebagai **superset**: punya user Auth saja belum cukup, harus ada
barisnya di `admin_users`. Kalau ternyata pembagian peran tidak dibutuhkan, cukup beri
semua orang role `admin` — tidak ada migrasi yang perlu dibatalkan. Sebaliknya, menambah
role baru nanti hanya perlu `alter type admin_role add value`.

### (b) Nominal admin fee — flat per zona lewat `zones.admin_fee`, ditagih per tanggal

Biaya admin disimpan **satu angka per zona** (kolom `zones.admin_fee`, `numeric`), bukan
per slot dan bukan tabel tarif terpisah. Panitia bisa mengubahnya lewat SQL tanpa deploy
ulang. Nilai default di `supabase/seed.sql`:

| Zona | `zone_type` | Biaya admin |
| --- | --- | ---: |
| Tenda Dealer Mobil Baru (Area A) | `mobil_baru` | Rp 1.000.000 |
| Area Pameran Mobil Bekas (Area B) | `mobil_bekas` | Rp 50.000 |
| Area Pameran Motor Baru (Area C) | `motor_baru` | Rp 500.000 |
| Area Pameran Motor Bekas (Area C) | `mobil_motor_bekas` | Rp 25.000 |
| Tenda UMKM (Area D, kolom 1-10 & 21-30) | `umkm` | Rp 250.000 |
| Tenda Otomotif & Leasing (Area D, kolom 11-20) | `booth_khusus` | Rp 500.000 |
| Warung | `warung` | Rp 500.000 (belum dibuka online) |
| Fasilitas Umum | `facility` | Rp 0 (tidak bisa dibooking) |

Model per tanggal: tagihan booking = `admin_fee × jumlah tanggal terpilih`. Hasil kalinya
disalin ke `admin_fee_payments.amount` saat booking dibuat, sehingga perubahan tarif di
kemudian hari tidak mengubah tagihan yang sudah terbit.

### (c) Bukti transfer — dikompresi di klien sebelum diunggah

Ya, perlu. Foto layar m-banking dari ponsel modern rutin 4–8 MB, terlalu besar untuk
Server Action maupun bucket. `src/lib/image.ts` mengompresi di **browser** memakai
`<canvas>` sebelum berkas dikirim:

* sisi terpanjang maksimum **1600 px**;
* encode ulang **JPEG kualitas 0.8**, diturunkan bertahap sampai 0.4 bila masih besar;
* target akhir **≤ 2 MB** (`MAX_PROOF_BYTES`), sama dengan `file_size_limit` bucket;
* kalau kompresi gagal (format aneh, canvas ter-*taint*, lingkungan tanpa DOM), berkas
  **asli** dipakai apa adanya — pengguna tidak pernah melihat error karena ini.

Server tetap memeriksa ulang ukuran dan tipe berkas; kompresi klien adalah kenyamanan,
bukan pengamanan.

### (d) Saran slot alternatif — zona pengganti dideklarasikan eksplisit

Bagian 4 rencana teknis meminta: kalau zona penuh, tawarkan zona lain "dengan `zone_type`
yang sama". Tetapi contoh yang ditulis di dokumen itu sendiri — *Area Pameran Mobil penuh
→ tawarkan Area Pameran Mobil & Motor* — justru **melintasi** `zone_type`
(`mobil_bekas` → `mobil_motor_bekas`), dan seed hanya membuat satu zona per tipe, jadi
mencocokkan tipe saja tidak akan pernah menghasilkan saran apa pun.

Karena itu urutan saran di `src/lib/domain/suggestions.ts` jadi tiga tingkat:

1. slot tersedia di **zona yang sama**, diurut jarak nomor terdekat;
2. zona lain dengan **`zone_type` identik**;
3. zona pengganti dari `ZONE_TYPE_FALLBACK` (`src/lib/domain/constants.ts`).

```ts
export const ZONE_TYPE_FALLBACK: Record<ZoneType, readonly ZoneType[]> = {
  mobil_baru: [],                          // dealer resmi tidak dicampur ke area bekas
  mobil_bekas: ["mobil_motor_bekas"],      // contoh eksplisit di rencana teknis
  mobil_motor_bekas: ["mobil_bekas"],
  umkm: [],                                // UMKM non-kuliner ≠ warung kuliner
  warung: [],
  facility: [],
};
```

Urutan di dalam array = urutan prioritas. Kosongkan array kalau sebuah tipe zona tidak
boleh disarankan pindah. Hasilnya tetap **daftar saran**, tidak pernah *auto-assign* —
penyewa harus mengonfirmasi sendiri.

---

## 10. Denah

Geometri SVG denah **diekstrak dari `layout-venue.jpeg`** di root proyek, bukan
dari deskripsi teks. Semua koordinat hidup di `src/lib/domain/layout.ts` dengan
`viewBox "0 0 1123 1600"` (portrait).

Bila gambar berbeda dari rencana teknis, **gambar yang menang**. Perbedaan yang tercatat:

| Hal | Gambar (dipakai) | `Sistem Pameran Arsitektur.md` | Tindakan |
| --- | --- | --- | --- |
| Jumlah warung | **12 unit** | "~9" | Ikut gambar: 12 baris slot di zona `warung`. |
| Jumlah fasilitas | **13 unit** — tambahan **Kantor Sekretariat & Rest Area Kostrad**, **Tempat Cuci Mobil & Motor**, dan dari Layout v2: **VIP Lounge, LED, Tenda VIP, Area Wahana, Toilet** | 6 (Stage, Musholah, Zumba, Kolam Pemancingan, Lapangan Tembak, Parkiran) | Ikut gambar: 13 baris slot `facility`, semuanya tidak bisa dibooking. |
| Warung tanpa nama | 10 kotak bertuliskan "WARUNG" saja | tidak dibahas | **Keputusan kami:** diberi nomor **Warung 1–10** (`slot-warung-01` … `slot-warung-10`) supaya bisa dibooking. Dua warung bernama tetap memakai labelnya: `slot-warung-warmindo` (Warmindo) dan `slot-warung-sate-gule` (Warung Sate & Gule). |

Total: **107 kotak**, **82 bisa dibooking online** (10 mobil baru + 30 mobil bekas +
4 motor baru + 8 motor bekas + 20 UMKM + 10 otomotif & leasing); 12 warung dan 13
fasilitas digambar tetapi tidak disewakan online. Jumlah slot Area C mengikuti
gambar Layout v2 (4 baru + 8 bekas, keputusan pemilik 2026-09-03); teks Deck v4
menyebut 3 + 14.

Sepuluh warung bernomor tetap diberi `slot_label` (`"Warung 1"` … `"Warung 10"`) di
`supabase/seed.sql`, dan `slotDisplayName()` mendahulukan label di atas nomor — supaya
nama lapak di halaman booking sama persis dengan yang tertulis di denah. Zona bernomor
lain (`slot_label` NULL) tetap tampil sebagai `"Slot 07"`.

### Dua render, satu geometri

| | Dipakai untuk | Sumber |
| --- | --- | --- |
| `src/components/denah/FloorPlan.tsx` | denah **interaktif** di aplikasi: klik slot, warna ikut status, langganan Supabase Realtime | `FLOOR_PLAN_ZONES` di `layout.ts` |
| `public/denah.svg` | denah **statis**: cetak, PDF, embed, dan fallback `<noscript>` di `FloorPlanBoard.tsx` | `tools/generate-denah-svg.ts` — mengimpor `layout.ts` langsung, tidak ada koordinat ganda |

Berkas statisnya berdiri sendiri (tanpa aset eksternal) dan setiap kotak punya
`id` yang sama dengan `slots.svg_element_id` plus atribut `data-status`, jadi bisa
diwarnai ulang dari luar aplikasi:

```js
document.getElementById("slot-umkm-07").dataset.status = "confirmed";
```

### Tautan SVG ke Form

Setiap slot di kedua render membawa penunjuk langsung ke form bookingnya:

- **`FloorPlan.tsx` (peta React)** — `<g>` slot yang punya baris database diberi
  `data-slot-uuid` (uuid baris `slots`) dan `data-form-url` (`/booking/<uuid>`), sehingga
  script/test/ekstensi luar bisa menyambungkan kotak denah ke form tanpa menebak URL.
  Slot tanpa baris database tidak diberi kedua atribut itu.
- **`public/denah.svg` (denah statis)** — tiap slot **bookable** dibungkus
  `<a href="/booking/by-svg/<svg_element_id>">` dan `<g>`-nya diberi atribut `data-form`
  berisi URL yang sama, jadi file SVG yang dibuka langsung (browser, embed, PDF viewer
  yang mendukung tautan) pun bisa diklik menuju form slot itu. Slot fasilitas & warung
  tidak diberi `<a>`.
- **Rute `/booking/by-svg/<svg_element_id>`** menerjemahkan id elemen SVG (mis.
  `slot-umkm-07`) menjadi uuid slot lewat `getSlotBySvgId()` lalu redirect ke
  `/booking/<slotId>`; id yang tidak dikenal menghasilkan 404.

### Mengubah tata letak

Id elemen adalah perekat antara gambar, kode, dan database — **ketiganya harus tetap sinkron**:

1. `src/lib/domain/layout.ts` — koordinat, ukuran kotak, warna aksen zona, dekor, anotasi.
2. `supabase/seed.sql` — baris `zones.svg_group_id` dan `slots.svg_element_id`.
3. `tools/generate-denah-svg.ts` → `public/denah.svg` — denah statis yang dibangun
   langsung dari `layout.ts` (jalankan `npm run denah` setelah mengubah koordinat —
   butuh Node ≥ 22.6, skrip memakai `--experimental-strip-types`; `npm run denah:check`
   memberitahu kalau berkas hasilnya berubah dan belum di-commit).

Aturannya: `slots.svg_element_id` di database **wajib** sama persis dengan id kotak di
`layout.ts` (`slot-<zoneSlug>-<NN>`, dua digit mulai `01`). Slot yang idnya tidak cocok
akan tetap tergambar, tetapi tidak akan ikut berubah warna saat statusnya berganti.
Setelah mengubah seed, jalankan `supabase db reset`.

---

## 11. Catatan Produksi

Hal-hal yang perlu diketahui sebelum dipakai sungguhan.

* **Operasi multi-tabel belum atomik.** `createBooking` menjalankan
  insert tenant → insert booking → insert booking_dates → insert tagihan secara berurutan
  dengan *kompensasi manual* bila salah satu langkah gagal. Pengaman sebenarnya ada di
  unique index `booking_dates_active_slot_date_idx` (satu penyewa aktif per pasangan
  slot-tanggal). Untuk produksi, pindahkan rangkaian ini ke satu **Postgres function
  (RPC)** agar benar-benar berjalan dalam satu transaksi. Hal yang sama berlaku untuk
  `verifyPayment` dan `cancelBooking`.
* **RLS hanya membuka `select` publik** untuk `events`, `zones`, `slots`, dan
  `leasing_partners` (baris `is_active` saja). Tabel lain **tanpa policy sama sekali**,
  jadi hanya `service_role` yang bisa mengaksesnya.
* **`SUPABASE_SERVICE_ROLE_KEY` wajib server-side.** Kunci itu mem-bypass seluruh RLS.
  Jangan pernah diberi prefix `NEXT_PUBLIC_`, jangan di-commit, dan jangan diimpor dari
  komponen klien — `src/lib/supabase/admin.ts` serta modul `services/*` menolak berjalan
  di browser.
* **Bucket `bukti-transfer` bersifat publik.** Siapa pun yang memegang URL bisa membuka
  bukti transfer tanpa autentikasi (disengaja agar admin cepat memeriksa). Untuk
  produksi, ubah bucket jadi privat dan ganti URL publik dengan **signed URL** berumur pendek.
* **Rate limiting dua lapis (sejak 2026-09-03).** `src/lib/rate-limit.ts`: lapis
  in-memory per instance, plus pembatas **bersama** lintas instance lewat fungsi
  `public.rate_limit_hit` (tabel `rate_limit_events`, migrasi
  `20260903121000_rate_limit_bersama.sql`). Dipakai form booking dan `POST /api/bookings`
  (5/menit per IP tiap kiriman, 20/24 jam per IP untuk kiriman valid — satu Wi-Fi
  lokasi = satu IP, angkanya konstanta di `actions/booking.ts`), pembatalan mandiri
  (5/jam per booking, 20/jam per IP), login admin (10/10 menit per IP, 5/10 menit
  per username), pembayaran (10/jam per booking), dan pembelian. Fail-open bila DB
  bermasalah.
* **Endpoint cron fail-closed.** `/api/cron/*` menolak 503 di produksi bila
  `CRON_SECRET` kosong; recap mingguan juga butuh `SHEETS_ACTION_KEY` (= `RECAP_KEY`
  di Apps Script, terpisah dari `RESET_KEY` yang hanya ada di editor Apps Script).
* **Belum ada CAPTCHA / verifikasi nomor telepon.** Tenant dikenali dari nomor telepon
  saja; pembatas laju di atas menahan penimbunan massal dari satu jaringan, tetapi
  booking iseng memakai nomor palsu satuan belum tersaring otomatis (OTP WhatsApp
  adalah langkah berikutnya).
* **Tidak ada kedaluwarsa booking otomatis.** Booking `pending_payment` mengunci
  tanggal-tanggal sewanya sampai admin memverifikasi atau membatalkannya. Pertimbangkan
  cron (`pg_cron`) yang membatalkan booking `pending_payment` yang lewat N jam.

---

## 12. Yang Belum Dikerjakan

Jujur, ini yang belum ada di versi sekarang:

* **Notifikasi** — WhatsApp ke penyewa (booking dibuat + tenggat, terverifikasi, ditolak,
  dibatalkan) SUDAH ADA (`src/lib/notifications.ts`), tetapi bergantung pada env:
  `WA_PROVIDER` = `outbox` (bawaan: pesan diantrekan ke tabel `notification_outbox`
  dan dikirim worker VPS `tools/vps/drivetech-wa-outbox.py` lewat bot Hermes di nomor
  kantor 6282232999900), `fonnte` (langsung ke API Fonnte, butuh `WA_API_TOKEN`), atau
  `off`. Tanpa kredensial mode yang aktif, notifikasi hanya dicatat (dry-run).
  `WA_OVERRIDE_RECIPIENT` mengalihkan SEMUA pesan ke satu nomor untuk uji coba.
  Email (Resend, `RESEND_API_KEY`) tetap opsional. Pengajuan leasing belum punya
  notifikasi.
* **Pembayaran otomatis.** Belum ada payment gateway maupun rekonsiliasi mutasi bank —
  verifikasi transfer sepenuhnya manual oleh panitia.
* **Multi-event.** Skema sudah punya tabel `events`, tetapi UI dan seed mengasumsikan
  satu event aktif (sesuai keputusan di rencana teknis).
* **Audit trail.** Tidak ada riwayat siapa mengubah status slot/booking kapan; hanya
  `verified_by` dan `verified_at` pada pembayaran.
* **Ekspor & laporan.** Ada tombol ekspor CSV sederhana di beberapa tabel admin, tetapi
  belum ada laporan pendapatan, rekap komisi leasing, atau cetak invoice.
* **Pengujian otomatis.** Belum ada unit test maupun end-to-end test; verifikasi masih
  mengandalkan `npm run typecheck`, `npm run lint`, dan pengujian manual.
* **Aksesibilitas & i18n.** Denah SVG sudah punya label dan fokus keyboard dasar, tetapi
  belum diuji dengan pembaca layar. Seluruh teks berbahasa Indonesia dan di-*hardcode*.
* **Manajemen mitra leasing lanjutan.** Belum ada portal untuk mitra memantau pengajuan;
  semuanya lewat panel admin panitia.
