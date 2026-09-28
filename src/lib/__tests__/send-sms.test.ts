import { createHmac, randomBytes } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isValidWebhook } from '../../../supabase/functions/_shared/webhook.ts'
import { deliverCode, smsText, type TermiiConfig } from '../../../supabase/functions/send-sms/deliverCode.ts'
import { phoneUnavailable } from '../authContext'
import { friendlyError } from '../supabase'

/**
 * send-sms delivers every phone sign-up and sign-in code. Anyone who could
 * call it without Supabase's signature could send texts on the business's
 * account, so the signature check is tested as closely as the delivery.
 */

const KEY = randomBytes(32).toString('base64')
const SECRET = `v1,whsec_${KEY}`
const NOW = 1_790_000_000_000

function signed(body: string, { key = KEY, id = 'msg_1', at = NOW / 1000 } = {}) {
  const signature = createHmac('sha256', Buffer.from(key, 'base64')).update(`${id}.${at}.${body}`).digest('base64')
  return new Headers({ 'webhook-id': id, 'webhook-timestamp': String(at), 'webhook-signature': `v1,${signature}` })
}

const body = JSON.stringify({ user: { phone: '+2348034129087' }, sms: { otp: '123456' } })

describe('isValidWebhook', () => {
  it('accepts a request Supabase signed', async () => {
    expect(await isValidWebhook(body, signed(body), SECRET, NOW)).toBe(true)
  })

  it('refuses a body changed after signing', async () => {
    expect(await isValidWebhook(body.replace('123456', '654321'), signed(body), SECRET, NOW)).toBe(false)
  })

  it('refuses a signature made with another secret', async () => {
    expect(await isValidWebhook(body, signed(body, { key: randomBytes(32).toString('base64') }), SECRET, NOW)).toBe(false)
  })

  it('refuses an old request replayed later', async () => {
    expect(await isValidWebhook(body, signed(body, { at: NOW / 1000 - 10 * 60 }), SECRET, NOW)).toBe(false)
  })

  it('accepts any valid one of several signatures, as when a secret is being rotated', async () => {
    const headers = signed(body)
    headers.set('webhook-signature', `v1,bm90LWl0 ${headers.get('webhook-signature')}`)
    expect(await isValidWebhook(body, headers, SECRET, NOW)).toBe(true)
  })

  it('refuses a request with no signature at all', async () => {
    expect(await isValidWebhook(body, new Headers(), SECRET, NOW)).toBe(false)
  })
})

const config: TermiiConfig = {
  apiKey: 'termii-key',
  baseUrl: 'https://v3.api.termii.com/',
  senderId: 'FindWork',
  countries: ['234'],
}

function termii(status: number, reply: unknown) {
  return vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify(reply), { status }))
}

describe('deliverCode', () => {
  afterEach(() => vi.restoreAllMocks())

  it('texts the code from FindWork over the DND route', async () => {
    const send = termii(200, { message_id: '3017544054459', message: 'Successfully Sent' })
    const res = await deliverCode({ user: { phone: '+2348034129087' }, sms: { otp: '123456' } }, config, send)

    expect(res.status).toBe(200)
    const [url, init] = send.mock.calls[0]
    expect(url).toBe('https://v3.api.termii.com/api/sms/send')
    expect(JSON.parse(String(init?.body))).toEqual({
      api_key: 'termii-key',
      to: '2348034129087',
      from: 'FindWork',
      sms: 'Your FindWork verification code is 123456. This code expires in 10 minutes. Do not share with anyone.',
      type: 'plain',
      channel: 'dnd',
    })
  })

  it('texts nobody in a country it is not set up for', async () => {
    const send = termii(200, { message_id: 'x' })
    const res = await deliverCode({ user: { phone: '+447400123456' }, sms: { otp: '123456' } }, config, send)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: { http_code: 400, message: 'sms_country_not_supported' } })
    expect(send).not.toHaveBeenCalled()
  })

  it('reports a text Termii refused, and logs why without the code', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const send = termii(400, { message: 'Insufficient balance' })
    const res = await deliverCode({ user: { phone: '+2348034129087' }, sms: { otp: '987654' } }, config, send)

    expect(res.status).toBe(502)
    expect((await res.json()).error.message).toBe('sms_send_failed')
    const logged = JSON.stringify(log.mock.calls)
    expect(logged).toContain('Insufficient balance')
    expect(logged).not.toContain('987654')
    expect(logged).not.toContain('2348034129087')
  })

  it('reports Termii being unreachable as a failed text', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const send = vi.fn(async () => {
      throw new TypeError('fetch failed')
    })
    const res = await deliverCode({ user: { phone: '+2348034129087' }, sms: { otp: '123456' } }, config, send)
    expect(res.status).toBe(502)
  })

  it('refuses a payload without a phone or a code', async () => {
    const send = termii(200, { message_id: 'x' })
    expect((await deliverCode({ user: {}, sms: { otp: '123456' } }, config, send)).status).toBe(400)
    expect((await deliverCode({ user: { phone: '+2348034129087' }, sms: {} }, config, send)).status).toBe(400)
    expect(send).not.toHaveBeenCalled()
  })

  it('matches the template registered with Termii, in one text', () => {
    const text = smsText('123456')
    expect(text).toBe('Your FindWork verification code is 123456. This code expires in 10 minutes. Do not share with anyone.')
    // Over 160 plain characters, a code would be split across two paid texts.
    expect(text.length).toBeLessThanOrEqual(160)
  })
})

describe('what the person sees', () => {
  it('a number from another country is moved to email, with a reason', () => {
    const err = { message: 'sms_country_not_supported' }
    expect(phoneUnavailable(err)).toBe(true)
    expect(friendlyError(err)).toBe('We can only text codes to Nigerian numbers for now. Use your email address instead.')
  })

  it('a failed text asks them to check the number or use email', () => {
    expect(friendlyError({ message: 'sms_send_failed' })).toBe(
      'We could not text that number. Check it and try again, or use your email address.',
    )
  })
})
