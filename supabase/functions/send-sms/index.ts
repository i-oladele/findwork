// Supabase Auth's Send SMS hook: Supabase makes the sign-up and sign-in
// codes, and calls this to deliver each one, through Termii, a Nigerian
// SMS provider that reaches numbers on Do-Not-Disturb.
//
// Supabase calls it with a Standard Webhooks signature, not a user's JWT, so
// it is deployed with JWT verification off (see config.toml) and refuses
// anything not signed with the hook's secret.
//
// Secrets:  SEND_SMS_HOOK_SECRET  (from Authentication → Hooks, "v1,whsec_…")
//           TERMII_API_KEY, TERMII_BASE_URL  (Termii dashboard)
//           TERMII_SENDER_ID  (approved sender ID; defaults to FindWork)
//           SMS_COUNTRIES  (calling codes to text, comma separated; defaults to 234)
// Deploy:   supabase functions deploy send-sms --no-verify-jwt
import { json } from '../_shared/cors.ts'
import { isValidWebhook } from '../_shared/webhook.ts'
import { deliverCode, hookError, type HookPayload } from './deliverCode.ts'

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const secret = Deno.env.get('SEND_SMS_HOOK_SECRET')
  const apiKey = Deno.env.get('TERMII_API_KEY')
  const baseUrl = Deno.env.get('TERMII_BASE_URL')
  if (!secret || !apiKey || !baseUrl) {
    console.error('send-sms is not configured: set SEND_SMS_HOOK_SECRET, TERMII_API_KEY and TERMII_BASE_URL')
    return hookError(500, 'sms_send_failed')
  }

  // The signature is over the exact bytes sent, so read the raw text first.
  const body = await req.text()
  if (!(await isValidWebhook(body, req.headers, secret))) return hookError(401, 'invalid signature')

  let payload: HookPayload
  try {
    payload = JSON.parse(body) as HookPayload
  } catch {
    return hookError(400, 'invalid hook payload')
  }

  return deliverCode(payload, {
    apiKey,
    baseUrl,
    senderId: Deno.env.get('TERMII_SENDER_ID') || 'FindWork',
    countries: (Deno.env.get('SMS_COUNTRIES') || '234')
      .split(',')
      .map((code) => code.replace(/\D/g, ''))
      .filter(Boolean),
  })
})
