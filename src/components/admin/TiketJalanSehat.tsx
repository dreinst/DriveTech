"use client";

import { useActionState, useState, useTransition } from "react";

import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import {
  aktifkanTiketAction,
  buatTiketKosongAction,
  tandaiDicetakAction,
  tolakPesananAction,
  verifikasiPesananAction,
} from "@/lib/actions/jalan-sehat";
import { initialActionState, type ActionState } from "@/lib/actions/state";
import { MAKS_TIKET_KOSONG } from "@/lib/domain/jalan-sehat";

function Pesan({ state }: { state: ActionState }) {
  if (state.status === "success") return <p className="text-sm font-medium text-accent" role="status">{state.message}</p>;
  if (state.status === "error") return <p className="text-sm font-medium text-danger" role="alert">{state.message}</p>;
  return null;
}

/** Buat tiket kosong untuk peserta di lokasi yang tidak punya HP. */
export function BuatTiketKosong() {
  const [state, formAction, isPending] = useActionState(buatTiketKosongAction, initialActionState);
  return (
    <form action={formAction} className="space-y-3 border border-line bg-card p-5">
      <h3 className="font-semibold text-ink">Buat tiket kosong</h3>
      <p className="text-sm text-muted">
        Untuk peserta tanpa HP yang membeli tunai di lokasi. Tiket kosong mendapat nomor lanjutan,
        dicetak tanpa nama, dan baru ikut undian setelah ditandai terjual di sebelah.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-32">
          <Field label="Jumlah" htmlFor="tiket-kosong-jumlah">
            <Input id="tiket-kosong-jumlah" name="jumlah" type="number" min={1} max={MAKS_TIKET_KOSONG} defaultValue={50} required />
          </Field>
        </div>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Membuat…" : "Buat tiket"}
        </Button>
      </div>
      <Pesan state={state} />
    </form>
  );
}

/** Tandai tiket kosong sudah dibagikan sehingga nomornya ikut undian. */
export function AktifkanTiket() {
  const [state, formAction, isPending] = useActionState(aktifkanTiketAction, initialActionState);
  return (
    <form action={formAction} className="space-y-3 border border-line bg-card p-5">
      <h3 className="font-semibold text-ink">Tandai tiket kosong terjual</h3>
      <p className="text-sm text-muted">
        Nomor bisa satu, beberapa, atau rentang, misalnya <span className="font-mono">512</span> atau{" "}
        <span className="font-mono">501-520, 530</span>. Nama hanya disimpan kalau satu nomor.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nomor tiket" htmlFor="aktif-nomor">
          <Input id="aktif-nomor" name="nomor" inputMode="numeric" autoComplete="off" required />
        </Field>
        <Field label="Nama (opsional)" htmlFor="aktif-nama">
          <Input id="aktif-nama" name="nama" maxLength={80} autoComplete="off" />
        </Field>
      </div>
      <Button type="submit" disabled={isPending}>
        {isPending ? "Menyimpan…" : "Ikutkan undian"}
      </Button>
      <Pesan state={state} />
    </form>
  );
}

/** Tombol di halaman cetak: cetak lewat browser, lalu tandai tiket di lembar ini sudah dicetak. */
export function TombolCetak({ ids }: { ids: number[] }) {
  const [state, setState] = useState<ActionState>(initialActionState);
  const [isPending, startTransition] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-3 print:hidden">
      <Button type="button" onClick={() => window.print()} disabled={ids.length === 0}>
        Cetak atau simpan PDF
      </Button>
      <Button
        type="button"
        variant="secondary"
        disabled={isPending || ids.length === 0}
        onClick={() => startTransition(async () => setState(await tandaiDicetakAction(ids)))}
      >
        {isPending ? "Menyimpan…" : "Tandai sudah dicetak"}
      </Button>
      <Pesan state={state} />
    </div>
  );
}

/** Tombol Lunas / Tolak bukti untuk satu pesanan di tabel admin. */
export function AksiPesanan({ id, status }: { id: number; status: string }) {
  const [state, setState] = useState<ActionState>(initialActionState);
  const [isPending, startTransition] = useTransition();
  const [tolak, setTolak] = useState(false);
  const [alasan, setAlasan] = useState("Nominal belum masuk di GoPay Merchant");
  if (status === "lunas") return null;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={isPending}
          onClick={() => startTransition(async () => setState(await verifikasiPesananAction(id)))}
        >
          Lunas
        </Button>
        {status === "dicek" ? (
          <Button type="button" size="sm" variant="secondary" disabled={isPending} onClick={() => setTolak((x) => !x)}>
            Tolak bukti
          </Button>
        ) : null}
      </div>
      {tolak ? (
        <div className="flex flex-wrap gap-2">
          <Input value={alasan} onChange={(e) => setAlasan(e.target.value)} maxLength={200} aria-label="Alasan penolakan" />
          <Button
            type="button"
            size="sm"
            variant="danger"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                setState(await tolakPesananAction(id, alasan));
                setTolak(false);
              })
            }
          >
            Kirim penolakan
          </Button>
        </div>
      ) : null}
      <Pesan state={state} />
    </div>
  );
}
