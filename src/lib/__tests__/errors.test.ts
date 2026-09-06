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
})
