const required = (name: "SUPABASE_URL" | "SUPABASE_PUBLISHABLE_KEY"): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required when Supabase authentication is enabled`);
  return value;
};

export const isSupabaseAuthConfigured = (): boolean =>
  Boolean(process.env.SUPABASE_URL?.trim() && process.env.SUPABASE_PUBLISHABLE_KEY?.trim());

export const getSupabaseAuthConfig = () => ({
  url: required("SUPABASE_URL").replace(/\/$/, ""),
  publishableKey: required("SUPABASE_PUBLISHABLE_KEY"),
});
