import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { StatusBar } from '../../components/chrome/StatusBar'
import { Alert } from '../../components/ui/Alert'
import { QueryState } from '../../components/system/QueryState'
import { RequireProvider } from '../../components/system/RequireProvider'
import { usePlans, useProviderPackages, useTogglePackageStatus } from '../../lib/api'
import { friendlyError } from '../../lib/supabase'
import { formatNaira } from '../../lib/format'
import type { ProviderProfile } from '../../lib/database.types'

export function Services() {
  return <RequireProvider>{(p) => <ServiceList provider={p} />}</RequireProvider>
}

function ServiceList({ provider }: { provider: ProviderProfile }) {
  const location = useLocation()
  const welcome = (location.state as { welcome?: boolean } | null)?.welcome
  const packages = useProviderPackages(provider.id)
  const { data: plans } = usePlans()
  const toggle = useTogglePackageStatus()
  const [error, setError] = useState<string | null>(null)

  const limit = plans?.find((p) => p.id === provider.plan)?.listing_limit ?? null
  const live = packages.data?.filter((p) => p.status === 'live').length ?? 0

  return (
    <Screen bottomNav="provider">
      <StatusBar />
      <div className="px-[22px] pt-2.5 pb-6">
        <div className="flex items-center justify-between">
          <h2 className="font-display font-bold text-[28px] tracking-[-0.03em] text-ink">My services</h2>
          <Link
            to="/provider/services/new"
            aria-label="Add a service"
            className="inline-flex items-center justify-center w-11 h-11 bg-brand rounded-xl text-white"
          >
            <i className="ph-bold ph-plus text-xl" />
          </Link>
        </div>

        {welcome && (
          <Alert tone="success" className="mt-4">
            You are set up. Add the services you offer with a fixed price, so customers can book and pay in one go.
          </Alert>
        )}

        <div className="flex items-center gap-2.5 bg-white border border-line rounded-2xl p-3.5 mt-4">
          <i className="ph-fill ph-list-checks text-xl text-success" />
          <div className="flex-1 text-sm leading-[1.45] text-text-soft">
            <strong className="text-ink">{live}</strong> live
            {limit !== null ? ` of ${limit} on the Free plan. ` : '. '}
            {limit !== null && (
              <Link to="/plans" className="font-semibold text-brand-hover">
                Upgrade for unlimited
              </Link>
            )}
          </div>
        </div>
        {error && <Alert className="mt-4">{error}</Alert>}

        <QueryState
          query={packages}
          errorMessage="We could not load your services."
          empty={{
            icon: 'ph-list-plus',
            title: 'No services yet',
            body: `Until you add one, customers book your starting price of ${formatNaira(provider.price)} per ${provider.price_unit}.`,
            action: (
              <Link to="/provider/services/new" className="text-[15px] font-semibold text-brand-hover">
                Add a service
              </Link>
            ),
          }}
        >
          {(list) =>
            list.map((s) => {
              const isLive = s.status === 'live'
              return (
                <div key={s.id} className={`bg-white border border-line rounded-2xl overflow-hidden mt-4 ${isLive ? '' : 'opacity-[.72]'}`}>
                  <div className="p-3.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="font-display font-semibold text-base text-ink">{s.name}</span>
                      <span className="font-display font-bold text-base text-ink whitespace-nowrap">{formatNaira(s.price)}</span>
                    </div>
                    {s.detail && <div className="text-[12.5px] text-muted-2 mt-1">{s.detail}</div>}
                    <div className="flex items-center gap-2 mt-2">
                      {isLive ? (
                        <span className="inline-flex items-center gap-1.5 bg-success-bg text-success-text rounded-full px-2.5 py-1 text-[11px] font-bold">
                          <i className="ph-fill ph-check-circle" />
                          Live
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 bg-cream text-muted rounded-full px-2.5 py-1 text-[11px] font-bold">
                          <i className="ph-fill ph-pause-circle" />
                          Paused
                        </span>
                      )}
                      <span className="text-[11.5px] text-muted-2">{s.duration_minutes} min slot</span>
                    </div>
                  </div>
                  <div className="flex border-t border-line-soft">
                    <Link
                      to={`/provider/services/${s.id}/edit`}
                      className="flex-1 flex items-center justify-center gap-1.5 h-[46px] text-sm font-semibold text-ink border-r border-line-soft"
                    >
                      <i className="ph ph-pencil-simple text-base" />
                      Edit
                    </Link>
                    <button
                      onClick={() => {
                        setError(null)
                        toggle.mutate(
                          { id: s.id, status: isLive ? 'paused' : 'live' },
                          { onError: (e) => setError(friendlyError(e)) },
                        )
                      }}
                      disabled={toggle.isPending}
                      className="flex-1 flex items-center justify-center gap-1.5 h-[46px] text-sm font-semibold text-muted"
                    >
                      <i className={`ph ${isLive ? 'ph-pause' : 'ph-play'} text-base`} />
                      {isLive ? 'Pause' : 'Resume'}
                    </button>
                  </div>
                </div>
              )
            })
          }
        </QueryState>
      </div>
    </Screen>
  )
}
