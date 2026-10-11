"use client";

import { useActionState } from "react";
import type { FormEvent, ReactNode } from "react";

import { initialActionState, type ActionState } from "@/lib/actions/state";

export type FormAksiProps = {
  action: (prevState: ActionState, formData: FormData) => Promise<ActionState>;
  children: ReactNode;
  className?: string;
  /** Kalau diisi, pengguna ditanya dulu sebelum form dikirim. */
  konfirmasi?: string;
};

/**
 * Form server action serbaguna untuk alat panel admin: isinya (kolom dan tombol)
 * dirender halaman, komponen ini hanya menjalankan action dan menampilkan
 * pesan hasilnya di bawah form.
 */
export function FormAksi({ action, children, className, konfirmasi }: FormAksiProps) {
  const [state, formAction] = useActionState(action, initialActionState);

  function tanya(event: FormEvent<HTMLFormElement>) {
    if (konfirmasi && !window.confirm(konfirmasi)) event.preventDefault();
  }

  return (
    <form action={formAction} onSubmit={tanya} className={className}>
      {children}
      {state.status !== "idle" && state.message ? (
        <p
          role="status"
          className={`w-full text-xs font-medium ${state.status === "success" ? "text-ok" : "text-danger"}`}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
