// Charges a saved card for one plan renewal. Called by the database
// (private.renew_subscriptions) through pg_net, not by a user, so it is
// deployed with JWT verification off (see config.toml) and refuses anything
// without the shared secret.
//
// A clear decline is reported at once, and the plan is renewed from the
// wallet instead. If Paystack cannot be reached, the charge is left pending:
// the webhook settles it if it went through, and otherwise the next daily
// renewal run falls back to the wallet after a day. Nothing is charged twice.
//
// Secrets: PAYSTACK_SECRET_KEY, PAYSTACK_HOOK_SECRET
// Deploy:  supabase functions deploy paystack-charge --no-verify-jwt
// Then the paystack_charge_url and paystack_hook_secret rows in
// private.settings (see the paystack_direct migration).
import { adminClient, json } from '../_shared/http.ts'
import { chargeAuthorization } from '../_shared/paystack.ts'
import { chargeStep, hookSecretMatches } from '../_shared/payments.ts'

type Charge = { reference: string; amount: number; status: string; authorization_code: string; email: string }

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)
  if (!hookSecretMatches(req.headers.get('x-paystack-hook-secret'), Deno.env.get('PAYSTACK_HOOK_SECRET'))) {
    return json({ error: 'forbidden' }, 403)
  }
  const { reference } = (await req.json().catch(() => ({}))) as { reference?: unknown }
  if (typeof reference !== 'string') return json({ error: 'reference required' }, 400)

  const admin = adminClient()
  const { data, error } = await admin.rpc('renewal_charge', { p_reference: reference })
  if (error) return json({ error: error.message }, 500)
  const charge = data as Charge | null
  if (!charge || charge.status !== 'pending') return json({ skipped: true })

  let tx
  try {
    tx = await chargeAuthorization({
      authorizationCode: charge.authorization_code, email: charge.email, amountKobo: charge.amount * 100, reference,
    })
  } catch (err) {
    console.error('charge_authorization failed; left pending', reference, (err as Error).message)
    return json({ pending: true }, 202)
  }

  const step = chargeStep(tx.status)
  if (step === 'settle') {
    const { error: settleError } = await admin.rpc('settle_payment', { p_reference: reference, p_amount_kobo: tx.amount, p_authorization: null })
    if (settleError) return json({ error: settleError.message }, 500)
  } else if (step === 'fail') {
    await admin.rpc('fail_payment', { p_reference: reference, p_reason: tx.gateway_response ?? 'Declined' })
  }
  return json({ status: tx.status })
})
