import { Link } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { PageHeader } from '../../components/chrome/PageHeader'

/** Public web entry point used by the store's account-deletion listing. */
export function AccountDeletion() {
  return (
    <Screen>
      <PageHeader title="Delete your FindWork account" back="/welcome" />
      <article className="px-6 py-5 space-y-5 text-[15px] leading-relaxed text-text-soft">
        <p>You can delete your FindWork account and its associated personal data from the app or this website.</p>
        <ol className="list-decimal pl-5 space-y-2">
          <li>Sign in to the account you want to delete.</li>
          <li>Open Settings and choose Delete my account.</li>
          <li>Review the information, type DELETE and confirm.</li>
        </ol>
        <Link to="/settings" className="inline-flex min-h-11 items-center font-semibold text-brand-hover">Sign in and open account settings</Link>
        <h2 className="font-display text-xl font-semibold text-ink">Before deleting</h2>
        <p>Withdraw your wallet balance and resolve open bookings, orders, disputes, escrow and withdrawal requests first. If deletion is blocked, the app explains what needs resolving. Contact Help and support from your account if you need assistance.</p>
        <h2 className="font-display text-xl font-semibold text-ink">What happens to your data</h2>
        <p>Your sign-in account is removed and your profile is anonymised. Financial and transaction records that must be retained for legal obligations or other people’s records may remain. Deletion cannot be undone.</p>
        <p>See the <Link to="/legal/privacy" className="font-semibold text-brand-hover">privacy policy</Link> for retention and data-handling details.</p>
      </article>
    </Screen>
  )
}
