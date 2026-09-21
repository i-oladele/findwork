// Starts a wallet top-up: records a pending payment_intent, then asks
// Paystack for a checkout URL the app sends the user to. Nothing is credited
// here — that happens in paystack-verify or paystack-webhook once Paystack
// confirms the money arrived.
//
// Secrets: PAYSTACK_SECRET_KEY, APP_URL (where Paystack returns the user).
// Deploy:  supabase functions deploy paystack-initialize
import { adminClient, callerFrom, cors, json, requireEnv } from '../_shared/http.ts'
import { initializeTransaction } from '../_shared/paystack.ts'

const MIN_NAIRA = 100
const MAX_NAIRA = 1_000_000

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const user = await callerFrom(req)
  if (!user) return json({ error: 'invalid session' }, 401)

  const body = (await req.json().catch(() => null)) as { amount?: unknown } | null
  const amount = Number(body?.amount)
  if (!Number.isInteger(amount) || amount < MIN_NAIRA || amount > MAX_NAIRA) {
    return json(
      { error: 'invalid_amount', message: `Enter an amount between ₦${MIN_NAIRA} and ₦${MAX_NAIRA.toLocaleString()}.` },
      400,
    )
  }

  const reference = `fw_${crypto.randomUUID()}`
  const admin = adminClient()

  const { error: insertError } = await admin
    .from('payment_intents')
    .insert({ profile_id: user.id, reference, amount })
  if (insertError) return json({ error: insertError.message }, 500)

  try {
    const checkout = await initializeTransaction({
      // Paystack requires an email; phone-only accounts get a stable
      // placeholder so receipts still have somewhere to go.
      email: user.email || `${user.id}@users.findwork.africa`,
      amountKobo: amount * 100,
      reference,
      callbackUrl: `${requireEnv('APP_URL')}/wallet/topup`,
    })
    return json({ reference, authorization_url: checkout.authorization_url })
  } catch (err) {
    await admin.rpc('fail_topup', { p_reference: reference })
    return json({ error: 'paystack_unavailable', message: (err as Error).message }, 502)
  }
})
