"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { adminLogoutAction } from "@/lib/actions/admin";
import { initialActionState } from "@/lib/actions/state";

/**
 * Tombol keluar sesi admin.
 *
 * Dibungkus useActionState (bukan langsung `action={adminLogoutAction}`) karena
 * server action ini mengembalikan ActionState, sementara prop `action` pada
 * <form> hanya menerima fungsi bertipe void/Promise<void>. Perilakunya sama:
 * submit -> signOutAdmin() -> redirect ke /admin/login.
 */
export function LogoutButton() {
  const [, formAction] = useActionState(adminLogoutAction, initialActionState);

  return (
    <form action={formAction}>
      <SubmitButton variant="ghost" size="sm" pendingText="Keluar…">
        <svg
          width="15"
          height="15"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12.5 6V4.5a1.5 1.5 0 0 0-1.5-1.5H5a1.5 1.5 0 0 0-1.5 1.5v11A1.5 1.5 0 0 0 5 17h6a1.5 1.5 0 0 0 1.5-1.5V14" />
          <path d="M8.5 10h8" />
          <path d="M14 7.5 16.5 10 14 12.5" />
        </svg>
        Keluar
      </SubmitButton>
    </form>
  );
}
