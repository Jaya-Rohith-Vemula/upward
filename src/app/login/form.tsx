"use client";
import { useActionState } from "react";
import { login } from "@/app/actions";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(login, null);
  return (
    <form action={action} className="mt-8 space-y-4">
      <input type="hidden" name="next" value={next} />
      <input name="password" type="password" autoFocus autoComplete="current-password" required placeholder="Passphrase" aria-label="Passphrase" className="keep-size field text-lg" />
      {state?.error && <p className="text-sm text-warn" role="alert">{state.error}</p>}
      <button className="btn btn-primary" disabled={pending}>{pending ? "Checking…" : "Unlock"}</button>
    </form>
  );
}
