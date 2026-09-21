/** Deno runtime. Kept free of imports so it can be unit-tested from Vitest. */
export function requireEnv(name: string): string {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`${name} is not set. Run: supabase secrets set ${name}=...`)
  return value
}
