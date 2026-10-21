/** Where TopUpReturn sends the user after paying, keyed by payment reference. */
export const RETURN_KEY = 'findwork-topup-return'

/**
 * Remembers where to come back to, then leaves for Paystack's payment page.
 * Paystack returns to /wallet/topup?reference=…, which settles the payment
 * whatever it was for: a top-up, an order or a plan.
 */
export function goToPaystack(reference: string, authorizationUrl: string, returnTo: string | null) {
  try {
    sessionStorage.setItem(RETURN_KEY, JSON.stringify({ reference, returnTo }))
  } catch {
    // Without session storage the user still lands on the result screen.
  }
  window.location.assign(authorizationUrl)
}
