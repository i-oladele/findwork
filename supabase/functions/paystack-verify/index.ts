// Called by the app when Paystack sends the user back. Asks Paystack
// directly whether the payment succeeded and, if so, settles it: credits the
// wallet and, for a checkout or a plan, places the order or changes the plan.
// The webhook does the same; whichever lands first settles, the other is a
// no-op (settle_payment is idempotent on the reference). Having both matters
// because webhooks can be delayed, and cannot reach a local dev machine.
//
// Deploy: supabase functions deploy paystack-verify
import { adminClient, callerFrom, cors, json } from '../_shared/http.ts'
import { verifyTransaction } from '../_shared/paystack.ts'
import { cardDetails } from '../_shared/payments.ts'

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
    .select('status, amount, purpose, outcome')
    .eq('reference', reference)
    .eq('profile_id', user.id)
    .maybeSingle()
  if (!intent) return json({ error: 'not found' }, 404)
  const answer = (status: string, outcome: unknown = intent.outcome) =>
    json({ status, amount: intent.amount, purpose: intent.purpose, outcome: outcome ?? null })
  if (intent.status !== 'pending') return answer(intent.status)

  let tx
  try {
    tx = await verifyTransaction(reference)
  } catch (err) {
    return json({ error: 'paystack_unavailable', message: (err as Error).message }, 502)
  }

  if (tx.status === 'success' && tx.currency === 'NGN') {
    const { data, error } = await admin.rpc('settle_payment', {
      p_reference: reference, p_amount_kobo: tx.amount, p_authorization: cardDetails(tx),
    })
    if (error) return json({ error: error.message }, 500)
    // Usually success; refund_due if the account was deleted before it landed.
    const settled = data as { status: string; outcome: unknown }
    return answer(settled.status, settled.outcome)
  }

  if (tx.status === 'failed' || tx.status === 'abandoned' || tx.status === 'reversed') {
    await admin.rpc('fail_payment', { p_reference: reference, p_reason: tx.gateway_response ?? tx.status })
    return answer('failed', null)
  }

  return answer('pending', null)
})
