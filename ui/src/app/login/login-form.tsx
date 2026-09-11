"use client";

import { useActionState } from "react";
import { login, type LoginState } from "./actions";

const initialState: LoginState = { error: null };

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(login, initialState);

  return (
    <form action={action} className="w-full max-w-sm border border-base-700 bg-base-800 p-6 shadow-2xl">
      <input type="hidden" name="next" value={next} />
      <div className="mb-6 border-b border-base-700 pb-4">
        <div className="font-mono text-[10px] tracking-[0.3em] text-accent">PROJEKT_ARGUS</div>
        <h1 className="mt-2 font-sans text-xl font-bold tracking-widest text-base-100">SAPSII_ACCESS</h1>
      </div>
      <label className="mb-4 block font-mono text-[10px] tracking-wider text-base-400">
        EMAIL
        <input name="email" type="email" autoComplete="email" required className="mt-2 w-full border border-base-600 bg-base-900 px-3 py-2 text-sm text-base-100 outline-none focus:border-accent" />
      </label>
      <label className="mb-5 block font-mono text-[10px] tracking-wider text-base-400">
        PASSWORD
        <input name="password" type="password" autoComplete="current-password" required className="mt-2 w-full border border-base-600 bg-base-900 px-3 py-2 text-sm text-base-100 outline-none focus:border-accent" />
      </label>
      {state.error && <div className="mb-4 border border-severity-critical/50 p-2 font-mono text-[10px] text-severity-critical">{state.error}</div>}
      <button type="submit" disabled={pending} className="w-full border border-accent bg-accent/10 px-4 py-2 font-mono text-xs font-bold tracking-widest text-accent hover:bg-accent/20 disabled:opacity-50">
        {pending ? "AUTHENTICATING..." : "SIGN_IN"}
      </button>
    </form>
  );
}
