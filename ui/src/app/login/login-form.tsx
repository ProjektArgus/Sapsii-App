"use client";

import { Eye, EyeOff } from "lucide-react";
import Image from "next/image";
import { useActionState, useState } from "react";
import { login, type LoginState } from "./actions";

const initialState: LoginState = { error: null };

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(login, initialState);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={action} className="w-full max-w-sm border border-base-700 bg-base-800 p-6 shadow-2xl">
      <input type="hidden" name="next" value={next} />
      <div className="mb-6 border-b border-base-700 pb-4">
        <Image src="/argus-logo.svg" width={360} height={84} alt="Argus urban sentinel network" priority className="h-auto w-full" />
        <h1 className="mt-3 font-sans text-sm font-bold tracking-widest text-base-100">SAPSII_ACCESS</h1>
      </div>
      <label className="mb-4 block font-mono text-[10px] tracking-wider text-base-400">
        EMAIL
        <input name="email" type="email" autoComplete="email" required className="mt-2 w-full border border-base-600 bg-base-900 px-3 py-2 text-sm text-base-100 outline-none focus:border-accent" />
      </label>
      <label className="mb-5 block font-mono text-[10px] tracking-wider text-base-400">
        PASSWORD
        <span className="relative mt-2 block">
          <input name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required className="w-full border border-base-600 bg-base-900 py-2 pl-3 pr-10 text-sm text-base-100 outline-none focus:border-accent" />
          <button
            type="button"
            onClick={() => setShowPassword((visible) => !visible)}
            className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-base-500 hover:text-accent"
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </span>
      </label>
      {state.error && <div className="mb-4 border border-severity-critical/50 p-2 font-mono text-[10px] text-severity-critical">{state.error}</div>}
      <button type="submit" disabled={pending} className="w-full border border-accent bg-accent/10 px-4 py-2 font-mono text-xs font-bold tracking-widest text-accent hover:bg-accent/20 disabled:opacity-50">
        {pending ? "AUTHENTICATING..." : "SIGN_IN"}
      </button>
    </form>
  );
}
