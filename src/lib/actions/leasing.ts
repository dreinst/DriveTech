"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { submitLeasingApplication } from "@/lib/services/leasing";
import { submitLeasingSchema, zodFieldErrors } from "@/lib/validation/schemas";
import { errorState, type ActionState } from "./state";

/** Terima (prevState, formData) dari useActionState maupun (formData) dari <form action>. */
function ambilFormData(prevState: ActionState, formData: FormData): FormData {
  if (formData instanceof FormData) return formData;
  const kandidat = prevState as unknown;
  if (kandidat instanceof FormData) return kandidat;
  return new FormData();
}

function teks(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

/** Form pengajuan pembiayaan di /beli/[transactionId]/leasing. */
export async function submitLeasingAction(
  prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const form = ambilFormData(prevState, formData);

  const parsed = submitLeasingSchema.safeParse({
    purchaseTransactionId: teks(form, "purchaseTransactionId"),
    leasingPartnerId: teks(form, "leasingPartnerId"),
    dpAmount: teks(form, "dpAmount"),
    tenorBulan: teks(form, "tenorBulan"),
    notes: teks(form, "notes"),
  });

  if (!parsed.success) {
    return errorState("Periksa kembali isian pengajuan.", zodFieldErrors(parsed.error));
  }

  const result = await submitLeasingApplication(parsed.data);
  if (!result.ok) return errorState(result.error);

  const purchaseId = parsed.data.purchaseTransactionId;
  revalidatePath(`/beli/${purchaseId}/leasing`);
  revalidatePath(`/beli/${purchaseId}/status`);
  revalidatePath("/admin/leasing");
  revalidatePath("/admin");

  // redirect() melempar NEXT_REDIRECT — jangan dibungkus try/catch.
  redirect(`/beli/${purchaseId}/status`);

  // Tidak pernah tercapai: redirect() melempar NEXT_REDIRECT.
  return { status: "success" };
}
