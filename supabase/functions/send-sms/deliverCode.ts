// What send-sms does with a verified hook call, apart from Deno so it can be
// unit-tested from Vitest.
import { json } from '../_shared/cors.ts'

export type TermiiConfig = {
  apiKey: string
  /** Shown in the Termii dashboard, e.g. https://v3.api.termii.com */
  baseUrl: string
  /** The approved sender ID the text comes from, e.g. FindWork. */
  senderId: string
  /** Calling codes that may be texted, e.g. ['234']. */
  countries: string[]
}

/** What Supabase Auth sends: the user (phone in E.164) and the code it made. */
export type HookPayload = { user?: { phone?: string }; sms?: { otp?: string } }

/**
 * Word for word the template registered with Termii for the DND route. The
 * expiry must match SMS OTP expiry in Supabase (Authentication → Sign In /
 * Providers → Phone), which is set to 600 seconds.
 */
export function smsText(otp: string): string {
  return `Your FindWork verification code is ${otp}. This code expires in 10 minutes. Do not share with anyone.`
}

/**
 * Texts the code through Termii's DND route: the one that reaches every
 * Nigerian number, including those on Do-Not-Disturb, at any hour. The
 * generic route is barred for DND numbers and, on MTN, overnight.
 *
 * Errors use Supabase's hook format; the message reaches the app, which
 * shows it in the person's terms (see FRIENDLY_ERRORS in src/lib/supabase.ts).
 */
export async function deliverCode(
  payload: HookPayload,
  config: TermiiConfig,
  send: typeof fetch = fetch,
): Promise<Response> {
  const phone = (payload.user?.phone ?? '').replace(/\D/g, '')
  const otp = payload.sms?.otp ?? ''
  if (!phone || !/^\d{4,10}$/.test(otp)) return hookError(400, 'invalid hook payload')

  // Each text is paid for, so only countries the business serves by phone
  // can be sent one. Calling codes never prefix one another.
  if (!config.countries.some((code) => phone.startsWith(code))) {
    return hookError(400, 'sms_country_not_supported')
  }

  let res: Response
  try {
    res = await send(`${config.baseUrl.replace(/\/+$/, '')}/api/sms/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: config.apiKey,
        to: phone,
        from: config.senderId,
        sms: smsText(otp),
        type: 'plain',
        channel: 'dnd',
      }),
      signal: AbortSignal.timeout(10_000),
    })
  } catch (err) {
    console.error('Termii unreachable', masked(phone), (err as Error).message)
    return hookError(502, 'sms_send_failed')
  }

  const body = (await res.json().catch(() => null)) as { message_id?: string; message?: string } | null
  if (!res.ok || !body?.message_id) {
    // Termii's reason (low balance, DND route not active, sender ID not
    // approved) goes to the function logs. The code never does.
    console.error('Termii refused', masked(phone), res.status, body?.message)
    return hookError(502, 'sms_send_failed')
  }
  return json({})
}

export function hookError(status: number, message: string): Response {
  return json({ error: { http_code: status, message } }, status)
}

function masked(phone: string): string {
  return `…${phone.slice(-4)}`
}
