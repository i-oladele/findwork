// Starts a Paystack payment: a wallet top-up, an order paid by card at
// checkout, or a plan paid by card. { action: 'status' } answers whether card
// payments are switched on, so the app can offer them only when they are.
// Records a pending payment_intent, then
// asks Paystack for a checkout URL the app sends the user to. Nothing is
// credited, ordered or subscribed here — that happens in settle_payment once
// paystack-verify or paystack-webhook hears from Paystack that the money
// arrived.
//
// Secrets: PAYSTACK_SECRET_KEY, APP_URL (where Paystack returns the user).
// Deploy:  supabase functions deploy paystack-initialize
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { adminClient, callerFrom, cors, json, requireEnv } from '../_shared/http.ts'
import { initializeTransaction } from '../_shared/paystack.ts'
import { parseStart } from '../_shared/payments.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const user = await callerFrom(req)
  if (!user) return json({ error: 'invalid session' }, 401)

  const body = await req.json().catch(() => null)
  // Checked before anything is recorded, and never shown as a setup message.
  const configured = Boolean(Deno.env.get('PAYSTACK_SECRET_KEY') && Deno.env.get('APP_URL'))
  if ((body as { action?: unknown } | null)?.action === 'status') return json({ configured })
  if (!configured) {
    return json({ error: 'payments_not_configured', message: 'Card payments are not switched on yet. Pay from your wallet, or try again later.' }, 503)
  }

  const request = parseStart(body)
  if ('error' in request) return json(request, 400)

  const reference = `fw_${crypto.randomUUID()}`
  const admin = adminClient()
  const email = user.email || `${user.id}@users.findwork.africa`

  // A deleted account whose sign-in removal failed can still hold a session.
  // Money paid in could never be withdrawn, so take none.
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('deleted_at, suspended_at')
    .eq('id', user.id)
    .maybeSingle()
  if (profileError) return json({ error: profileError.message }, 500)
  if (!profile || profile.deleted_at) {
    return json({ error: 'account_closed', message: 'This account has been deleted.' }, 403)
  }
  if (profile.suspended_at && request.purpose !== 'topup') {
    return json({ error: 'account_suspended' }, 403)
  }

  let amount: number
  let payload: Record<string, unknown> = {}
  let channels: string[] | undefined

  if (request.purpose === 'topup') {
    amount = request.amount
  } else if (request.purpose === 'checkout') {
    // Priced as the caller by the database's own quote, so what Paystack
    // charges is exactly what checkout showed and place_order will charge.
    const caller = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_ANON_KEY'), {
      global: { headers: { Authorization: req.headers.get('Authorization')! } },
    })
    const { data: quote, error } = await caller.rpc('checkout_quote', {
      p_items: request.items, p_delivery_speed: request.delivery_speed, p_coupon_code: request.coupon_code,
    })
    if (error) return json({ error: error.message }, 400)
    const q = quote as { total: number; coupon: { error: string | null } | null }
    if (q.coupon?.error) return json({ error: q.coupon.error }, 400)
    if (q.total !== request.expected_total) return json({ error: 'checkout_total_changed' }, 409)
    amount = q.total
    payload = {
      items: request.items, delivery_speed: request.delivery_speed, address: request.address,
      phone: request.phone, coupon_code: request.coupon_code,
    }
  } else {
    const [{ data: plan }, { data: current }] = await Promise.all([
      admin.from('subscription_plans').select('id, price').eq('id', request.plan).maybeSingle(),
      admin.from('subscriptions').select('plan').eq('profile_id', user.id).maybeSingle(),
    ])
    if (!plan || plan.price <= 0) return json({ error: 'plan not found' }, 400)
    if (current?.plan === plan.id) return json({ error: 'already_on_plan', message: 'You are already on this plan.' }, 400)
    amount = plan.price
    payload = { plan: plan.id, save_card: request.save_card, email }
    // A card kept for renewals has to be a card, not a bank transfer.
    if (request.save_card) channels = ['card']
  }

  const { error: insertError } = await admin
    .from('payment_intents')
    .insert({ profile_id: user.id, reference, amount, purpose: request.purpose, payload })
  if (insertError) return json({ error: insertError.message }, 500)

  try {
    const checkout = await initializeTransaction({
      // Paystack requires an email; phone-only accounts get a stable
      // placeholder so receipts still have somewhere to go.
      email,
      amountKobo: amount * 100,
      reference,
      callbackUrl: `${requireEnv('APP_URL')}/wallet/topup`,
      channels,
    })
    return json({ reference, amount, authorization_url: checkout.authorization_url })
  } catch (err) {
    await admin.rpc('fail_payment', { p_reference: reference, p_reason: 'Paystack unavailable' })
    return json({ error: 'paystack_unavailable', message: (err as Error).message }, 502)
  }
})
