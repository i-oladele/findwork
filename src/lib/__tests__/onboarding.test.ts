import { beforeEach, describe, expect, it } from 'vitest'
import {
  destination,
  forgetDestination,
  isAppPath,
  onboardingPath,
  rememberDestination,
  storedDestination,
} from '../destination'
import { signUpOutcome } from '../authContext'
import { friendlyError } from '../supabase'

/**
 * Joining should end where the person was headed: a shared provider link
 * survives sign-up, email confirmation and the role picker.
 */
describe('where to go after signing in', () => {
  beforeEach(() => sessionStorage.clear())

  it('falls back to home when nothing was remembered', () => {
    expect(destination()).toBe('/home')
  })

  it('returns to the link someone opened', () => {
    rememberDestination('/provider/abc?tab=reviews')
    expect(destination()).toBe('/provider/abc?tab=reviews')
    forgetDestination()
    expect(storedDestination()).toBeNull()
  })

  it('never leaves the app, whatever ends up in storage', () => {
    for (const path of ['https://evil.example', '//evil.example', '/\\evil.example', 'javascript:alert(1)', '']) {
      expect(isAppPath(path)).toBe(false)
      rememberDestination(path)
      expect(destination()).toBe('/home')
    }
    sessionStorage.setItem('fw.destination', '//evil.example')
    expect(destination()).toBe('/home')
  })
})

describe('a new account', () => {
  beforeEach(() => sessionStorage.clear())

  it('picks a role first', () => {
    expect(onboardingPath()).toBe('/role')
  })

  it('then carries on to the link they arrived with', () => {
    rememberDestination('/product/lace-cream')
    expect(onboardingPath()).toBe('/role?next=%2Fproduct%2Flace-cream')
  })

  it('does not nest the role picker inside itself', () => {
    rememberDestination('/role?next=%2Fshop')
    expect(onboardingPath()).toBe('/role')
  })
})

describe('signUpOutcome', () => {
  it('asks for the code when there is no session yet', () => {
    expect(signUpOutcome({ user: { identities: [{}] }, session: null })).toEqual({ needsVerification: true })
  })

  it('goes straight in when confirmation is off', () => {
    expect(signUpOutcome({ user: { identities: [{}] }, session: {} })).toEqual({ needsVerification: false })
  })

  it('says the address is taken instead of waiting for a code that will not come', () => {
    let caught: unknown
    try {
      signUpOutcome({ user: { identities: [] }, session: null })
    } catch (err) {
      caught = err
    }
    expect(friendlyError(caught)).toBe('An account with those details already exists. Sign in instead.')
  })
})

describe('sign-up errors people can act on', () => {
  it('explains an address the mailer will not write to', () => {
    expect(friendlyError({ code: 'email_address_not_authorized', message: 'Email address not authorized' })).toBe(
      'We cannot send email to that address yet. Please try again later.',
    )
  })

  it('explains a failed profile creation without leaking the database error', () => {
    expect(friendlyError({ message: 'Database error saving new user' })).toBe(
      'We could not finish creating your account. Please try again.',
    )
  })
})
