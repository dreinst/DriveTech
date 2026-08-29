"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Field, Input } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { adminLoginAction } from "@/lib/actions/admin";
import { initialActionState } from "@/lib/actions/state";

export type LoginFormProps = {
  /** Tujuan setelah login berhasil (harus rute internal). Default "/admin". */
  next?: string;
};

/** Form masuk admin: username + kata sandi (username dipetakan ke email internal). */
export function LoginForm({ next = "/admin" }: LoginFormProps) {
  const [state, formAction] = useActionState(adminLoginAction, initialActionState);
  const fieldErrors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <input type="hidden" name="next" value={next} />

      {state.status === "error" && state.message ? (
        <Alert tone="error" title="Gagal masuk">
          {state.message}
        </Alert>
      ) : null}

      <Field label="Username" htmlFor="username" required error={fieldErrors.username}>
        <Input
          id="username"
          name="username"
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="Administrator"
          required
          aria-invalid={fieldErrors.username ? true : undefined}
        />
      </Field>

      <Field
        label="Kata Sandi"
        htmlFor="password"
        required
        error={fieldErrors.password}
        hint="Minimal 6 karakter."
      >
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={fieldErrors.password ? true : undefined}
        />
      </Field>

      <SubmitButton pendingText="Memeriksa…" className="w-full">
        Masuk
      </SubmitButton>
    </form>
  );
}
