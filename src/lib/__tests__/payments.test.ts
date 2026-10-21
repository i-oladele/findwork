import { describe, expect, it } from 'vitest'
import {
  cardDetails,
  chargeStep,
  hookSecretMatches,
  parseStart,
  payoutStep,
  transferOutcome,
} from '../../../supabase/functions/_shared/payments.ts'

/**
 * What a request to pay may contain, and how Paystack's answers are read.
 * The amounts themselves are always priced again by the database; these
 * rules only keep malformed requests from getting that far.
 */
describe('starting a payment', () => {
  it('treats a bare amount as a top-up, within the limits', () => {
    expect(parseStart({ amount: 5000 })).toEqual({ purpose: 'topup', amount: 5000 })
    expect(parseStart({ amount: 50 })).toMatchObject({ error: 'invalid_amount' })
    expect(parseStart({ amount: 2_000_000 })).toMatchObject({ error: 'invalid_amount' })
    expect(parseStart({ amount: 100.5 })).toMatchObject({ error: 'invalid_amount' })
  })

  const cart = {
    purpose: 'checkout',
    items: [{ product_id: 'palm-oil', qty: 2 }, { product_id: 'ankara', variant_id: '5b2c6f0e-8a7d-4f0b-9c1e-2d3f4a5b6c7d', qty: 1 }],
    delivery_speed: 'standard',
    address: 'Ada\n14 Test Street, Yaba',
    phone: '+2348034129087',
    coupon_code: '  ',
    expected_total: 23600,
  }

  it('accepts a well-formed checkout and drops an empty coupon', () => {
    expect(parseStart(cart)).toEqual({
      purpose: 'checkout',
      items: [{ product_id: 'palm-oil', variant_id: null, qty: 2 }, { product_id: 'ankara', variant_id: '5b2c6f0e-8a7d-4f0b-9c1e-2d3f4a5b6c7d', qty: 1 }],
      delivery_speed: 'standard',
      address: 'Ada\n14 Test Street, Yaba',
      phone: '+2348034129087',
      coupon_code: null,
      expected_total: 23600,
    })
  })

  it('refuses a checkout with anything malformed', () => {
    expect(parseStart({ ...cart, items: [] })).toMatchObject({ error: 'invalid_checkout' })
    expect(parseStart({ ...cart, items: [{ product_id: 'x', qty: 100 }] })).toMatchObject({ error: 'invalid_checkout' })
    expect(parseStart({ ...cart, items: [{ product_id: 'x', qty: 1, variant_id: 'not-a-uuid' }] })).toMatchObject({ error: 'invalid_checkout' })
    expect(parseStart({ ...cart, delivery_speed: 'teleport' })).toMatchObject({ error: 'invalid_checkout' })
    expect(parseStart({ ...cart, address: 'x' })).toMatchObject({ error: 'invalid_checkout' })
    expect(parseStart({ ...cart, expected_total: 0 })).toMatchObject({ error: 'invalid_checkout' })
  })

  it('takes a plan by its id, keeping the card only when asked', () => {
    expect(parseStart({ purpose: 'plan', plan: 'pro', save_card: true })).toEqual({ purpose: 'plan', plan: 'pro', save_card: true })
    expect(parseStart({ purpose: 'plan', plan: 'pro', save_card: 'yes' })).toEqual({ purpose: 'plan', plan: 'pro', save_card: false })
    expect(parseStart({ purpose: 'plan', plan: 'DROP TABLE' })).toMatchObject({ error: 'invalid_plan' })
    expect(parseStart({ purpose: 'refund-me' })).toMatchObject({ error: 'invalid_purpose' })
  })
})

describe("reading Paystack's answers", () => {
  it('keeps the card with the email it is charged under, or nothing', () => {
    expect(cardDetails({ authorization: { authorization_code: 'AUTH_1', last4: '4081', reusable: true }, customer: { email: 'a@b.ng' } }))
      .toEqual({ authorization_code: 'AUTH_1', last4: '4081', reusable: true, email: 'a@b.ng' })
    expect(cardDetails({ authorization: { last4: '4081' } })).toBeNull()
    expect(cardDetails({})).toBeNull()
  })

  it('settles, fails or waits on a saved-card charge', () => {
    expect(chargeStep('success')).toBe('settle')
    expect(chargeStep('failed')).toBe('fail')
    expect(chargeStep('abandoned')).toBe('fail')
    expect(chargeStep('pending')).toBe('wait')
    expect(chargeStep('ongoing')).toBe('wait')
  })

  it('reads a transfer as paid, sent, or back with staff', () => {
    expect(payoutStep('success')).toEqual({ outcome: 'success', reason: null })
    expect(payoutStep('pending')).toEqual({ outcome: 'sent', reason: null })
    expect(payoutStep('received')).toEqual({ outcome: 'sent', reason: null })
    expect(payoutStep('otp').outcome).toBe('failed')
    expect(payoutStep('otp').reason).toMatch(/OTP/)
    expect(payoutStep('blocked')).toEqual({ outcome: 'failed', reason: 'Paystack: blocked' })
  })

  it('maps only transfer events', () => {
    expect(transferOutcome('transfer.success')).toBe('success')
    expect(transferOutcome('transfer.failed')).toBe('failed')
    expect(transferOutcome('transfer.reversed')).toBe('reversed')
    expect(transferOutcome('charge.success')).toBeNull()
  })

  it('compares the shared secret exactly', () => {
    expect(hookSecretMatches('s3cret-value', 's3cret-value')).toBe(true)
    expect(hookSecretMatches('s3cret-valuE', 's3cret-value')).toBe(false)
    expect(hookSecretMatches('s3cret', 's3cret-value')).toBe(false)
    expect(hookSecretMatches(null, 's3cret-value')).toBe(false)
    expect(hookSecretMatches('anything', undefined)).toBe(false)
  })
})
