# Database Supabase — Drive Tech

Folder ini berisi seluruh definisi database untuk sistem booking pameran.

| Berkas | Isi |
| --- | --- |
| `migrations/20260826090000_init.sql` | Skema penuh: extension, enum, tabel, index, trigger `updated_at`, RLS + policy, Realtime, bucket Storage. |
| `migrations/20260827120000_per_tanggal.sql` | Model booking per tanggal: tabel `event_dates` + `booking_dates`, view publik `slot_date_status`, trigger sinkron status, pencabutan aturan lama satu-booking-per-slot. |
| `seed.sql` | Data awal: 1 event (Drive Tech, Kota Malang), tanggal Sabtu & Minggu mulai 12 Sep 2026, 6 zona, 104 slot, 3 mitra leasing. |
| `config.toml` | Konfigurasi Supabase CLI untuk pengembangan lokal. |

### Model booking per tanggal (migrasi `20260827120000`)

* Pemesan memilih **>= 1 tanggal weekend** dari `event_dates`; slot yang sama
  bisa disewa orang berbeda di tanggal berbeda.
* Setiap tanggal yang disewa satu booking dicatat sebagai baris `booking_dates`.
  Anti double-booking: unique index parsial
  `booking_dates_active_slot_date_idx (slot_id, event_date) where is_active`.
* Trigger `sync_booking_dates_active` membuat `booking_dates.is_active`
  mengikuti status booking (`pending_payment`/`confirmed` = aktif;
  `cancelled` = nonaktif, pasangan slot+tanggal lepas kembali).
* Okupansi publik dibaca lewat view `slot_date_status`
  (`slot_id`, `event_date`, `status`) — tanpa data pribadi tenant.
* **Makna `slots.status` berubah**: `available` = normal; nilai lain berarti
  slot **diblokir panitia** untuk semua tanggal (label UI: "Diblokir") — bukan
  lagi status booking.
* Biaya admin = `zones.admin_fee` **per tanggal** x jumlah tanggal terpilih.

Dasar skema: bagian 3 dokumen rencana teknis internal `Sistem Pameran Arsitektur.md`
(tidak dipublikasikan di repo ini; rangkumannya ada di README utama).
Kolom/objek di luar dokumen itu ditandai komentar `-- [tambahan]` di dalam file migrasi.

Sumber inventaris slot: gambar **`layout-venue.jpeg`** di root proyek.
Bila gambar berbeda dengan dokumen, **gambar yang menang**.

---

## 1. Menjalankan secara lokal

Butuh [Supabase CLI](https://supabase.com/docs/guides/cli) dan Docker yang sudah berjalan.

```bash
# Nyalakan stack Supabase lokal (Postgres, Auth, Storage, Studio, dsb.)
supabase start

# Terapkan ulang semua migrasi + jalankan seed.sql dari nol
supabase db reset
```

`supabase db reset` menghapus database lokal, memutar ulang seluruh file di
`migrations/`, lalu otomatis menjalankan `seed.sql`. Jalankan perintah ini
setiap kali file migrasi diubah.

Alamat layanan lokal setelah `supabase start`:

| Layanan | URL |
| --- | --- |
| API / REST | `http://127.0.0.1:54321` |
| Postgres | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |
| Studio | `http://127.0.0.1:54323` |

Ambil `NEXT_PUBLIC_SUPABASE_ANON_KEY` dan `SUPABASE_SERVICE_ROLE_KEY` lokal dengan:

```bash
supabase status
```

Salin nilainya ke `.env.local` di root proyek (contoh format ada di `.env.example`).

Menghentikan stack:

```bash
supabase stop
```

---

## 2. Push ke project Supabase cloud

```bash
# 1) Login sekali saja
supabase login

# 2) Hubungkan folder ini ke project cloud (ambil ref dari URL dashboard)
supabase link --project-ref <project-ref>

# 3) Kirim semua migrasi ke database cloud
supabase db push
```

> **`supabase db push` TIDAK menjalankan `seed.sql`.** Seed harus dijalankan
> manual satu kali setelah push:

```bash
# Opsi A — lewat psql (ambil connection string dari Dashboard > Project Settings > Database)
psql "postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres" -f supabase/seed.sql
```

Opsi B — buka **Dashboard > SQL Editor**, tempel isi `seed.sql`, lalu jalankan.

Seed aman diulang: insert memakai `on conflict do nothing` / `where not exists`
(baris event memakai `on conflict do update` agar nama/lokasi terbaru ikut
terpasang), jadi menjalankannya dua kali tidak menggandakan data. Seed juga
mengisi `event_dates` dengan semua Sabtu & Minggu selama 12 pekan mulai 12-13 Sep 2026
dari tanggal seed dijalankan (`current_date`).

Setelah push, isi env project di hosting (Vercel dsb.):

```
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>   # RAHASIA, server saja
NEXT_PUBLIC_SITE_URL=https://<domain-produksi>
```

---

## 3. Membuat admin pertama

Tabel `admin_users` mengacu ke `auth.users(id)`, jadi user Auth harus dibuat
lebih dulu — barisnya tidak bisa di-seed otomatis.

1. Buka **Dashboard > Authentication > Users > Add user**.
   Isi email + password, centang **Auto Confirm User**.
   (Pendaftaran mandiri dimatikan lewat `enable_signup = false`, jadi admin
   memang harus dibuat manual oleh panitia.)
2. Jalankan di **SQL Editor**:

```sql
insert into public.admin_users (id, email, full_name, role)
select u.id, u.email, 'Nama Admin', 'admin'
from auth.users u
where u.email = 'admin@example.com'
on conflict (id) do nothing;
```

Peran yang tersedia (`admin_role`):

| Role | Maksud |
| --- | --- |
| `admin` | Akses penuh seluruh menu admin. |
| `verifikator` | Fokus verifikasi pembayaran admin fee. |

Login admin ada di `/admin/login`.

---

## 4. Mengaktifkan Realtime

Migrasi sudah menjalankan (secara idempotent):

```sql
alter publication supabase_realtime add table public.slots;
alter table public.slots replica identity full;

alter publication supabase_realtime add table public.booking_dates;
alter table public.booking_dates replica identity full;
```

Jadi denah publik langsung ikut berubah tanpa refresh: `slots` untuk
blokir/buka slot oleh panitia, `booking_dates` untuk okupansi per tanggal
(booking baru, konfirmasi, pembatalan).

Bila karena satu dan lain hal publication belum terisi di project cloud, cek dan
aktifkan manual:

```sql
-- cek
select * from pg_publication_tables where pubname = 'supabase_realtime';

-- aktifkan
alter publication supabase_realtime add table public.slots;
alter publication supabase_realtime add table public.booking_dates;
```

Di dashboard, hal yang sama bisa dilakukan lewat **Database > Replication**
dengan mencentang tabel `slots` dan `booking_dates`.

---

## 5. Storage: bucket `bukti-transfer`

Migrasi membuat bucket `bukti-transfer` dengan `public = true` dan policy
`select` publik untuk bucket tersebut.

**Catatan penting:** bucket ini **publik** — siapa pun yang memegang URL file
bisa membuka bukti transfer tanpa autentikasi. Ini disengaja agar admin bisa
melihat bukti dengan cepat lewat `<img src>` biasa. Jangan mengunggah dokumen
sensitif ke bucket ini. Bila nanti dibutuhkan privasi, ubah bucket menjadi
privat lalu ganti pemakaian URL publik dengan *signed URL*.

Upload tetap dilakukan dari server memakai **service role key**; klien tidak
punya policy `insert` ke bucket ini.

Batas ukuran berkas: **2 MB** (`file_size_limit` di `config.toml`, selaras dengan
`MAX_PROOF_BYTES` di aplikasi).

---

## 6. Keamanan baris (RLS)

RLS **aktif di semua tabel**.

| Tabel | Akses publik |
| --- | --- |
| `events`, `zones`, `slots` | `select` bebas (`using (true)`) — data denah publik. |
| `event_dates` | `select` hanya untuk baris `is_active` (daftar tanggal gelaran). |
| `leasing_partners` | `select` hanya untuk baris `is_active`. |
| `booking_dates` | **Tanpa policy** — publik membaca okupansinya lewat view `slot_date_status` (security definer, hanya `slot_id`, `event_date`, `status`). |
| Semua tabel lain | **Tanpa policy sama sekali** → hanya `service_role` yang bisa mengakses. |

Artinya seluruh operasi tulis (booking, pembayaran, transaksi pembelian,
pengajuan leasing, aksi admin) harus lewat kode server yang memakai
`SUPABASE_SERVICE_ROLE_KEY`. Jangan pernah mengekspos kunci itu ke browser.

Perlindungan anti double-booking ada di level database — model per tanggal:

```sql
create unique index booking_dates_active_slot_date_idx
  on public.booking_dates (slot_id, event_date)
  where is_active;
```

Booking kedua atas pasangan (slot, tanggal) yang sama akan ditolak Postgres,
bukan sekadar dicegah oleh logika aplikasi. (Index lama
`bookings_active_slot_idx` — satu booking aktif per slot — sudah dihapus oleh
migrasi `20260827120000_per_tanggal.sql`.)

---

## 7. Ringkasan data seed

| Zona (`svg_group_id`) | Tipe | Jumlah slot | Admin fee |
| --- | --- | ---: | ---: |
| `zone-mobil-baru` | `mobil_baru` | 10 | Rp 2.500.000 |
| `zone-mobil-bekas` | `mobil_bekas` | 30 | Rp 750.000 |
| `zone-mobil-motor` | `mobil_motor_bekas` | 14 | Rp 600.000 |
| `zone-umkm` | `umkm` | 30 | Rp 300.000 |
| `zone-warung` | `warung` | 12 | Rp 500.000 |
| `zone-fasilitas` | `facility` | 8 | Rp 0 (tidak bisa dibooking) |
| **Total** | | **104** | 96 bisa dibooking |

Perbedaan gambar denah vs `Sistem Pameran Arsitektur.md`:

* **Warung:** 12 unit di gambar, dokumen menulis "~9".
* **Fasilitas:** 8 unit di gambar, dokumen menyebut 6.
* **Keputusan:** di gambar hanya dua warung yang bernama (Warmindo dan
  "Warung Sate & Gule"); sepuluh kotak "WARUNG" polos lainnya kami beri nomor
  1–10 (`slot-warung-01` … `slot-warung-10`) supaya bisa dibooking.

Verifikasi cepat setelah seed:

```sql
select z.svg_group_id, count(s.id) as jumlah_slot
from public.zones z
left join public.slots s on s.zone_id = z.id
group by z.svg_group_id
order by z.svg_group_id;
```
