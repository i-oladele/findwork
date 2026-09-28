/**
 * Fingerprint sign-in, done with passkeys (WebAuthn): the phone's own
 * fingerprint or face unlock signs the person in, with no app to install.
 *
 * Browsers only allow it on https addresses and on localhost, and only when
 * the device has a fingerprint or face sensor set up. The Supabase project
 * must also have passkeys switched on (Authentication → Passkeys), with the
 * app's address as its relying party. The option is offered only when all of
 * that holds, so nobody is shown something that cannot work.
 */

type WebAuthnFailure = { code?: string; message?: string; cause?: { name?: string } }

export async function passkeysAvailable(): Promise<boolean> {
  if (typeof window === 'undefined' || !window.isSecureContext || !window.PublicKeyCredential) return false
  const sensor = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().catch(() => false)
  if (!sensor) return false
  try {
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '' },
    })
    const settings = (await res.json()) as { passkeys_enabled?: boolean }
    return settings.passkeys_enabled === true
  } catch {
    return false
  }
}

/** The person closed the prompt, or let it time out: not worth an error. */
export function passkeyCancelled(err: unknown): boolean {
  const e = (err ?? {}) as WebAuthnFailure
  return e.code === 'ERROR_CEREMONY_ABORTED' || e.cause?.name === 'NotAllowedError' || e.cause?.name === 'AbortError'
}

export function passkeyErrorMessage(err: unknown, action: 'turn-on' | 'sign-in'): string {
  const e = (err ?? {}) as WebAuthnFailure
  if (passkeyCancelled(err)) {
    return action === 'turn-on'
      ? 'Your fingerprint was not confirmed. Try again, or skip for now.'
      : 'Fingerprint sign-in was cancelled. Try again, or use your password.'
  }
  if (e.code === 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED') {
    return 'Fingerprint sign-in is already on for this device.'
  }
  if (e.code === 'ERROR_INVALID_DOMAIN' || e.code === 'ERROR_INVALID_RP_ID') {
    return 'Fingerprint sign-in is not set up for this web address yet.'
  }
  return action === 'turn-on'
    ? 'We could not turn on fingerprint sign-in. You can carry on and use your password.'
    : 'We could not sign you in with your fingerprint. Use your password instead.'
}
