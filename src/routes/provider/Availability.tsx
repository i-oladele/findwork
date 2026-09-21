import { useState } from 'react'
import { Screen } from '../../components/chrome/Screen'
import { PageHeader } from '../../components/chrome/PageHeader'
import { Toggle } from '../../components/ui/Toggle'
import { Alert } from '../../components/ui/Alert'
import { SectionLabel } from '../../components/ui/SectionLabel'
import { ListSkeleton } from '../../components/system/States'
import { RequireProvider } from '../../components/system/RequireProvider'
import { useProviderAvailability, useUpdateAvailability, useUpdateProviderProfile } from '../../lib/api'
import { friendlyError } from '../../lib/supabase'
import type { ProviderProfile, Tables } from '../../lib/database.types'

type Day = Exclude<keyof Tables<'provider_availability'>, 'provider_id'>

const DAYS: { key: Day; label: string }[] = [
  { key: 'monday', label: 'Monday' },
  { key: 'tuesday', label: 'Tuesday' },
  { key: 'wednesday', label: 'Wednesday' },
  { key: 'thursday', label: 'Thursday' },
  { key: 'friday', label: 'Friday' },
  { key: 'saturday', label: 'Saturday' },
  { key: 'sunday', label: 'Sunday' },
]

export function Availability() {
  return <RequireProvider>{(p) => <AvailabilityForm provider={p} />}</RequireProvider>
}

function AvailabilityForm({ provider }: { provider: ProviderProfile }) {
  const { data: availability, isLoading } = useProviderAvailability(provider.id)
  const updateDays = useUpdateAvailability()
  const updateProfile = useUpdateProviderProfile()
  const [error, setError] = useState<string | null>(null)

  const onError = (err: unknown) => setError(friendlyError(err))

  return (
    <Screen>
      <PageHeader title="Availability" back="/provider" />
      <div className="px-[22px] pb-8">
        <div className="flex items-center justify-between gap-3 bg-white border border-line rounded-2xl p-4 mt-4">
          <div>
            <div className="font-display font-semibold text-[16.5px] text-ink">Taking bookings</div>
            <div className="text-[13px] text-muted-2 mt-1">
              {provider.taking_bookings ? 'Customers can book you now' : 'Paused — nobody can book you'}
            </div>
          </div>
          <Toggle
            label="Taking bookings"
            on={provider.taking_bookings}
            disabled={updateProfile.isPending}
            onChange={(on) => updateProfile.mutate({ taking_bookings: on }, { onError })}
          />
        </div>

        <SectionLabel className="mt-[22px] mb-2.5">Days you work</SectionLabel>
        {isLoading ? (
          <ListSkeleton rows={3} />
        ) : (
          <div className="bg-white border border-line rounded-2xl overflow-hidden">
            {DAYS.map((d, i) => {
              const open = availability ? availability[d.key] : d.key !== 'sunday'
              return (
                <div
                  key={d.key}
                  className={`flex items-center justify-between px-4 py-3.5 ${i < DAYS.length - 1 ? 'border-b border-line-soft' : ''}`}
                >
                  <span className={`text-[15px] font-semibold ${open ? 'text-ink' : 'text-muted-4'}`}>{d.label}</span>
                  <span className="flex items-center gap-3">
                    <span className={`text-[14px] ${open ? 'text-text-soft' : 'text-muted'}`}>{open ? 'Open' : 'Closed'}</span>
                    <Toggle
                      size="sm"
                      label={`Open on ${d.label}`}
                      on={open}
                      disabled={updateDays.isPending}
                      onChange={(on) => updateDays.mutate({ [d.key]: on }, { onError })}
                    />
                  </span>
                </div>
              )
            })}
          </div>
        )}
        <p className="mt-3 text-[13px] leading-[1.5] text-muted-2">
          Customers pick from slots between 9:00 and 18:00 on open days. Times you are already booked are hidden
          automatically.
        </p>
        {error && <Alert className="mt-4">{error}</Alert>}
      </div>
    </Screen>
  )
}
