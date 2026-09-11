import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseAuthConfig } from "./config";

export const createSupabaseServerClient = async () => {
  const { url, publishableKey } = getSupabaseAuthConfig();
  const cookieStore = await cookies();

  return createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Server Components cannot write cookies. proxy.ts refreshes them.
        }
      },
    },
  });
};

export const getDashboardAccessToken = async (): Promise<string | null> => {
  const staticToken = process.env.SAPSII_API_BEARER_TOKEN?.trim();
  if (staticToken) return staticToken;

  const supabase = await createSupabaseServerClient();
  const { error: claimsError } = await supabase.auth.getClaims();
  if (claimsError) return null;

  const { data, error } = await supabase.auth.getSession();
  return error ? null : (data.session?.access_token ?? null);
};
