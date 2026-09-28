// Deletes the calling user's account. Apple requires an in-app deletion path
// for any app with account creation, and deleting an auth user needs the
// service-role key — which must never reach the client — so it happens here.
//
// Anonymise before removing the auth user. A hard delete of the profile would
// violate the foreign keys held by bookings, orders and the wallet ledger —
// and those records must be retained for AML purposes anyway. anonymise_profile
// refuses while money or an open obligation remains; see deleteAccount.ts.
//
// Deploy with:  supabase functions deploy delete-account
//
// Deno runtime. Not part of the Vite build (tsconfig.app.json covers src/ only).
import { adminClient, callerFrom, cors, json } from '../_shared/http.ts'
import { deleteAccount } from './deleteAccount.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  // Identify the caller from their own JWT — never trust an id in the body.
  const user = await callerFrom(req)
  if (!user) return json({ error: 'invalid session' }, 401)

  const admin = adminClient()
  return deleteAccount(user.id, {
    anonymise: (id) => admin.rpc('anonymise_profile', { p_profile_id: id }),
    deleteUser: (id) => admin.auth.admin.deleteUser(id),
  })
})
