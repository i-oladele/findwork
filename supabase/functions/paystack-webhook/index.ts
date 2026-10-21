// Receives Paystack's server-to-server events. Paystack sends no Supabase
// JWT, so this function is deployed with JWT verification off (see
// config.toml) and instead rejects anything without a valid Paystack
// signature.
//
//   charge.success      a payment arrived: settle it (top-up, checkout, plan
//                       or renewal), exactly as paystack-verify would.
//   transfer.success    an automatic payout reached the bank.
//   transfer.failed     ... did not; it goes back to finance staff.
//   transfer.reversed   ... came back after it was sent.
//
// Dashboard: Settings -> API Keys & Webhooks -> Webhook URL =
//   https://<project-ref>.supabase.co/functions/v1/paystack-webhook
// Deploy: supabase functions deploy paystack-webhook --no-verify-jwt
import { adminClient, json } from '../_shared/http.ts'
import { isValidSignature, type Authorization } from '../_shared/paystack.ts'
import { cardDetails, transferOutcome } from '../_shared/payments.ts'

type PaystackEvent = {
  event: string
  data: {
    reference?: string
    amount?: number
    currency?: string
    status?: string
    transfer_code?: string
    reason?: string
    gateway_response?: string
    authorization?: Authorization
    customer?: { email?: string }
  }
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
  const data = event.data ?? {}
  const admin = adminClient()

  if (event.event === 'charge.success' && data.reference && typeof data.amount === 'number' && data.currency === 'NGN') {
    const { error } = await admin.rpc('settle_payment', {
      p_reference: data.reference, p_amount_kobo: data.amount, p_authorization: cardDetails(data),
    })
    // A reference we never issued is someone else's integration on the same
    // Paystack account; acknowledge it so Paystack stops retrying.
    if (error && !error.message.includes('unknown reference')) {
      // Anything else (amount mismatch, database down) is returned as a 500
      // so Paystack retries and the failure shows in the function logs.
      console.error('settle_payment failed', data.reference, error.message)
      return json({ error: error.message }, 500)
    }
  }

  const outcome = transferOutcome(event.event)
  if (outcome && data.reference) {
    const { error } = await admin.rpc('settle_withdrawal_transfer', {
      p_reference: data.reference, p_outcome: outcome, p_transfer_code: data.transfer_code ?? null,
      p_reason: outcome === 'success' ? null : data.gateway_response ?? data.status ?? outcome,
    })
    if (error && !error.message.includes('unknown transfer')) {
      console.error('settle_withdrawal_transfer failed', data.reference, error.message)
      return json({ error: error.message }, 500)
    }
  }

  return json({ received: true })
})
