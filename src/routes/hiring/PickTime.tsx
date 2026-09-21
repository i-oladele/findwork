import { useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { PageHeader } from '../../components/chrome/PageHeader'
import { Button } from '../../components/ui/Button'
import { SectionLabel } from '../../components/ui/SectionLabel'
import { SlotPicker } from '../../components/ui/SlotPicker'
import { ListSkeleton } from '../../components/system/States'
import { useProvider, useProviderPackages } from '../../lib/api'
import { formatDateTime, formatNaira } from '../../lib/format'

export function PickTime() {
  const { id } = useParams<{ id: string }>()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { data: provider, isLoading } = useProvider(id)
  const { data: packages } = useProviderPackages(id)
  const [packageId, setPackageId] = useState<string | null>(params.get('package'))
  const [at, setAt] = useState<string | null>(null)

  const live = (packages ?? []).filter((p) => p.status === 'live')
  const pkg = live.find((p) => p.id === packageId) ?? live[0] ?? null
  const service = pkg?.name ?? `${provider?.category ?? ''} service`
  const price = pkg?.price ?? provider?.price ?? 0

  function next() {
    const q = new URLSearchParams({ at: at! })
    if (pkg) q.set('package', pkg.id)
    navigate(`/book/${id}/pay?${q}`)
  }

  return (
    <Screen>
      <PageHeader title={provider ? `Book ${provider.business_name}` : 'Book'} back={`/provider/${id}`} />
      <div className="px-[22px] pb-6">
        {isLoading || !provider ? (
          <div className="pt-5">
            <ListSkeleton rows={3} />
          </div>
        ) : (
          <>
            <SectionLabel className="mt-[18px] mb-2.5">Service</SectionLabel>
            {live.length > 1 ? (
              <div className="space-y-2">
                {live.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPackageId(p.id)}
                    className={`w-full flex items-baseline justify-between gap-3 bg-white rounded-2xl p-4 text-left ${
                      pkg?.id === p.id ? 'border-[1.5px] border-brand' : 'border border-line'
                    }`}
                  >
                    <span className="font-display font-semibold text-[15.5px] text-ink">{p.name}</span>
                    <span className="font-display font-bold text-[15.5px] text-ink whitespace-nowrap">{formatNaira(p.price)}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex items-baseline justify-between bg-white border border-line rounded-2xl p-4">
                <span className="font-display font-semibold text-[16px] text-ink">{service}</span>
                <span className="font-display font-bold text-[16px] text-ink">{formatNaira(price)}</span>
              </div>
            )}

            <div className="mt-5">
              <SlotPicker providerId={provider.id} durationMinutes={pkg?.duration_minutes ?? 60} value={at} onChange={setAt} />
            </div>
          </>
        )}
      </div>

      <div className="sticky bottom-0 left-0 right-0 bg-cream border-t border-line px-[22px] pt-3.5 pb-[max(22px,env(safe-area-inset-bottom))] mt-6">
        <Button onClick={next} disabled={!at} className="w-full">
          {at ? `Continue — ${formatDateTime(at)}` : 'Pick a day and time'}
        </Button>
      </div>
    </Screen>
  )
}
