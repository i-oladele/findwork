// Receives Paystack's server-to-server events. Paystack sends no Supabase
// JWT, so this function is deployed with JWT verification off (see
// config.toml) and instead rejects anything without a valid Paystack
// signature.
//
// Dashboard: Settings -> API Keys & Webhooks -> Webhook URL =
//   https://<project-ref>.supabase.co/functions/v1/paystack-webhook
// Deploy: supabase functions deploy paystack-webhook --no-verify-jwt
import { adminClient, json } from '../_shared/http.ts'
import { isValidSignature } from '../_shared/paystack.ts'

type PaystackEvent = {
  event: string
  data: { reference?: string; amount?: number; currency?: string; status?: string }
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  // The signature is over the exact bytes sent, so read the raw text before
  // parsing it.
  const raw = await req.text()
  if (!(await isValidSignature(raw, req.headers.get('x-paystack-signature')))) {
    return json({ error: 'invalid signature' }, 401)
  }

  const event = JSON.parse(raw) as PaystackEvent
  const { reference, amount, currency } = event.data ?? {}
  const admin = adminClient()

  if (event.event === 'charge.success' && reference && typeof amount === 'number' && currency === 'NGN') {
    const { error } = await admin.rpc('credit_topup', { p_reference: reference, p_amount_kobo: amount })
    // A reference we never issued is someone else's integration on the same
    // Paystack account; acknowledge it so Paystack stops retrying.
    if (error && !error.message.includes('unknown reference')) {
      // Anything else (amount mismatch, database down) is returned as a 500
      // so Paystack retries and the failure shows in the function logs.
      console.error('credit_topup failed', reference, error.message)
      return json({ error: error.message }, 500)
    }
  }

  return json({ received: true })
})
