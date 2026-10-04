// Turns two-step sign-in off for the caller when they present a recovery
// code. Removing an authenticator without passing it needs the service-role
// key, which must never reach the client, so it happens here.
//
// Deploy with:  supabase functions deploy mfa-recover
//
// Deno runtime. Not part of the Vite build (tsconfig.app.json covers src/ only).
import { adminClient, callerFrom, cors, json } from '../_shared/http.ts'
import { recoverMfa } from './recoverMfa.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  // The caller has signed in with their password but not the second step.
  const user = await callerFrom(req)
  if (!user) return json({ error: 'invalid session' }, 401)
  const body = await req.json().catch(() => ({}))

  const admin = adminClient()
  return recoverMfa(user.id, (body as { code?: unknown }).code, {
    consume: (id, code) => admin.rpc('consume_mfa_recovery_code', { p_profile_id: id, p_code: code }),
    listFactors: (id) => admin.auth.admin.mfa.listFactors({ userId: id }),
    deleteFactor: (id, factorId) => admin.auth.admin.mfa.deleteFactor({ userId: id, id: factorId }),
  })
})
