import { Link } from 'react-router-dom'
import { Screen } from '../chrome/Screen'
import { StatusBar } from '../chrome/StatusBar'
import { EmptyState } from './States'
import { useT } from '../../lib/i18n'

/** Catch-all. Previously an unknown URL rendered a blank white page. */
export function NotFound() {
  const t = useT()
  return (
    <Screen>
      <StatusBar />
      <EmptyState
        icon="ph-compass"
        title={t('Page not found')}
        body={t('That link does not go anywhere. It may have been moved or removed.')}
        action={
          <Link to="/home" className="inline-flex items-center h-11 px-6 bg-ink rounded-xl text-[15px] font-semibold text-cream">
            {t('Back to home')}
          </Link>
        }
      />
    </Screen>
  )
}
