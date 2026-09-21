import { describe, expect, it } from 'vitest'
import { friendlyError } from '../supabase'

describe('friendlyError', () => {
  it('explains an insufficient balance in the user’s terms', () => {
    expect(friendlyError({ message: 'insufficient_balance' })).toBe(
      'Not enough money in your wallet. Top up and try again.',
    )
  })

  it('turns the double-booking exclusion violation into a useful instruction', () => {
    // 23P01 is what the gist exclusion constraint on bookings raises.
    expect(friendlyError({ code: '23P01', message: 'conflicting key value' })).toBe(
      'That time slot was just taken. Please pick another.',
    )
  })

  it('names the network as the problem when the request never landed', () => {
    expect(friendlyError({ message: 'TypeError: Failed to fetch' })).toBe(
      'No connection. Check your network and try again.',
    )
  })

  it('never leaks raw SQL to the screen', () => {
    const message = friendlyError({
      message: 'duplicate key value violates unique constraint "reviews_booking_id_key"',
      code: '23505',
    })
    expect(message).toBe('That already exists.')
    expect(message).not.toContain('constraint')
  })

  it('falls back to something sayable for an unknown failure', () => {
    expect(friendlyError({ message: 'pq: relation does not exist' })).toBe(
      'Something went wrong. Please try again.',
    )
    expect(friendlyError(null)).toBe('Something went wrong. Please try again.')
  })

  it('explains that phone sign-up is switched off, rather than "something went wrong"', () => {
    // What Supabase Auth returns when no SMS provider is configured.
    expect(friendlyError({ code: 'phone_provider_disabled', message: 'Phone signups are disabled' })).toBe(
      'Phone sign-up is not switched on yet. Use your email address instead.',
    )
    // Older clients surface it as a message with no code.
    expect(friendlyError({ message: 'Phone signups are disabled' })).toBe(
      'Phone sign-up is not switched on yet. Use your email address instead.',
    )
  })

  it('names the real problem for the other auth failures a tester will hit', () => {
    expect(friendlyError({ code: 'invalid_credentials' })).toBe('That email, phone or password is not right.')
    expect(friendlyError({ code: 'user_already_exists' })).toBe(
      'An account with those details already exists. Sign in instead.',
    )
    expect(friendlyError({ code: 'otp_expired' })).toBe('That code has expired. Ask for a new one.')
    expect(friendlyError({ code: 'over_email_send_rate_limit' })).toBe(
      'Too many emails sent. Wait a few minutes and try again.',
    )
  })
})
