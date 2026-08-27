/**
 * Kontrak state untuk semua Server Action.
 *
 * File ini SENGAJA bukan "use server": modul "use server" hanya boleh
 * mengekspor fungsi async, sedangkan tipe & konstanta di sini dipakai juga oleh
 * komponen client lewat useActionState.
 */

export type ActionState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Record<string, string>;
};

export const initialActionState: ActionState = { status: "idle" };

/** Pintasan membuat state gagal. */
export function errorState(message: string, fieldErrors?: Record<string, string>): ActionState {
  return { status: "error", message, fieldErrors };
}

/** Pintasan membuat state sukses (dipakai action yang tidak melakukan redirect). */
export function successState(message?: string): ActionState {
  return { status: "success", message };
}
