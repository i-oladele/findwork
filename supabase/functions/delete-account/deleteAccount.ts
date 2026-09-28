// The decision behind delete-account, apart from Deno and the Supabase client
// so it can be unit-tested from Vitest.
import { json } from '../_shared/cors.ts'

type StepResult = { error: { message: string } | null }

export type DeletionSteps = {
  /**
   * anonymise_profile. It checks that no money or open obligation is left and
   * anonymises in one transaction, so if it fails, nothing was changed.
   */
  anonymise: (userId: string) => PromiseLike<StepResult>
  deleteUser: (userId: string) => PromiseLike<StepResult>
}

/** What anonymise_profile raises when the account is not clear to delete. */
export const REFUSALS: Record<string, string> = {
  open_bookings: 'You have bookings that are still open. Finish or cancel them before deleting your account.',
  open_orders: 'You have orders that are still on their way. Wait for them to arrive, or cancel them, first.',
  open_disputes: 'You have a dispute that is still open. It needs to be settled before your account can be deleted.',
  withdrawal_pending: 'A withdrawal is still being sent to your bank. Try again once it has arrived.',
  escrow_outstanding: 'You have money held in escrow. Complete or resolve those jobs first.',
  balance_outstanding: 'Withdraw your remaining balance before deleting your account.',
}

async function attempt(step: () => PromiseLike<StepResult>): Promise<StepResult> {
  try {
    return await step()
  } catch (err) {
    return { error: { message: err instanceof Error ? err.message : String(err) } }
  }
}

export async function deleteAccount(userId: string, steps: DeletionSteps): Promise<Response> {
  const anonymised = await attempt(() => steps.anonymise(userId))
  if (anonymised.error) {
    const code = Object.keys(REFUSALS).find((c) => anonymised.error?.message.includes(c))
    if (code) return json({ error: code, message: REFUSALS[code] }, 409)
    // Anything else, a lost connection included, means the account could not
    // be shown to be clear. Fail closed: the auth user is left alone.
    return json(
      { error: 'check_failed', message: 'We could not check your account just now. Nothing was deleted. Try again.' },
      500,
    )
  }

  // Anonymising is repeatable, so a retry after this fails finishes the job.
  const deleted = await attempt(() => steps.deleteUser(userId))
  if (deleted.error) {
    return json(
      { error: 'delete_failed', message: 'Your details were removed, but we could not close your sign-in. Try again.' },
      500,
    )
  }

  return json({ ok: true })
}
