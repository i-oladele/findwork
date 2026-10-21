// Sends one withdrawal through Paystack Transfers. Called by the database
// (private.request_payout) through pg_net once a withdrawal to a confirmed
// account is committed, so it is deployed with JWT verification off (see
// config.toml) and refuses anything without the shared secret.
//
// Paystack's answer is recorded at once; the final word arrives later as a
// transfer.success, transfer.failed or transfer.reversed webhook. A refused
// transfer goes back to finance staff with Paystack's reason. If Paystack
// cannot be reached at all, the withdrawal stays queued and finance can take
// it back after an hour, once they have checked the Paystack dashboard.
//
// Paystack setup: Transfers enabled on the account, OTP for transfers turned
// off (Settings -> Preferences), and money in the Paystack balance.
// Secrets: PAYSTACK_SECRET_KEY, PAYSTACK_HOOK_SECRET
// Deploy:  supabase functions deploy paystack-payout --no-verify-jwt
import { adminClient, json } from '../_shared/http.ts'
import { initiateTransfer } from '../_shared/paystack.ts'
import { hookSecretMatches, payoutStep } from '../_shared/payments.ts'

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)
  if (!hookSecretMatches(req.headers.get('x-paystack-hook-secret'), Deno.env.get('PAYSTACK_HOOK_SECRET'))) {
    return json({ error: 'forbidden' }, 403)
  }
  const { withdrawal_id } = (await req.json().catch(() => ({}))) as { withdrawal_id?: unknown }
  if (typeof withdrawal_id !== 'string') return json({ error: 'withdrawal_id required' }, 400)

  const admin = adminClient()
  const { data: w, error } = await admin
    .from('withdrawals')
    .select('id, amount, status, recipient_code, transfer_reference, transfer_status')
    .eq('id', withdrawal_id)
    .maybeSingle()
  if (error) return json({ error: error.message }, 500)
  if (!w || w.status !== 'requested' || w.transfer_status !== 'queued' || !w.recipient_code || !w.transfer_reference) {
    return json({ skipped: true })
  }

  const settle = (outcome: string, transferCode: string | null, reason: string | null) =>
    admin.rpc('settle_withdrawal_transfer', { p_reference: w.transfer_reference, p_outcome: outcome, p_transfer_code: transferCode, p_reason: reason })

  let transfer
  try {
    transfer = await initiateTransfer({
      amountKobo: w.amount * 100, recipientCode: w.recipient_code, reference: w.transfer_reference, reason: 'FindWork withdrawal',
    })
  } catch (err) {
    // fetch itself failing means nobody knows whether Paystack received it.
    if (err instanceof TypeError) {
      console.error('transfer request did not reach Paystack; left queued', w.id, err.message)
      return json({ pending: true }, 202)
    }
    await settle('failed', null, (err as Error).message.replace(/^Paystack \/transfer: /, ''))
    return json({ status: 'failed' })
  }

  const step = payoutStep(transfer.status)
  const { error: settleError } = await settle(step.outcome, transfer.transfer_code ?? null, step.reason)
  if (settleError) return json({ error: settleError.message }, 500)
  return json({ status: transfer.status })
})
