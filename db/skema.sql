--
-- Skema database DriveTech untuk Postgres polos (diuji pada postgres:16).
--
-- Muat ke database KOSONG:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/skema.sql
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/seed.sql     (data awal, opsional)
--
-- Tugas rutin (expire_unpaid_bookings dan pembersihan tabel sementara)
-- dijalankan aplikasi lewat GET /api/cron/rutin, dipicu timer di tools/vps/.
--

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;

--
-- pgcrypto: gen_random_bytes() untuk kode booking, crypt() untuk sandi admin.
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;

--
-- Name: admin_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.admin_role AS ENUM (
    'superadmin',
    'admin'
);


--
-- Name: booking_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.booking_status AS ENUM (
    'pending_payment',
    'confirmed',
    'cancelled'
);


--
-- Name: leasing_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.leasing_status AS ENUM (
    'submitted',
    'verifying',
    'approved',
    'rejected',
    'completed'
);


--
-- Name: payment_method; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.payment_method AS ENUM (
    'cash',
    'transfer',
    'qris'
);


--
-- Name: payment_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.payment_status AS ENUM (
    'unpaid',
    'submitted',
    'verified',
    'rejected'
);


--
-- Name: purchase_payment_method; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.purchase_payment_method AS ENUM (
    'cash',
    'transfer',
    'credit'
);


--
-- Name: purchase_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.purchase_status AS ENUM (
    'new',
    'contacted',
    'deal',
    'cancelled'
);


--
-- Name: slot_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.slot_status AS ENUM (
    'available',
    'pending',
    'confirmed'
);


--
-- Name: tenant_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.tenant_type AS ENUM (
    'dealer_mobil_baru',
    'individu_bekas',
    'umkm',
    'warung',
    'mitra_booth',
    'dealer_motor_baru'
);


--
-- Name: zone_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.zone_type AS ENUM (
    'mobil_baru',
    'mobil_bekas',
    'mobil_motor_bekas',
    'umkm',
    'warung',
    'facility',
    'booth_khusus',
    'motor_baru'
);


--
-- Name: alokasi_kode_unik_js(bigint); Type: FUNCTION; Schema: public; Owner: -
-- Kode unik 1..349 pesanan jalan sehat (migrasi 20261029-jalan-sehat-berbayar.sql).
--

CREATE FUNCTION public.alokasi_kode_unik_js(p_pesanan bigint) returns integer
    language plpgsql security definer
    set search_path to 'public'
    as $$
declare
  v_amount int;
  v_code   int;
  v_free   int[];
begin
  perform pg_advisory_xact_lock(hashtext('drivetech:kode_unik_js'));

  select amount, unique_code into v_amount, v_code
    from public.jalan_sehat_pesanan where id = p_pesanan for update;
  if not found then raise exception 'pesanan % tidak ditemukan', p_pesanan; end if;
  if v_code is not null then return v_code; end if;

  select array_agg(c) into v_free
    from generate_series(1, 349) c
   where not exists (
     select 1 from public.jalan_sehat_pesanan p
      where p.id <> p_pesanan
        and p.unique_code is not null
        and p.status in ('menunggu', 'dicek')
        and p.amount + p.unique_code = v_amount + c
   );
  if v_free is null then return null; end if;

  v_code := v_free[1 + floor(random() * array_length(v_free, 1))::int];
  update public.jalan_sehat_pesanan set unique_code = v_code where id = p_pesanan;
  return v_code;
end $$;


--
-- Name: alokasi_kode_unik_dl(bigint); Type: FUNCTION; Schema: public; Owner: -
-- Kode unik 501..999 tagihan lapak dealer (migrasi 20261029-dealer-bayar.sql).
--

CREATE FUNCTION public.alokasi_kode_unik_dl(p_dealer bigint) returns integer
    language plpgsql security definer
    set search_path to 'public'
    as $$
declare
  v_amount int;
  v_code   int;
  v_free   int[];
begin
  perform pg_advisory_xact_lock(hashtext('drivetech:kode_unik_dl'));

  select amount, unique_code into v_amount, v_code
    from public.dealer_pendaftaran where id = p_dealer for update;
  if not found then raise exception 'dealer % tidak ditemukan', p_dealer; end if;
  if v_code is not null or v_amount is null then return v_code; end if;

  select array_agg(c) into v_free
    from generate_series(501, 999) c
   where not exists (
     select 1 from public.dealer_pendaftaran d
      where d.id <> p_dealer
        and d.unique_code is not null
        and d.status_bayar in ('belum', 'dicek')
        and d.amount + d.unique_code = v_amount + c
   );
  if v_free is null then return null; end if;

  v_code := v_free[1 + floor(random() * array_length(v_free, 1))::int];
  update public.dealer_pendaftaran set unique_code = v_code where id = p_dealer;
  return v_code;
end $$;


--
-- Name: alokasi_kode_unik(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.alokasi_kode_unik(p_payment uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_amount numeric;
  v_code   int;
  v_free   int[];
begin
  perform pg_advisory_xact_lock(hashtext('drivetech:kode_unik'));

  select amount, unique_code into v_amount, v_code
    from public.admin_fee_payments where id = p_payment for update;
  if not found then raise exception 'tagihan % tidak ditemukan', p_payment; end if;
  if v_code is not null then return v_code; end if;

  -- Kode bebas = nominal transfernya tidak sama dengan tagihan lain yang masih hidup.
  select array_agg(c) into v_free
    from generate_series(350, 500) c
   where not exists (
     select 1
       from public.admin_fee_payments p
       join public.bookings b on b.id = p.booking_id
      where p.id <> p_payment
        and p.unique_code is not null
        and p.status <> 'verified'
        and b.status = 'pending_payment'
        and p.amount + p.unique_code = v_amount + c
   );
  if v_free is null then return null; end if;

  v_code := v_free[1 + floor(random() * array_length(v_free, 1))::int];
  update public.admin_fee_payments set unique_code = v_code, updated_at = now() where id = p_payment;
  return v_code;
end $$;


--
-- Name: booking_dates_copy_status(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.booking_dates_copy_status() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin
  select status into new.booking_status
    from public.bookings
   where id = new.booking_id;
  if new.booking_status is null then
    new.booking_status := 'pending_payment';
  end if;
  new.is_active := new.booking_status in ('pending_payment', 'confirmed');
  return new;
end;
$$;


--
-- Name: expire_unpaid_bookings(interval, interval); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.expire_unpaid_bookings(batas interval DEFAULT '24:00:00'::interval, batas_submitted interval DEFAULT '72:00:00'::interval) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  jumlah integer;
begin
  with kandidat as (
    select b.id
    from public.bookings b
    left join public.admin_fee_payments p on p.booking_id = b.id
    where b.status = 'pending_payment'
      and (
        (coalesce(p.status, 'unpaid'::public.payment_status) = 'unpaid'
          and b.created_at < now() - batas)
        or (p.status = 'rejected' and p.updated_at < now() - batas)
        -- Bukti dikirim tapi tidak diverifikasi siapa pun selama batas_submitted:
        -- lepaskan tanggalnya.
        or (p.status = 'submitted'
          and coalesce(p.submitted_at, p.updated_at, b.created_at) < now() - batas_submitted)
      )
  )
  update public.bookings b
     set status = 'cancelled'
    from kandidat k
   where b.id = k.id;

  get diagnostics jumlah = row_count;
  if jumlah > 0 then
    raise log 'expire_unpaid_bookings: % booking dibatalkan otomatis', jumlah;
  end if;
  return jumlah;
end;
$$;


--
-- Name: rate_limit_hit(text, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rate_limit_hit(p_key text, p_limit integer, p_window_seconds integer) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  jumlah int;
begin
  select count(*) into jumlah
    from public.rate_limit_events
   where key = p_key
     and created_at > now() - make_interval(secs => p_window_seconds);
  if jumlah >= p_limit then
    return false;
  end if;
  insert into public.rate_limit_events (key) values (p_key);
  return true;
end;
$$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;


--
-- Name: sync_booking_dates_active(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_booking_dates_active() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin
  update public.booking_dates
     set is_active = (new.status in ('pending_payment', 'confirmed')),
         booking_status = new.status
   where booking_id = new.id;
  return new;
end;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: admin_fee_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_fee_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    booking_id uuid NOT NULL,
    amount numeric NOT NULL,
    method public.payment_method NOT NULL,
    status public.payment_status DEFAULT 'unpaid'::public.payment_status NOT NULL,
    proof_url text,
    verified_by uuid,
    verified_at timestamp with time zone,
    reject_reason text,
    submitted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    unique_code integer,
    wa_chat text,
    reminded_at timestamp with time zone,
    kwitansi_no text UNIQUE,
    nominal_kwitansi integer,
    CONSTRAINT admin_fee_payments_unique_code_range CHECK (((unique_code IS NULL) OR ((unique_code >= 350) AND (unique_code <= 999))))
);


--
-- Name: admin_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    full_name text,
    role public.admin_role DEFAULT 'admin'::public.admin_role NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    username text,
    password_hash text,
    aktif boolean DEFAULT true NOT NULL
);


--
-- Name: COLUMN admin_users.username; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.admin_users.username IS 'Nama login, huruf kecil.';


--
-- Name: COLUMN admin_users.password_hash; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.admin_users.password_hash IS 'Hash bcrypt, dicocokkan lewat pgcrypto crypt(). NULL = tidak bisa login.';


--
-- Name: COLUMN admin_users.aktif; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.admin_users.aktif IS 'false = akun dinonaktifkan: tidak bisa login dan sesi berjalan ditolak.';


--
-- Name: booking_dates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.booking_dates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    booking_id uuid NOT NULL,
    slot_id uuid NOT NULL,
    event_date date NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    booking_status public.booking_status DEFAULT 'pending_payment'::public.booking_status NOT NULL
);

--
-- Name: COLUMN booking_dates.booking_status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.booking_dates.booking_status IS 'Salinan bookings.status (dirawat trigger) agar okupansi publik tidak perlu membaca tabel bookings.';


--
-- Name: bookings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bookings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slot_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    status public.booking_status DEFAULT 'pending_payment'::public.booking_status NOT NULL,
    booking_code text DEFAULT ('BK-'::text || upper(substr(encode(public.gen_random_bytes(5), 'hex'::text), 1, 10))) NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: email_verifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_verifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    code_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    verified_at timestamp with time zone,
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE email_verifications; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.email_verifications IS 'Kode verifikasi email (hash) untuk mengunci booking.';


--
-- Name: event_dates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_dates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid,
    event_date date NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    location text,
    start_date date,
    end_date date,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: leasing_applications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.leasing_applications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    purchase_transaction_id uuid NOT NULL,
    leasing_partner_id uuid NOT NULL,
    dp_amount numeric,
    tenor_bulan integer,
    status public.leasing_status DEFAULT 'submitted'::public.leasing_status NOT NULL,
    commission_amount numeric,
    commission_paid boolean DEFAULT false,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: leasing_partners; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.leasing_partners (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    contact text,
    commission_rate numeric,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: notification_outbox; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_outbox (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    channel text DEFAULT 'whatsapp'::text NOT NULL,
    recipient text NOT NULL,
    body text NOT NULL,
    kind text DEFAULT 'other'::text NOT NULL,
    booking_code text,
    status text DEFAULT 'pending'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    last_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    sent_at timestamp with time zone,
    CONSTRAINT notification_outbox_channel_check CHECK ((channel = 'whatsapp'::text)),
    CONSTRAINT notification_outbox_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'sent'::text, 'failed'::text, 'skipped'::text])))
);


--
-- Name: TABLE notification_outbox; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.notification_outbox IS 'Antrean pesan WhatsApp ke penyewa; dikirim worker VPS lewat bot Hermes (nomor kantor).';


--
-- Name: purchase_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchase_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slot_id uuid NOT NULL,
    buyer_name text NOT NULL,
    buyer_phone text,
    payment_method public.purchase_payment_method NOT NULL,
    unit_description text,
    unit_price numeric,
    status public.purchase_status DEFAULT 'new'::public.purchase_status NOT NULL,
    transaction_code text DEFAULT ('TX-'::text || upper(substr(encode(public.gen_random_bytes(5), 'hex'::text), 1, 10))) NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: qr_scans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.qr_scans (
    id bigint NOT NULL,
    media text NOT NULL,
    platform text DEFAULT 'lain'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: qr_scans_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.qr_scans_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: qr_scans_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.qr_scans_id_seq OWNED BY public.qr_scans.id;


--
-- Name: rate_limit_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rate_limit_events (
    id bigint NOT NULL,
    key text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: rate_limit_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.rate_limit_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: rate_limit_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.rate_limit_events_id_seq OWNED BY public.rate_limit_events.id;


--
-- Name: slot_date_status; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.slot_date_status AS
 SELECT slot_id,
    event_date,
    booking_status AS status
   FROM public.booking_dates bd
  WHERE (is_active AND (booking_status = ANY (ARRAY['pending_payment'::public.booking_status, 'confirmed'::public.booking_status])));


--
-- Name: slots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.slots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    zone_id uuid,
    slot_number integer,
    slot_label text,
    status public.slot_status DEFAULT 'available'::public.slot_status NOT NULL,
    svg_element_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    admin_fee_override numeric,
    peruntukan text
);

--
-- Name: COLUMN slots.admin_fee_override; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.slots.admin_fee_override IS 'Harga admin fee per tanggal KHUSUS slot ini; null = ikut zones.admin_fee.';


--
-- Name: COLUMN slots.peruntukan; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.slots.peruntukan IS 'Peruntukan khusus slot (mis. "Booth Leasing", "Booth Otomotif"); null = umum.';


--
-- Name: tenants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    phone text,
    email text,
    tenant_type public.tenant_type NOT NULL,
    detail jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: vehicle_listings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vehicle_listings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    booking_id uuid NOT NULL,
    slot_id uuid NOT NULL,
    vehicle_name text NOT NULL,
    plate_number text,
    price numeric NOT NULL,
    year integer,
    mileage_km integer,
    transmission text,
    color text,
    description text,
    photo_url text NOT NULL,
    is_visible boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    vehicle_kind text DEFAULT 'mobil'::text NOT NULL,
    photo_thumb_url text,
    CONSTRAINT vehicle_listings_mileage_km_check CHECK ((mileage_km >= 0)),
    CONSTRAINT vehicle_listings_price_check CHECK ((price > (0)::numeric)),
    CONSTRAINT vehicle_listings_vehicle_kind_check CHECK ((vehicle_kind = ANY (ARRAY['mobil'::text, 'motor'::text]))),
    CONSTRAINT vehicle_listings_year_check CHECK (((year >= 1950) AND (year <= 2100)))
);


--
-- Name: TABLE vehicle_listings; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.vehicle_listings IS 'Katalog kendaraan per booking slot zona kendaraan; tampil publik saat booking confirmed & is_visible.';


--
-- Name: COLUMN vehicle_listings.vehicle_kind; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.vehicle_listings.vehicle_kind IS 'Jenis kendaraan untuk filter katalog: mobil | motor.';


--
-- Name: COLUMN vehicle_listings.photo_thumb_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.vehicle_listings.photo_thumb_url IS 'Foto versi kecil (~640px) untuk kartu katalog. NULL = pakai photo_url.';


--
-- Name: zones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.zones (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid,
    name text NOT NULL,
    zone_type public.zone_type NOT NULL,
    svg_group_id text,
    admin_fee numeric DEFAULT 0 NOT NULL,
    description text,
    display_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: qr_scans id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qr_scans ALTER COLUMN id SET DEFAULT nextval('public.qr_scans_id_seq'::regclass);


--
-- Name: rate_limit_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rate_limit_events ALTER COLUMN id SET DEFAULT nextval('public.rate_limit_events_id_seq'::regclass);


--
-- Name: admin_fee_payments admin_fee_payments_booking_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_fee_payments
    ADD CONSTRAINT admin_fee_payments_booking_id_key UNIQUE (booking_id);


--
-- Name: admin_fee_payments admin_fee_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_fee_payments
    ADD CONSTRAINT admin_fee_payments_pkey PRIMARY KEY (id);


--
-- Name: admin_users admin_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_users
    ADD CONSTRAINT admin_users_pkey PRIMARY KEY (id);


--
-- Name: admin_users admin_users_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_users
    ADD CONSTRAINT admin_users_username_key UNIQUE (username);


--
-- Name: booking_dates booking_dates_booking_id_event_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_dates
    ADD CONSTRAINT booking_dates_booking_id_event_date_key UNIQUE (booking_id, event_date);


--
-- Name: booking_dates booking_dates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_dates
    ADD CONSTRAINT booking_dates_pkey PRIMARY KEY (id);


--
-- Name: bookings bookings_booking_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_booking_code_key UNIQUE (booking_code);


--
-- Name: bookings bookings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_pkey PRIMARY KEY (id);


--
-- Name: email_verifications email_verifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_verifications
    ADD CONSTRAINT email_verifications_pkey PRIMARY KEY (id);


--
-- Name: event_dates event_dates_event_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_dates
    ADD CONSTRAINT event_dates_event_date_key UNIQUE (event_date);


--
-- Name: event_dates event_dates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_dates
    ADD CONSTRAINT event_dates_pkey PRIMARY KEY (id);


--
-- Name: events events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_pkey PRIMARY KEY (id);


--
-- Name: leasing_applications leasing_applications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leasing_applications
    ADD CONSTRAINT leasing_applications_pkey PRIMARY KEY (id);


--
-- Name: leasing_applications leasing_applications_purchase_transaction_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leasing_applications
    ADD CONSTRAINT leasing_applications_purchase_transaction_id_key UNIQUE (purchase_transaction_id);


--
-- Name: leasing_partners leasing_partners_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leasing_partners
    ADD CONSTRAINT leasing_partners_pkey PRIMARY KEY (id);


--
-- Name: notification_outbox notification_outbox_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_outbox
    ADD CONSTRAINT notification_outbox_pkey PRIMARY KEY (id);


--
-- Name: purchase_transactions purchase_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_transactions
    ADD CONSTRAINT purchase_transactions_pkey PRIMARY KEY (id);


--
-- Name: purchase_transactions purchase_transactions_transaction_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_transactions
    ADD CONSTRAINT purchase_transactions_transaction_code_key UNIQUE (transaction_code);


--
-- Name: qr_scans qr_scans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qr_scans
    ADD CONSTRAINT qr_scans_pkey PRIMARY KEY (id);


--
-- Name: rate_limit_events rate_limit_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rate_limit_events
    ADD CONSTRAINT rate_limit_events_pkey PRIMARY KEY (id);


--
-- Name: slots slots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.slots
    ADD CONSTRAINT slots_pkey PRIMARY KEY (id);


--
-- Name: slots slots_svg_element_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.slots
    ADD CONSTRAINT slots_svg_element_id_key UNIQUE (svg_element_id);


--
-- Name: slots slots_zone_id_slot_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.slots
    ADD CONSTRAINT slots_zone_id_slot_number_key UNIQUE (zone_id, slot_number);


--
-- Name: tenants tenants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_pkey PRIMARY KEY (id);


--
-- Name: vehicle_listings vehicle_listings_booking_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicle_listings
    ADD CONSTRAINT vehicle_listings_booking_id_key UNIQUE (booking_id);


--
-- Name: vehicle_listings vehicle_listings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicle_listings
    ADD CONSTRAINT vehicle_listings_pkey PRIMARY KEY (id);


--
-- Name: zones zones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zones
    ADD CONSTRAINT zones_pkey PRIMARY KEY (id);


--
-- Name: zones zones_svg_group_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zones
    ADD CONSTRAINT zones_svg_group_id_key UNIQUE (svg_group_id);


--
-- Name: booking_dates_active_slot_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX booking_dates_active_slot_date_idx ON public.booking_dates USING btree (slot_id, event_date) WHERE is_active;


--
-- Name: booking_dates_slot_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX booking_dates_slot_id_idx ON public.booking_dates USING btree (slot_id);


--
-- Name: bookings_slot_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bookings_slot_id_idx ON public.bookings USING btree (slot_id);


--
-- Name: bookings_tenant_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bookings_tenant_id_idx ON public.bookings USING btree (tenant_id);


--
-- Name: email_verifications_email_time_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX email_verifications_email_time_idx ON public.email_verifications USING btree (email, created_at DESC);


--
-- Name: event_dates_event_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX event_dates_event_id_idx ON public.event_dates USING btree (event_id);


--
-- Name: leasing_applications_partner_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX leasing_applications_partner_id_idx ON public.leasing_applications USING btree (leasing_partner_id);


--
-- Name: notification_outbox_pending_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notification_outbox_pending_idx ON public.notification_outbox USING btree (created_at) WHERE (status = 'pending'::text);


--
-- Name: purchase_transactions_slot_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX purchase_transactions_slot_id_idx ON public.purchase_transactions USING btree (slot_id);


--
-- Name: qr_scans_media_time_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX qr_scans_media_time_idx ON public.qr_scans USING btree (media, created_at DESC);


--
-- Name: qr_scans_time_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX qr_scans_time_idx ON public.qr_scans USING btree (created_at DESC);


--
-- Name: rate_limit_events_key_time_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX rate_limit_events_key_time_idx ON public.rate_limit_events USING btree (key, created_at DESC);


--
-- Name: slots_zone_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX slots_zone_status_idx ON public.slots USING btree (zone_id, status);


--
-- Name: tenants_phone_type_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX tenants_phone_type_uidx ON public.tenants USING btree (phone, tenant_type) WHERE (phone IS NOT NULL);


--
-- Name: vehicle_listings_slot_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vehicle_listings_slot_id_idx ON public.vehicle_listings USING btree (slot_id);


--
-- Name: zones_event_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX zones_event_id_idx ON public.zones USING btree (event_id);


--
-- Name: admin_fee_payments admin_fee_payments_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER admin_fee_payments_set_updated_at BEFORE UPDATE ON public.admin_fee_payments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: booking_dates booking_dates_copy_status; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER booking_dates_copy_status BEFORE INSERT ON public.booking_dates FOR EACH ROW EXECUTE FUNCTION public.booking_dates_copy_status();


--
-- Name: bookings bookings_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER bookings_set_updated_at BEFORE UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: bookings bookings_sync_booking_dates_active; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER bookings_sync_booking_dates_active AFTER UPDATE OF status ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.sync_booking_dates_active();


--
-- Name: leasing_applications leasing_applications_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER leasing_applications_set_updated_at BEFORE UPDATE ON public.leasing_applications FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: purchase_transactions purchase_transactions_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER purchase_transactions_set_updated_at BEFORE UPDATE ON public.purchase_transactions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: slots slots_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER slots_set_updated_at BEFORE UPDATE ON public.slots FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: vehicle_listings vehicle_listings_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER vehicle_listings_set_updated_at BEFORE UPDATE ON public.vehicle_listings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: admin_fee_payments admin_fee_payments_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_fee_payments
    ADD CONSTRAINT admin_fee_payments_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE CASCADE;


--
-- Name: booking_dates booking_dates_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_dates
    ADD CONSTRAINT booking_dates_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE CASCADE;


--
-- Name: booking_dates booking_dates_slot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_dates
    ADD CONSTRAINT booking_dates_slot_id_fkey FOREIGN KEY (slot_id) REFERENCES public.slots(id);


--
-- Name: bookings bookings_slot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_slot_id_fkey FOREIGN KEY (slot_id) REFERENCES public.slots(id);


--
-- Name: bookings bookings_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: event_dates event_dates_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_dates
    ADD CONSTRAINT event_dates_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: leasing_applications leasing_applications_leasing_partner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leasing_applications
    ADD CONSTRAINT leasing_applications_leasing_partner_id_fkey FOREIGN KEY (leasing_partner_id) REFERENCES public.leasing_partners(id);


--
-- Name: leasing_applications leasing_applications_purchase_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leasing_applications
    ADD CONSTRAINT leasing_applications_purchase_transaction_id_fkey FOREIGN KEY (purchase_transaction_id) REFERENCES public.purchase_transactions(id) ON DELETE CASCADE;


--
-- Name: purchase_transactions purchase_transactions_slot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_transactions
    ADD CONSTRAINT purchase_transactions_slot_id_fkey FOREIGN KEY (slot_id) REFERENCES public.slots(id);


--
-- Name: slots slots_zone_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.slots
    ADD CONSTRAINT slots_zone_id_fkey FOREIGN KEY (zone_id) REFERENCES public.zones(id) ON DELETE CASCADE;


--
-- Name: vehicle_listings vehicle_listings_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicle_listings
    ADD CONSTRAINT vehicle_listings_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE CASCADE;


--
-- Name: vehicle_listings vehicle_listings_slot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicle_listings
    ADD CONSTRAINT vehicle_listings_slot_id_fkey FOREIGN KEY (slot_id) REFERENCES public.slots(id);


--
-- Name: zones zones_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zones
    ADD CONSTRAINT zones_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: jalan_sehat_pesanan; Type: TABLE; Schema: public; Owner: -
-- Pesanan jalan sehat berbayar (migrasi db/migrasi/20261029-jalan-sehat-berbayar.sql): N peserta,
-- dibayar QRIS sebesar amount + unique_code. Tiket dibuat di jalan_sehat_peserta saat lunas.
--

CREATE TABLE public.jalan_sehat_pesanan (
    id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    kode text DEFAULT ('JS-'::text || upper(encode(public.gen_random_bytes(4), 'hex'::text))) NOT NULL UNIQUE,
    token text DEFAULT encode(public.gen_random_bytes(16), 'hex'::text) NOT NULL UNIQUE,
    nama text NOT NULL,
    phone text NOT NULL,
    domisili text NOT NULL,
    jumlah integer NOT NULL CONSTRAINT jalan_sehat_pesanan_jumlah_check CHECK (jumlah > 0),
    amount integer NOT NULL,
    unique_code integer CONSTRAINT jalan_sehat_pesanan_kode_unik_check CHECK (unique_code >= 1 AND unique_code <= 349),
    sumber text NOT NULL CONSTRAINT jalan_sehat_pesanan_sumber_check CHECK (sumber = ANY (ARRAY['web'::text, 'wa'::text])),
    status text DEFAULT 'menunggu'::text NOT NULL CONSTRAINT jalan_sehat_pesanan_status_check CHECK (status = ANY (ARRAY['menunggu'::text, 'dicek'::text, 'lunas'::text, 'batal'::text])),
    batas_bayar timestamp with time zone NOT NULL,
    proof_url text,
    submitted_at timestamp with time zone,
    verified_at timestamp with time zone,
    alasan_tolak text,
    wa_chat text,
    kabar text CONSTRAINT jalan_sehat_pesanan_kabar_check CHECK (kabar = ANY (ARRAY['lunas'::text, 'ditolak'::text])),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX jalan_sehat_pesanan_phone_idx ON public.jalan_sehat_pesanan USING btree (phone);


--
-- Name: jalan_sehat_peserta; Type: TABLE; Schema: public; Owner: -
-- Satu baris = satu tiket undian, nomor tiket = id (migrasi 20261028-jalan-sehat.sql dan
-- 20261029-jalan-sehat-berbayar.sql). Tiket pesanan dibuat saat lunas; tiket 'tempat' dicetak kosong
-- dan baru aktif setelah terjual. menang_at terisi saat terpilih di undian panel admin.
--

CREATE TABLE public.jalan_sehat_peserta (
    id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    nama text,
    phone text,
    domisili text,
    token text DEFAULT encode(public.gen_random_bytes(16), 'hex'::text) NOT NULL UNIQUE,
    menang_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    pesanan_id bigint REFERENCES public.jalan_sehat_pesanan(id),
    sumber text DEFAULT 'web'::text NOT NULL CONSTRAINT jalan_sehat_peserta_sumber_check CHECK (sumber = ANY (ARRAY['web'::text, 'wa'::text, 'tempat'::text])),
    aktif boolean DEFAULT true NOT NULL,
    dicetak_at timestamp with time zone
);

CREATE INDEX jalan_sehat_peserta_pesanan_idx ON public.jalan_sehat_peserta USING btree (pesanan_id);

--
-- Alat admin (2026-10-11). Untuk database yang sudah berjalan, perubahan yang
-- sama ada di db/migrasi/2026-10-11-alat-admin.sql.
--

--
-- Name: admin_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_log (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    waktu timestamp with time zone DEFAULT now() NOT NULL,
    admin_id uuid,
    username text NOT NULL,
    aksi text NOT NULL,
    rincian text DEFAULT ''::text NOT NULL
);

COMMENT ON TABLE public.admin_log IS 'Log aksi admin yang mengubah data. Tidak pernah memuat sandi.';

CREATE INDEX admin_log_waktu_idx ON public.admin_log USING btree (waktu DESC);


--
-- Name: penarikan_saldo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.penarikan_saldo (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    tanggal date NOT NULL,
    nominal numeric NOT NULL,
    catatan text DEFAULT ''::text NOT NULL,
    dicatat_oleh text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT penarikan_saldo_nominal_check CHECK ((nominal > (0)::numeric))
);

COMMENT ON TABLE public.penarikan_saldo IS 'Catatan penarikan saldo QRIS ke rekening, diisi superadmin.';


--
-- Name: kehadiran; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kehadiran (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
    tanggal date NOT NULL,
    dicatat_oleh text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT kehadiran_booking_id_tanggal_key UNIQUE (booking_id, tanggal)
);

COMMENT ON TABLE public.kehadiran IS 'Registrasi ulang hari-H: satu baris per booking per tanggal gelaran yang hadir.';


--
-- Name: dealer_pendaftaran; Type: TABLE; Schema: public; Owner: -
-- Formulir dealer mobil dan motor baru di /dealer (migrasi db/migrasi/20261029-dealer-baru.sql).
-- data = isian formulir dengan kunci nama kolom PDF. ttd dan stempel = gambar tanda tangan dan stempel.
-- wa_chat = chat WhatsApp yang meminta PDF ke nomor kantor; kabar = PDF berubah dan perlu dikirim ulang ke sana
-- (migrasi db/migrasi/20261029-dealer-wa.sql). Kolom amount sampai kabar_bayar = tagihan lapak QRIS, bukti, lunas,
-- dan nomor kwitansi (migrasi db/migrasi/20261029-dealer-bayar.sql).
--

CREATE TABLE public.dealer_pendaftaran (
    id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    token text DEFAULT encode(public.gen_random_bytes(16), 'hex'::text) NOT NULL UNIQUE,
    data jsonb NOT NULL,
    ttd bytea,
    stempel bytea,
    ditandatangani_at timestamp with time zone,
    diterima_at timestamp with time zone,
    wa_chat text,
    kabar text CONSTRAINT dealer_pendaftaran_kabar_check CHECK ((kabar = ANY (ARRAY['ditandatangani'::text, 'diterima'::text]))),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    amount integer,
    unique_code integer CONSTRAINT dealer_pendaftaran_kode_unik_check CHECK (((unique_code >= 501) AND (unique_code <= 999))),
    status_bayar text DEFAULT 'belum'::text NOT NULL CONSTRAINT dealer_pendaftaran_status_bayar_check CHECK ((status_bayar = ANY (ARRAY['belum'::text, 'dicek'::text, 'lunas'::text]))),
    proof_url text,
    submitted_at timestamp with time zone,
    alasan_tolak text,
    lunas_at timestamp with time zone,
    lunas_oleh uuid REFERENCES public.admin_users(id),
    lunas_lewat text CONSTRAINT dealer_pendaftaran_lunas_lewat_check CHECK ((lunas_lewat = ANY (ARRAY['admin'::text, 'discord'::text, 'cocok'::text]))),
    kwitansi_no text UNIQUE,
    kabar_bayar text CONSTRAINT dealer_pendaftaran_kabar_bayar_check CHECK ((kabar_bayar = ANY (ARRAY['lunas'::text, 'ditolak'::text])))
);


--
-- Name: kwitansi_dealer_seq; Type: SEQUENCE; Schema: public; Owner: -
-- Nomor urut kwitansi dealer NNN/DPRO-DT-KW/<bulan romawi>/<tahun> (migrasi 20261029-dealer-bayar.sql).
--

CREATE SEQUENCE public.kwitansi_dealer_seq;


--
-- Name: nomor_kwitansi_berikut(); Type: FUNCTION; Schema: public; Owner: -
-- Nomor kwitansi NNN/DPRO-DT-KW/<bulan romawi>/<tahun>, satu seri untuk booking dan dealer
-- (migrasi 20261029-booking-kwitansi.sql).
--

CREATE FUNCTION public.nomor_kwitansi_berikut() returns text
    language sql
    set search_path to 'public'
    as $$
  select lpad(nextval('public.kwitansi_dealer_seq')::text, 3, '0') || '/DPRO-DT-KW/'
         || trim(to_char(now() at time zone 'Asia/Jakarta', 'RM')) || '/'
         || to_char(now() at time zone 'Asia/Jakarta', 'YYYY')
$$;


--
-- Name: isi_kwitansi_booking(); Type: FUNCTION; Schema: public; Owner: -
-- Trigger: pembayaran booking yang menjadi verified mendapat nomor kwitansi sekali.
--

CREATE FUNCTION public.isi_kwitansi_booking() returns trigger
    language plpgsql
    set search_path to 'public'
    as $$
begin
  if new.status = 'verified' and new.kwitansi_no is null then
    new.kwitansi_no := public.nomor_kwitansi_berikut();
  end if;
  return new;
end $$;

CREATE TRIGGER admin_fee_payments_kwitansi
    BEFORE INSERT OR UPDATE OF status ON public.admin_fee_payments
    FOR EACH ROW EXECUTE FUNCTION public.isi_kwitansi_booking();


--
-- Name: kwitansi_ttd; Type: TABLE; Schema: public; Owner: -
-- Satu baris goresan tanda tangan penanda tangan kwitansi dealer (PNG transparan), dari /drivetechadmin/kwitansi.
--

CREATE TABLE public.kwitansi_ttd (
    id smallint DEFAULT 1 PRIMARY KEY CONSTRAINT kwitansi_ttd_satu CHECK ((id = 1)),
    png bytea NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid REFERENCES public.admin_users(id)
);
