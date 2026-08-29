/**
 * Tipe Database ala supabase-gen, DITULIS TANGAN agar cocok 100% dengan
 * supabase/migrations/20260826090000_init.sql,
 * supabase/migrations/20260827120000_per_tanggal.sql, dan
 * supabase/migrations/20260827150000_harga_per_slot.sql.
 * Perbarui bersamaan kalau skema berubah.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      events: {
        Row: {
          id: string;
          name: string;
          location: string | null;
          start_date: string | null;
          end_date: string | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          location?: string | null;
          start_date?: string | null;
          end_date?: string | null;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          location?: string | null;
          start_date?: string | null;
          end_date?: string | null;
          is_active?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      zones: {
        Row: {
          id: string;
          event_id: string;
          name: string;
          zone_type: Database["public"]["Enums"]["zone_type"];
          svg_group_id: string | null;
          admin_fee: number;
          description: string | null;
          display_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          event_id: string;
          name: string;
          zone_type: Database["public"]["Enums"]["zone_type"];
          svg_group_id?: string | null;
          admin_fee?: number;
          description?: string | null;
          display_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          event_id?: string;
          name?: string;
          zone_type?: Database["public"]["Enums"]["zone_type"];
          svg_group_id?: string | null;
          admin_fee?: number;
          description?: string | null;
          display_order?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "zones_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
        ];
      };
      slots: {
        Row: {
          id: string;
          zone_id: string;
          slot_number: number | null;
          slot_label: string | null;
          status: Database["public"]["Enums"]["slot_status"];
          svg_element_id: string | null;
          admin_fee_override: number | null;
          peruntukan: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          zone_id: string;
          slot_number?: number | null;
          slot_label?: string | null;
          status?: Database["public"]["Enums"]["slot_status"];
          svg_element_id?: string | null;
          admin_fee_override?: number | null;
          peruntukan?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          zone_id?: string;
          slot_number?: number | null;
          slot_label?: string | null;
          status?: Database["public"]["Enums"]["slot_status"];
          svg_element_id?: string | null;
          admin_fee_override?: number | null;
          peruntukan?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "slots_zone_id_fkey";
            columns: ["zone_id"];
            isOneToOne: false;
            referencedRelation: "zones";
            referencedColumns: ["id"];
          },
        ];
      };
      tenants: {
        Row: {
          id: string;
          name: string;
          phone: string | null;
          email: string | null;
          tenant_type: Database["public"]["Enums"]["tenant_type"];
          detail: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          phone?: string | null;
          email?: string | null;
          tenant_type: Database["public"]["Enums"]["tenant_type"];
          detail?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          phone?: string | null;
          email?: string | null;
          tenant_type?: Database["public"]["Enums"]["tenant_type"];
          detail?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
      bookings: {
        Row: {
          id: string;
          slot_id: string;
          tenant_id: string;
          status: Database["public"]["Enums"]["booking_status"];
          booking_code: string;
          notes: string | null;
          created_at: string | null;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slot_id: string;
          tenant_id: string;
          status?: Database["public"]["Enums"]["booking_status"];
          booking_code?: string;
          notes?: string | null;
          created_at?: string | null;
          updated_at?: string;
        };
        Update: {
          id?: string;
          slot_id?: string;
          tenant_id?: string;
          status?: Database["public"]["Enums"]["booking_status"];
          booking_code?: string;
          notes?: string | null;
          created_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bookings_slot_id_fkey";
            columns: ["slot_id"];
            isOneToOne: false;
            referencedRelation: "slots";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bookings_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      admin_fee_payments: {
        Row: {
          id: string;
          booking_id: string;
          amount: number;
          method: Database["public"]["Enums"]["payment_method"];
          status: Database["public"]["Enums"]["payment_status"];
          proof_url: string | null;
          verified_by: string | null;
          verified_at: string | null;
          reject_reason: string | null;
          submitted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          booking_id: string;
          amount: number;
          method: Database["public"]["Enums"]["payment_method"];
          status?: Database["public"]["Enums"]["payment_status"];
          proof_url?: string | null;
          verified_by?: string | null;
          verified_at?: string | null;
          reject_reason?: string | null;
          submitted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          booking_id?: string;
          amount?: number;
          method?: Database["public"]["Enums"]["payment_method"];
          status?: Database["public"]["Enums"]["payment_status"];
          proof_url?: string | null;
          verified_by?: string | null;
          verified_at?: string | null;
          reject_reason?: string | null;
          submitted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "admin_fee_payments_booking_id_fkey";
            columns: ["booking_id"];
            isOneToOne: true;
            referencedRelation: "bookings";
            referencedColumns: ["id"];
          },
        ];
      };
      leasing_partners: {
        Row: {
          id: string;
          name: string;
          contact: string | null;
          commission_rate: number | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          contact?: string | null;
          commission_rate?: number | null;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          contact?: string | null;
          commission_rate?: number | null;
          is_active?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      purchase_transactions: {
        Row: {
          id: string;
          slot_id: string;
          buyer_name: string;
          buyer_phone: string | null;
          payment_method: Database["public"]["Enums"]["purchase_payment_method"];
          unit_description: string | null;
          unit_price: number | null;
          status: Database["public"]["Enums"]["purchase_status"];
          transaction_code: string;
          notes: string | null;
          created_at: string | null;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slot_id: string;
          buyer_name: string;
          buyer_phone?: string | null;
          payment_method: Database["public"]["Enums"]["purchase_payment_method"];
          unit_description?: string | null;
          unit_price?: number | null;
          status?: Database["public"]["Enums"]["purchase_status"];
          transaction_code?: string;
          notes?: string | null;
          created_at?: string | null;
          updated_at?: string;
        };
        Update: {
          id?: string;
          slot_id?: string;
          buyer_name?: string;
          buyer_phone?: string | null;
          payment_method?: Database["public"]["Enums"]["purchase_payment_method"];
          unit_description?: string | null;
          unit_price?: number | null;
          status?: Database["public"]["Enums"]["purchase_status"];
          transaction_code?: string;
          notes?: string | null;
          created_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "purchase_transactions_slot_id_fkey";
            columns: ["slot_id"];
            isOneToOne: false;
            referencedRelation: "slots";
            referencedColumns: ["id"];
          },
        ];
      };
      leasing_applications: {
        Row: {
          id: string;
          purchase_transaction_id: string;
          leasing_partner_id: string;
          dp_amount: number | null;
          tenor_bulan: number | null;
          status: Database["public"]["Enums"]["leasing_status"];
          commission_amount: number | null;
          commission_paid: boolean | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          purchase_transaction_id: string;
          leasing_partner_id: string;
          dp_amount?: number | null;
          tenor_bulan?: number | null;
          status?: Database["public"]["Enums"]["leasing_status"];
          commission_amount?: number | null;
          commission_paid?: boolean | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          purchase_transaction_id?: string;
          leasing_partner_id?: string;
          dp_amount?: number | null;
          tenor_bulan?: number | null;
          status?: Database["public"]["Enums"]["leasing_status"];
          commission_amount?: number | null;
          commission_paid?: boolean | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "leasing_applications_purchase_transaction_id_fkey";
            columns: ["purchase_transaction_id"];
            isOneToOne: true;
            referencedRelation: "purchase_transactions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "leasing_applications_leasing_partner_id_fkey";
            columns: ["leasing_partner_id"];
            isOneToOne: false;
            referencedRelation: "leasing_partners";
            referencedColumns: ["id"];
          },
        ];
      };
      event_dates: {
        Row: {
          id: string;
          event_id: string | null;
          event_date: string;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          event_id?: string | null;
          event_date: string;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          event_id?: string | null;
          event_date?: string;
          is_active?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "event_dates_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
        ];
      };
      booking_dates: {
        Row: {
          id: string;
          booking_id: string;
          slot_id: string;
          event_date: string;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          booking_id: string;
          slot_id: string;
          event_date: string;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          booking_id?: string;
          slot_id?: string;
          event_date?: string;
          is_active?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "booking_dates_booking_id_fkey";
            columns: ["booking_id"];
            isOneToOne: false;
            referencedRelation: "bookings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "booking_dates_slot_id_fkey";
            columns: ["slot_id"];
            isOneToOne: false;
            referencedRelation: "slots";
            referencedColumns: ["id"];
          },
        ];
      };
      vehicle_listings: {
        Row: {
          id: string;
          booking_id: string;
          slot_id: string;
          vehicle_name: string;
          vehicle_kind: "mobil" | "motor";
          plate_number: string | null;
          price: number;
          year: number | null;
          mileage_km: number | null;
          transmission: string | null;
          color: string | null;
          description: string | null;
          photo_url: string;
          is_visible: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          booking_id: string;
          slot_id: string;
          vehicle_name: string;
          vehicle_kind?: "mobil" | "motor";
          plate_number?: string | null;
          price: number;
          year?: number | null;
          mileage_km?: number | null;
          transmission?: string | null;
          color?: string | null;
          description?: string | null;
          photo_url: string;
          is_visible?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          booking_id?: string;
          slot_id?: string;
          vehicle_name?: string;
          vehicle_kind?: "mobil" | "motor";
          plate_number?: string | null;
          price?: number;
          year?: number | null;
          mileage_km?: number | null;
          transmission?: string | null;
          color?: string | null;
          description?: string | null;
          photo_url?: string;
          is_visible?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "vehicle_listings_booking_id_fkey";
            columns: ["booking_id"];
            isOneToOne: true;
            referencedRelation: "bookings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "vehicle_listings_slot_id_fkey";
            columns: ["slot_id"];
            isOneToOne: false;
            referencedRelation: "slots";
            referencedColumns: ["id"];
          },
        ];
      };
      admin_users: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          role: Database["public"]["Enums"]["admin_role"];
          created_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          role?: Database["public"]["Enums"]["admin_role"];
          created_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string | null;
          role?: Database["public"]["Enums"]["admin_role"];
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      /**
       * Okupansi publik per (slot, tanggal): hanya baris booking_dates aktif
       * milik booking berstatus pending_payment / confirmed.
       */
      slot_date_status: {
        Row: {
          slot_id: string;
          event_date: string;
          status: Database["public"]["Enums"]["booking_status"];
        };
        Relationships: [];
      };
    };
    Functions: Record<string, never>;
    Enums: {
      zone_type:
        | "mobil_baru"
        | "mobil_bekas"
        | "mobil_motor_bekas"
        | "umkm"
        | "booth_khusus"
        | "warung"
        | "facility";
      slot_status: "available" | "pending" | "confirmed";
      tenant_type: "dealer_mobil_baru" | "individu_bekas" | "umkm" | "mitra_booth" | "warung";
      booking_status: "pending_payment" | "confirmed" | "cancelled";
      payment_method: "cash" | "transfer";
      payment_status: "unpaid" | "submitted" | "verified" | "rejected";
      purchase_payment_method: "cash" | "transfer" | "credit";
      purchase_status: "new" | "contacted" | "deal" | "cancelled";
      leasing_status: "submitted" | "verifying" | "approved" | "rejected" | "completed";
      admin_role: "admin" | "verifikator";
    };
    CompositeTypes: Record<string, never>;
  };
};

/* ---------- Alias baris tabel ---------- */

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];

export type EventRow = Tables<"events">;
export type ZoneRow = Tables<"zones">;
export type SlotRow = Tables<"slots">;
export type TenantRow = Tables<"tenants">;
export type BookingRow = Tables<"bookings">;
export type AdminFeePaymentRow = Tables<"admin_fee_payments">;
export type LeasingPartnerRow = Tables<"leasing_partners">;
export type PurchaseTransactionRow = Tables<"purchase_transactions">;
export type LeasingApplicationRow = Tables<"leasing_applications">;
export type AdminUserRow = Tables<"admin_users">;
export type EventDateRow = Tables<"event_dates">;
export type BookingDateRow = Tables<"booking_dates">;
export type VehicleListingRow = Tables<"vehicle_listings">;

/** Satu baris view publik slot_date_status (okupansi per slot per tanggal). */
export type SlotDateStatusRow =
  Database["public"]["Views"]["slot_date_status"]["Row"];

/* ---------- Alias enum ---------- */

export type Enums<T extends keyof Database["public"]["Enums"]> =
  Database["public"]["Enums"][T];

export type ZoneType = Enums<"zone_type">;
export type SlotStatus = Enums<"slot_status">;
export type TenantType = Enums<"tenant_type">;
export type BookingStatus = Enums<"booking_status">;
export type PaymentMethod = Enums<"payment_method">;
export type PaymentStatus = Enums<"payment_status">;
export type PurchasePaymentMethod = Enums<"purchase_payment_method">;
export type PurchaseStatus = Enums<"purchase_status">;
export type LeasingStatus = Enums<"leasing_status">;
export type AdminRole = Enums<"admin_role">;

/* ---------- Tipe komposit yang dipakai lapisan service ---------- */

/** Slot beserta zona induknya. */
export type SlotDetail = SlotRow & { zone: ZoneRow };

/** Zona beserta seluruh slotnya (untuk denah). */
export type ZoneWithSlots = ZoneRow & { slots: SlotRow[] };

/**
 * Payload denah publik.
 * eventDates: tanggal gelaran aktif >= hari ini, urut naik.
 * occupancy : baris view slot_date_status untuk tanggal-tanggal tersebut
 *             (bahan slotStatusForDates di src/lib/domain/ketersediaan.ts).
 */
export type FloorPlanData = {
  event: EventRow | null;
  zones: ZoneWithSlots[];
  eventDates: { id: string; event_date: string }[];
  occupancy: SlotDateStatusRow[];
};

/** Booking lengkap: slot + zona, tenant, pembayaran admin fee (1:1), dan tanggal sewanya. */
export type BookingDetail = BookingRow & {
  slot: SlotDetail;
  tenant: TenantRow;
  payment: AdminFeePaymentRow | null;
  /** Tanggal (YYYY-MM-DD) yang disewa booking ini — hanya baris aktif, urut naik. */
  dates: string[];
  /** Kendaraan untuk katalog (1:1, hanya booking zona kendaraan). */
  listing: VehicleListingRow | null;
};

/**
 * Item katalog kendaraan publik: listing + slot (lokasi parkir) + tanggal hadir.
 * HANYA berisi kolom aman untuk publik — data tenant TIDAK pernah ikut.
 */
export type CatalogItem = VehicleListingRow & {
  slot: SlotDetail;
  /** Tanggal hadir di pameran (YYYY-MM-DD, dari booking_dates aktif), urut naik. */
  dates: string[];
};

/** Pengajuan leasing beserta partnernya. */
export type LeasingDetail = LeasingApplicationRow & { partner: LeasingPartnerRow };

/** Transaksi pembelian unit beserta slot penjual dan pengajuan leasingnya. */
export type PurchaseDetail = PurchaseTransactionRow & {
  slot: SlotDetail;
  leasing: LeasingDetail | null;
};
