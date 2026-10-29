"use client";

import { startTransition, useActionState } from "react";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { daftarJalanSehatAction } from "@/lib/actions/jalan-sehat";
import { HARGA_TIKET_JS } from "@/lib/domain/jalan-sehat";
import { formatRupiah } from "@/lib/utils";
import { initialActionState } from "@/lib/actions/state";

export function JalanSehatForm() {
  const [state, formAction, isPending] = useActionState(daftarJalanSehatAction, initialActionState);
  const galat = state.fieldErrors ?? {};

  return (
    // onSubmit (bukan action=) supaya isian tidak dikosongkan React saat ada galat.
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => formAction(data));
      }}
    >
      {state.status === "error" && state.message ? <Alert tone="error">{state.message}</Alert> : null}
      <Field label="Nama pemesan" htmlFor="js-nama" error={galat.nama} required>
        <Input id="js-nama" name="nama" autoComplete="name" required maxLength={80} />
      </Field>
      <Field
        label="Nomor WhatsApp"
        htmlFor="js-phone"
        hint="Bukti bayar dikirim lewat WhatsApp dari nomor ini, tiket juga dikirim ke sini."
        error={galat.phone}
        required
      >
        <Input
          id="js-phone"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="08xxxxxxxxxx"
          required
        />
      </Field>
      <Field
        label="Domisili"
        htmlFor="js-domisili"
        hint="Kecamatan atau kota, contoh: Singosari, Malang."
        error={galat.domisili}
        required
      >
        <Input id="js-domisili" name="domisili" autoComplete="address-level2" required maxLength={80} />
      </Field>
      <Field
        label="Jumlah peserta"
        htmlFor="js-jumlah"
        hint={`${formatRupiah(HARGA_TIKET_JS)} per orang. Setiap peserta mendapat nomor undian sendiri.`}
        error={galat.jumlah}
        required
      >
        <Input id="js-jumlah" name="jumlah" type="number" inputMode="numeric" min={1} defaultValue={1} required />
      </Field>
      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? "Menyimpan…" : "Daftar dan bayar"}
      </Button>
    </form>
  );
}
