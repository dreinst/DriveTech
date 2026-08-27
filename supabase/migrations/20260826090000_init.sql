-- =============================================================================
-- Sistem Pameran — Migrasi Awal (skema penuh)
-- =============================================================================
-- Dasar skema ini berasal dari dokumen "Sistem Pameran Arsitektur.md" di root
-- proyek, khususnya BAGIAN 3 "Skema Database (Supabase/Postgres)".
--
-- Semua kolom / objek yang TIDAK ada di bagian 3 dokumen tersebut (hasil
-- keputusan implementasi) ditandai dengan komentar "-- [tambahan]".
--
-- Catatan realtime (bagian 3 dokumen): tabel `slots` didaftarkan ke publication
-- `supabase_realtime` agar denah SVG publik ikut berubah tanpa refresh.
--
-- Skrip ini dibuat idempotent sebisa mungkin (if not exists / on conflict do
-- nothing / drop policy if exists) sehingga aman dijalankan ulang.
-- =============================================================================

set search_path = public, extensions;

-- -----------------------------------------------------------------------------
-- 0. Extension
-- -----------------------------------------------------------------------------
-- pgcrypto dipakai oleh gen_random_bytes() pada default booking_code /
-- transaction_code. gen_random_uuid() sudah bawaan Postgres 13+.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- -----------------------------------------------------------------------------
-- 1. Enum
-- -----------------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where t.typname = 'zone_type' and n.nspname = 'public') then
    create type public.zone_type as enum (
      'mobil_baru', 'mobil_bekas', 'mobil_motor_bekas', 'umkm', 'warung', 'facility'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where t.typname = 'slot_status' and n.nspname = 'public') then
    create type public.slot_status as enum ('available', 'pending', 'confirmed');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where t.typname = 'tenant_type' and n.nspname = 'public') then
    create type public.tenant_type as enum (
      'dealer_mobil_baru', 'individu_bekas', 'umkm', 'warung'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where t.typname = 'booking_status' and n.nspname = 'public') then
    create type public.booking_status as enum ('pending_payment', 'confirmed', 'cancelled');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where t.typname = 'payment_method' and n.nspname = 'public') then
    create type public.payment_method as enum ('cash', 'transfer');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where t.typname = 'payment_status' and n.nspname = 'public') then
    create type public.payment_status as enum ('unpaid', 'submitted', 'verified', 'rejected');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where t.typname = 'purchase_payment_method' and n.nspname = 'public') then
    create type public.purchase_payment_method as enum ('cash', 'transfer', 'credit');
  end if;
end $$;

-- [tambahan] status funnel transaksi pembelian unit oleh pengunjung
do $$ begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where t.typname = 'purchase_status' and n.nspname = 'public') then
    create type public.purchase_status as enum ('new', 'contacted', 'deal', 'cancelled');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where t.typname = 'leasing_status' and n.nspname = 'public') then
    create type public.leasing_status as enum (
      'submitted', 'verifying', 'approved', 'rejected', 'completed'
    );
  end if;
end $$;

-- [tambahan] role admin (jawaban pertanyaan bagian 6 dokumen: role-based)
do $$ begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where t.typname = 'admin_role' and n.nspname = 'public') then
    create type public.admin_role as enum ('admin', 'verifikator');
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 2. Tabel
-- -----------------------------------------------------------------------------

-- Event tunggal, tetap dibuat agar arsitektur konsisten meski hardcode.
create table if not exists public.events (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  location    text,
  start_date  date,
  end_date    date,
  is_active   boolean not null default true,             -- [tambahan]
  created_at  timestamptz not null default now()         -- [tambahan]
);

create table if not exists public.zones (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid references public.events(id) on delete cascade,
  name          text not null,                            -- "Area Pameran Mobil", dst
  zone_type     public.zone_type not null,
  svg_group_id  text unique,                              -- id elemen <g> di SVG denah
  admin_fee     numeric not null default 0,               -- [tambahan] flat per zona (rupiah)
  description   text,                                     -- [tambahan]
  display_order int not null default 0,                   -- [tambahan] urutan tampil di UI
  created_at    timestamptz not null default now()        -- [tambahan]
);

create table if not exists public.slots (
  id             uuid primary key default gen_random_uuid(),
  zone_id        uuid references public.zones(id) on delete cascade,
  slot_number    int,                                     -- null untuk unit bernama
  slot_label     text,                                    -- "Warmindo", "Stage Utama", dst
  status         public.slot_status not null default 'available',
  svg_element_id text unique,                             -- id elemen SVG per-slot
  created_at     timestamptz not null default now(),      -- [tambahan]
  updated_at     timestamptz not null default now(),      -- [tambahan]
  unique (zone_id, slot_number)
);

-- [tambahan] mempercepat query denah & pencarian slot kosong per zona
create index if not exists slots_zone_status_idx on public.slots (zone_id, status);

create table if not exists public.tenants (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  phone       text,
  email       text,
  tenant_type public.tenant_type not null,
  -- field tambahan fleksibel per tipe (kategori produk UMKM, data unit, dll)
  detail      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()          -- [tambahan]
);

create table if not exists public.bookings (
  id           uuid primary key default gen_random_uuid(),
  slot_id      uuid not null references public.slots(id),
  tenant_id    uuid not null references public.tenants(id),
  status       public.booking_status not null default 'pending_payment',
  -- [tambahan] kode booking yang dipakai penyewa untuk cek status
  booking_code text not null unique
                 default ('BK-' || upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 6))),
  notes        text,                                       -- [tambahan]
  created_at   timestamptz default now(),
  updated_at   timestamptz not null default now()          -- [tambahan]
);

-- [tambahan] KUNCI ANTI DOUBLE-BOOKING:
-- hanya boleh ada SATU booking aktif (pending_payment / confirmed) per slot.
-- Booking yang cancelled tidak dihitung sehingga slot bisa dibooking ulang.
create unique index if not exists bookings_active_slot_idx
  on public.bookings (slot_id)
  where status in ('pending_payment', 'confirmed');

create table if not exists public.admin_fee_payments (
  id            uuid primary key default gen_random_uuid(),
  -- [tambahan] UNIQUE + on delete cascade => relasi 1:1 dengan booking
  booking_id    uuid not null unique references public.bookings(id) on delete cascade,
  amount        numeric not null,
  method        public.payment_method not null,
  status        public.payment_status not null default 'unpaid',
  proof_url     text,                                      -- bukti transfer (Supabase Storage)
  verified_by   uuid,                                      -- admin user id
  verified_at   timestamptz,
  reject_reason text,                                      -- [tambahan]
  submitted_at  timestamptz,                               -- [tambahan]
  created_at    timestamptz not null default now(),        -- [tambahan]
  updated_at    timestamptz not null default now()         -- [tambahan]
);

create table if not exists public.leasing_partners (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  contact         text,
  commission_rate numeric,                                 -- persentase komisi ke platform
  is_active       boolean not null default true,           -- [tambahan]
  created_at      timestamptz not null default now()       -- [tambahan]
);

create table if not exists public.purchase_transactions (
  id               uuid primary key default gen_random_uuid(),
  slot_id          uuid not null references public.slots(id),  -- unit dibeli dari tenant mana
  buyer_name       text not null,
  buyer_phone      text,
  payment_method   public.purchase_payment_method not null,
  unit_description text,                                   -- [tambahan]
  unit_price       numeric,                                -- [tambahan]
  status           public.purchase_status not null default 'new',  -- [tambahan]
  -- [tambahan] kode transaksi yang dipakai pembeli untuk cek status
  transaction_code text not null unique
                     default ('TX-' || upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 6))),
  notes            text,                                   -- [tambahan]
  created_at       timestamptz default now(),
  updated_at       timestamptz not null default now()      -- [tambahan]
);

create table if not exists public.leasing_applications (
  id                      uuid primary key default gen_random_uuid(),
  -- [tambahan] UNIQUE + on delete cascade => relasi 1:1 dengan transaksi pembelian
  purchase_transaction_id uuid not null unique
                            references public.purchase_transactions(id) on delete cascade,
  leasing_partner_id      uuid not null references public.leasing_partners(id),
  dp_amount               numeric,
  tenor_bulan             int,
  status                  public.leasing_status not null default 'submitted',
  commission_amount       numeric,
  commission_paid         boolean default false,
  notes                   text,                            -- [tambahan]
  created_at              timestamptz not null default now(),   -- [tambahan]
  updated_at              timestamptz not null default now()    -- [tambahan]
);

-- [tambahan] tabel profil admin, terhubung ke Supabase Auth (jawaban bagian 6)
create table if not exists public.admin_users (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  full_name  text,
  role       public.admin_role not null default 'verifikator',
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 3. Trigger updated_at  -- [tambahan]
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists slots_set_updated_at on public.slots;
create trigger slots_set_updated_at
  before update on public.slots
  for each row execute function public.set_updated_at();

drop trigger if exists bookings_set_updated_at on public.bookings;
create trigger bookings_set_updated_at
  before update on public.bookings
  for each row execute function public.set_updated_at();

drop trigger if exists admin_fee_payments_set_updated_at on public.admin_fee_payments;
create trigger admin_fee_payments_set_updated_at
  before update on public.admin_fee_payments
  for each row execute function public.set_updated_at();

drop trigger if exists purchase_transactions_set_updated_at on public.purchase_transactions;
create trigger purchase_transactions_set_updated_at
  before update on public.purchase_transactions
  for each row execute function public.set_updated_at();

drop trigger if exists leasing_applications_set_updated_at on public.leasing_applications;
create trigger leasing_applications_set_updated_at
  before update on public.leasing_applications
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 4. Row Level Security
-- -----------------------------------------------------------------------------
-- RLS aktif di SEMUA tabel.
-- Policy SELECT publik HANYA untuk: events, zones, slots (data denah publik),
-- plus leasing_partners yang aktif (dipakai form pengajuan leasing).
-- Tabel lain sengaja TIDAK punya policy sama sekali => hanya service_role
-- (yang bypass RLS) yang bisa membacanya. Semua operasi tulis dilakukan di
-- server memakai service role key.

alter table public.events                enable row level security;
alter table public.zones                 enable row level security;
alter table public.slots                 enable row level security;
alter table public.tenants               enable row level security;
alter table public.bookings              enable row level security;
alter table public.admin_fee_payments    enable row level security;
alter table public.leasing_partners      enable row level security;
alter table public.purchase_transactions enable row level security;
alter table public.leasing_applications  enable row level security;
alter table public.admin_users           enable row level security;

drop policy if exists "events_select_public" on public.events;
create policy "events_select_public"
  on public.events for select
  using (true);

drop policy if exists "zones_select_public" on public.zones;
create policy "zones_select_public"
  on public.zones for select
  using (true);

drop policy if exists "slots_select_public" on public.slots;
create policy "slots_select_public"
  on public.slots for select
  using (true);

drop policy if exists "leasing_partners_select_public" on public.leasing_partners;
create policy "leasing_partners_select_public"
  on public.leasing_partners for select
  using (is_active);

-- Grant level SQL (RLS tetap menjadi penjaga baris). Dibungkus DO block agar
-- skrip tidak gagal bila role anon/authenticated tidak ada (Postgres polos).
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    grant select on public.events, public.zones, public.slots, public.leasing_partners to anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select on public.events, public.zones, public.slots, public.leasing_partners to authenticated;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 5. Realtime — denah publik sinkron otomatis
-- -----------------------------------------------------------------------------
-- alter publication supabase_realtime add table slots;
-- Dibungkus DO block supaya idempotent (menambahkan tabel dua kali = error).
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'slots'
     ) then
    alter publication supabase_realtime add table public.slots;
  end if;
end $$;

-- Payload realtime butuh identitas baris lengkap saat update.
alter table public.slots replica identity full;

-- -----------------------------------------------------------------------------
-- 6. Storage — bucket publik "bukti-transfer"
-- -----------------------------------------------------------------------------
do $$ begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public)
    values ('bukti-transfer', 'bukti-transfer', true)
    on conflict (id) do nothing;
  end if;
end $$;

-- Policy storage: siapa pun boleh MEMBACA file di bucket bukti-transfer
-- (bucket publik). Upload tetap dilakukan server memakai service role key.
do $$ begin
  if to_regclass('storage.objects') is not null then
    drop policy if exists "bukti_transfer_public_read" on storage.objects;
    create policy "bukti_transfer_public_read"
      on storage.objects for select
      using (bucket_id = 'bukti-transfer');
  end if;
end $$;
