// Called by the app when Paystack sends the user back. Asks Paystack
// directly whether the payment succeeded and, if so, credits the wallet.
// The webhook does the same; whichever lands first credits, the other is a
// no-op (credit_topup is idempotent on the reference). Having both matters
// because webhooks can be delayed, and cannot reach a local dev machine.
//
// Deploy: supabase functions deploy paystack-verify
import { adminClient, callerFrom, cors, json } from '../_shared/http.ts'
import { verifyTransaction } from '../_shared/paystack.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const user = await callerFrom(req)
  if (!user) return json({ error: 'invalid session' }, 401)

  const body = (await req.json().catch(() => null)) as { reference?: unknown } | null
  const reference = typeof body?.reference === 'string' ? body.reference : ''
  if (!reference) return json({ error: 'reference required' }, 400)

  const admin = adminClient()

  // Only the person who started a payment can settle it from the app.
  const { data: intent } = await admin
    .from('payment_intents')
    .select('status, amount')
    .eq('reference', reference)
    .eq('profile_id', user.id)
    .maybeSingle()
  if (!intent) return json({ error: 'not found' }, 404)
  if (intent.status !== 'pending') return json({ status: intent.status, amount: intent.amount })

  let tx
  try {
    tx = await verifyTransaction(reference)
  } catch (err) {
    return json({ error: 'paystack_unavailable', message: (err as Error).message }, 502)
  }

  if (tx.status === 'success' && tx.currency === 'NGN') {
    const { error } = await admin.rpc('credit_topup', { p_reference: reference, p_amount_kobo: tx.amount })
    if (error) return json({ error: error.message }, 500)
    return json({ status: 'success', amount: intent.amount })
  }

  if (tx.status === 'failed' || tx.status === 'abandoned' || tx.status === 'reversed') {
    await admin.rpc('fail_topup', { p_reference: reference })
    return json({ status: 'failed', amount: intent.amount })
  }

  return json({ status: 'pending', amount: intent.amount })
})
