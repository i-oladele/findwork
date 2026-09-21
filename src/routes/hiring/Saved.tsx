import { Link } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { PageHeader } from '../../components/chrome/PageHeader'
import { ProviderCard } from '../../components/ui/ProviderCard'
import { QueryState } from '../../components/system/QueryState'
import { useFavourites, useProfile, useToggleFavourite } from '../../lib/api'
import { distanceBetween } from '../../lib/distance'

export function Saved() {
  const favourites = useFavourites()
  const { data: profile } = useProfile()
  const remove = useToggleFavourite()

  return (
    <Screen bottomNav="customer">
      <PageHeader title="Saved providers" back="/home" />
      <div className="px-[22px] pb-6">
        <QueryState
          query={favourites}
          errorMessage="We could not load your saved providers."
          empty={{
            icon: 'ph-heart',
            title: 'Nothing saved yet',
            body: 'Tap the heart on a provider to keep them here for later.',
            action: (
              <Link to="/search" className="text-[15px] font-semibold text-brand-hover">
                Find a pro
              </Link>
            ),
          }}
        >
          {(list) =>
            list.map((p) => (
              <div key={p.id}>
                <ProviderCard provider={p} distanceKm={distanceBetween(profile, p)} />
                {/* Outside the card, which is itself a link — a button nested
                    inside an anchor is invalid and swallows the tap. */}
                <button
                  onClick={() => remove.mutate({ providerId: p.id, saved: true })}
                  disabled={remove.isPending}
                  className="mt-1.5 ml-1 text-[13.5px] font-semibold text-muted"
                >
                  Remove from saved
                </button>
              </div>
            ))
          }
        </QueryState>
      </div>
    </Screen>
  )
}
