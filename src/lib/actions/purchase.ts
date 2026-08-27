"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createPurchase } from "@/lib/services/purchase";
import { createPurchaseSchema, zodFieldErrors } from "@/lib/validation/schemas";
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

/**
 * Form pembeli unit di /beli/[slotId].
 * Metode "credit" diarahkan ke halaman pengajuan leasing, selain itu ke halaman status.
 */
export async function createPurchaseAction(
  prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const form = ambilFormData(prevState, formData);

  const parsed = createPurchaseSchema.safeParse({
    slotId: teks(form, "slotId"),
    buyerName: teks(form, "buyerName"),
    buyerPhone: teks(form, "buyerPhone"),
    paymentMethod: teks(form, "paymentMethod"),
    unitDescription: teks(form, "unitDescription"),
    unitPrice: teks(form, "unitPrice"),
    notes: teks(form, "notes"),
  });

  if (!parsed.success) {
    return errorState("Periksa kembali isian formulir.", zodFieldErrors(parsed.error));
  }

  const result = await createPurchase(parsed.data);
  if (!result.ok) return errorState(result.error);

  revalidatePath(`/beli/${parsed.data.slotId}`);
  revalidatePath("/admin/leasing");

  const tujuan =
    parsed.data.paymentMethod === "credit"
      ? `/beli/${result.data.purchaseId}/leasing`
      : `/beli/${result.data.purchaseId}/status`;

  // redirect() melempar NEXT_REDIRECT — jangan dibungkus try/catch.
  redirect(tujuan);

  // Tidak pernah tercapai: redirect() melempar NEXT_REDIRECT.
  return { status: "success" };
}
