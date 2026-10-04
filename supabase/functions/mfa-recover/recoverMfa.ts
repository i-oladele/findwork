/**
 * Turns two-step sign-in off with a single-use recovery code. Kept free of
 * Deno imports so it can be unit-tested from Vitest.
 *
 * The code is checked and spent in the database first (five tries an hour);
 * only then are the authenticators removed. If removing one fails the caller
 * is told, and the support team can finish the job: the code stays spent.
 */
import { json } from '../_shared/cors.ts'

type Result<T = unknown> = { data: T | null; error: { message: string } | null }

export type RecoverSteps = {
  consume: (profileId: string, code: string) => PromiseLike<Result<boolean>>
  listFactors: (profileId: string) => PromiseLike<Result<{ factors: { id: string }[] }>>
  deleteFactor: (profileId: string, factorId: string) => PromiseLike<Result>
}

export async function recoverMfa(profileId: string, code: unknown, steps: RecoverSteps): Promise<Response> {
  if (typeof code !== 'string' || code.replace(/[^0-9a-fA-F]/g, '').length !== 10) {
    return json({ error: 'Enter one of your recovery codes, for example ab12c-34de5.' }, 400)
  }
  const consumed = await steps.consume(profileId, code)
  if (consumed.error) {
    const tooMany = consumed.error.message.includes('too_many_attempts')
    return json(
      { error: tooMany ? 'Too many tries. Wait an hour, or contact support.' : 'We could not check that code. Try again.' },
      tooMany ? 429 : 500,
    )
  }
  if (!consumed.data) return json({ error: 'That recovery code is not valid.' }, 400)

  const listed = await steps.listFactors(profileId)
  if (listed.error || !listed.data) {
    return json({ error: 'Your code was accepted but two-step sign-in could not be turned off. Contact support.' }, 500)
  }
  for (const factor of listed.data.factors) {
    const removed = await steps.deleteFactor(profileId, factor.id)
    if (removed.error) {
      return json({ error: 'Your code was accepted but two-step sign-in could not be turned off. Contact support.' }, 500)
    }
  }
  return json({ ok: true })
}
