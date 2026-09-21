import { createHmac } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { isValidSignature } from '../../../supabase/functions/_shared/paystack.ts'

/**
 * The webhook's signature check is what stops anyone from POSTing
 * "charge.success" and crediting themselves, so it is worth testing even
 * though the function itself runs on Deno rather than in the browser build.
 */
const SECRET = 'sk_test_pretend_secret'

declare global {
  // eslint-disable-next-line no-var
  var Deno: { env: { get(name: string): string | undefined } }
}

beforeAll(() => {
  globalThis.Deno = { env: { get: (name) => (name === 'PAYSTACK_SECRET_KEY' ? SECRET : undefined) } }
})

function sign(body: string, secret = SECRET) {
  return createHmac('sha512', secret).update(body).digest('hex')
}

const body = JSON.stringify({ event: 'charge.success', data: { reference: 'fw_1', amount: 500000, currency: 'NGN' } })

describe('isValidSignature', () => {
  it('accepts a body signed with the secret key', async () => {
    expect(await isValidSignature(body, sign(body))).toBe(true)
  })

  it('accepts the signature however it is cased', async () => {
    expect(await isValidSignature(body, sign(body).toUpperCase())).toBe(true)
  })

  it('rejects a body that was changed after signing', async () => {
    const signature = sign(body)
    const tampered = body.replace('500000', '50000000')
    expect(await isValidSignature(tampered, signature)).toBe(false)
  })

  it('rejects a signature made with someone else’s key', async () => {
    expect(await isValidSignature(body, sign(body, 'sk_test_other'))).toBe(false)
  })

  it('rejects a missing or truncated signature', async () => {
    expect(await isValidSignature(body, null)).toBe(false)
    expect(await isValidSignature(body, sign(body).slice(0, 32))).toBe(false)
  })
})
