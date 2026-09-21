import type { ReactNode } from 'react'
import { Screen } from '../chrome/Screen'
import { PageHeader } from '../chrome/PageHeader'
import { Button } from '../ui/Button'
import { EmptyState, ErrorState, FullScreenLoader } from './States'
import { useMyProviderProfile } from '../../lib/api'
import type { ProviderProfile } from '../../lib/database.types'

/** Provider screens need a provider profile; without one, offer to create it. */
export function RequireProvider({ children }: { children: (provider: ProviderProfile) => ReactNode }) {
  const { data, isLoading, isError, refetch } = useMyProviderProfile()

  if (isLoading) return <FullScreenLoader />
  if (isError) {
    return (
      <Screen>
        <PageHeader title="Selling" back="/home" />
        <ErrorState message="We could not load your provider profile." onRetry={() => refetch()} />
      </Screen>
    )
  }
  if (!data) {
    return (
      <Screen>
        <PageHeader title="Selling" back="/home" />
        <EmptyState
          icon="ph-storefront"
          title="Start selling on FindWork"
          body="Set up your provider profile to list services, get booked and quote on jobs."
          action={<Button to="/work-profile">Set up my profile</Button>}
        />
      </Screen>
    )
  }
  return <>{children(data)}</>
}
