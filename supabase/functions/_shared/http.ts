// Shared by the Edge Functions. Deno runtime; not part of the Vite build.
import { createClient, type SupabaseClient, type User } from 'jsr:@supabase/supabase-js@2'
import { requireEnv } from './env.ts'

export { requireEnv }
export { cors, json } from './cors.ts'

/** Service-role client. Bypasses RLS — only ever used server-side. */
export function adminClient(): SupabaseClient {
  return createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'))
}

/** The caller, identified from their own JWT — never from anything in the body. */
export async function callerFrom(req: Request): Promise<User | null> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return null
  const client = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: authHeader } },
  })
  const { data, error } = await client.auth.getUser()
  if (error || !data.user) return null
  return data.user
}
