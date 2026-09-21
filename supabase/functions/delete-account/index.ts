// Deletes the calling user's account. Apple requires an in-app deletion path
// for any app with account creation, and deleting an auth user needs the
// service-role key — which must never reach the client — so it happens here.
//
// Deploy with:  supabase functions deploy delete-account
//
// Deno runtime. Not part of the Vite build (tsconfig.app.json covers src/ only).
import { createClient } from 'jsr:@supabase/supabase-js@2'

Deno.serve(async (req: Request) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method not allowed' }), {
      status: 405,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'missing authorization' }), {
      status: 401,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  // Identify the caller from their own JWT — never trust an id in the body.
  const callerClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )

  const { data: userData, error: userError } = await callerClient.auth.getUser()
  if (userError || !userData.user) {
    return new Response(JSON.stringify({ error: 'invalid session' }), {
      status: 401,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  const userId = userData.user.id

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Money first: refuse while funds are in play, otherwise deleting the
  // profile would strand escrow a counterparty is still owed.
  const { data: wallet } = await admin.rpc('wallet_summary', { p_profile_id: userId }).single()
  const escrowHeld = (wallet as { escrow_held?: number } | null)?.escrow_held ?? 0
  const balance = (wallet as { balance?: number } | null)?.balance ?? 0

  if (escrowHeld > 0) {
    return new Response(
      JSON.stringify({
        error: 'escrow_outstanding',
        message: 'You have money held in escrow. Complete or resolve those jobs first.',
      }),
      { status: 409, headers: { ...cors, 'Content-Type': 'application/json' } },
    )
  }

  if (balance > 0) {
    return new Response(
      JSON.stringify({
        error: 'balance_outstanding',
        message: 'Withdraw your remaining balance before deleting your account.',
      }),
      { status: 409, headers: { ...cors, 'Content-Type': 'application/json' } },
    )
  }

  // Anonymise before removing the auth user. A hard delete of the profile
  // would violate the foreign keys held by bookings, orders and the wallet
  // ledger — and those records must be retained for AML purposes anyway.
  const { error: anonError } = await admin.rpc('anonymise_profile', { p_profile_id: userId })
  if (anonError) {
    return new Response(JSON.stringify({ error: anonError.message }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(userId)
  if (deleteError) {
    return new Response(JSON.stringify({ error: deleteError.message }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
})
