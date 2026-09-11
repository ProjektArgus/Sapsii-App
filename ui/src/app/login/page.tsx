import { redirect } from "next/navigation";
import { isSupabaseAuthConfigured } from "@/lib/supabase/config";
import { LoginForm } from "./login-form";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (process.env.SAPSII_API_BEARER_TOKEN?.trim()) redirect("/");
  const { next = "/" } = await searchParams;
  if (!isSupabaseAuthConfigured()) {
    return <main className="flex min-h-screen items-center justify-center bg-base-900 p-6 font-mono text-xs text-severity-warning">AUTH_NOT_CONFIGURED</main>;
  }
  return (
    <main className="flex min-h-screen items-center justify-center bg-base-900 p-6">
      <LoginForm next={next} />
    </main>
  );
}
