import { Link } from 'react-router-dom'
import { Screen } from '../chrome/Screen'
import { StatusBar } from '../chrome/StatusBar'
import { EmptyState } from './States'

/** Catch-all. Previously an unknown URL rendered a blank white page. */
export function NotFound() {
  return (
    <Screen>
      <StatusBar />
      <EmptyState
        icon="ph-compass"
        title="Page not found"
        body="That link does not go anywhere. It may have been moved or removed."
        action={
          <Link to="/home" className="inline-flex items-center h-11 px-6 bg-ink rounded-xl text-[15px] font-semibold text-cream">
            Back to home
          </Link>
        }
      />
    </Screen>
  )
}
