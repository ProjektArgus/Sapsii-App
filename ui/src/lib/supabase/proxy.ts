import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAuthConfig, isSupabaseAuthConfigured } from "./config";

const isPublicPath = (pathname: string) => pathname === "/login" || pathname === "/favicon.ico";

export const updateSupabaseSession = async (request: NextRequest): Promise<NextResponse> => {
  if (process.env.SAPSII_API_BEARER_TOKEN?.trim() || !isSupabaseAuthConfigured()) {
    return NextResponse.next({ request });
  }

  const { url, publishableKey } = getSupabaseAuthConfig();
  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
      },
    },
  });

  const { data, error } = await supabase.auth.getClaims();
  const authenticated = !error && Boolean(data?.claims?.sub);
  const pathname = request.nextUrl.pathname;

  if (!authenticated && !isPublicPath(pathname)) {
    if (pathname.startsWith("/bff/")) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }

  if (authenticated && pathname === "/login") {
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = "/";
    homeUrl.search = "";
    return NextResponse.redirect(homeUrl);
  }

  return response;
};
