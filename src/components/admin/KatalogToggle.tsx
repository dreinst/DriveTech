"use client";

import { useActionState } from "react";

import { setVehicleVisibilityAction } from "@/lib/actions/admin";
import { initialActionState } from "@/lib/actions/state";
import type { VehicleListingRow } from "@/lib/types/database";
import { cn } from "@/lib/utils";

export type KatalogToggleProps = {
  listing: VehicleListingRow | null;
  className?: string;
};

/**
 * Kontrol kecil di daftar booking admin: tampilkan/sembunyikan kendaraan dari
 * /katalog. Hanya dirender untuk booking zona kendaraan (listing 1:1).
 * Aksi khusus role admin (requireFullAdmin di server action).
 */
export function KatalogToggle({ listing, className }: KatalogToggleProps) {
  const [state, formAction] = useActionState(setVehicleVisibilityAction, initialActionState);

  if (!listing) return null;

  return (
    <form action={formAction} className={cn("space-y-1", className)}>
      <input type="hidden" name="listingId" value={listing.id} />
      <input type="hidden" name="visible" value={listing.is_visible ? "0" : "1"} />
      <button
        type="submit"
        className={cn(
          "inline-flex min-h-8 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-xs font-medium transition-colors duration-150",
          listing.is_visible
            ? "border-line bg-card text-muted hover:border-danger hover:text-danger"
            : "border-line bg-card text-muted hover:border-ok hover:text-ok",
        )}
        title={`${listing.vehicle_name} — ${listing.plate_number}`}
      >
        <span
          aria-hidden="true"
          className={cn(
            "h-1.5 w-1.5 shrink-0 rounded-full",
            listing.is_visible ? "bg-ok" : "bg-danger",
          )}
        />
        {listing.is_visible ? "Sembunyikan dari katalog" : "Tampilkan di katalog"}
      </button>
      {state.status === "error" ? (
        <p className="text-xs text-danger" role="alert">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
