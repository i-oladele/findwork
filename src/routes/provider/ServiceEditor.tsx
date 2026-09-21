import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { PageHeader } from '../../components/chrome/PageHeader'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Alert } from '../../components/ui/Alert'
import { SectionLabel } from '../../components/ui/SectionLabel'
import { FullScreenLoader } from '../../components/system/States'
import { RequireProvider } from '../../components/system/RequireProvider'
import { useDeletePackage, useProviderPackages, useSavePackage } from '../../lib/api'
import { friendlyError } from '../../lib/supabase'
import { formatNaira, parseNaira } from '../../lib/format'
import type { ProviderPackage, ProviderProfile } from '../../lib/database.types'

const DURATIONS = [30, 60, 90, 120, 180, 240, 480]

export function ServiceEditor() {
  return <RequireProvider>{(p) => <Loader provider={p} />}</RequireProvider>
}

function Loader({ provider }: { provider: ProviderProfile }) {
  const { id } = useParams<{ id: string }>()
  const { data: packages, isLoading } = useProviderPackages(provider.id)
  if (id && isLoading) return <FullScreenLoader />
  const existing = id ? (packages?.find((p) => p.id === id) ?? null) : null
  return <Form key={existing?.id ?? 'new'} existing={existing} />
}

function Form({ existing }: { existing: ProviderPackage | null }) {
  const navigate = useNavigate()
  const save = useSavePackage()
  const remove = useDeletePackage()
  const [name, setName] = useState(existing?.name ?? '')
  const [price, setPrice] = useState(existing ? String(existing.price) : '')
  const [detail, setDetail] = useState(existing?.detail ?? '')
  const [duration, setDuration] = useState(existing?.duration_minutes ?? 60)
  const [error, setError] = useState<string | null>(null)

  const valid = name.trim().length > 2 && parseNaira(price) > 0

  async function submit() {
    setError(null)
    try {
      await save.mutateAsync({
        id: existing?.id,
        name: name.trim(),
        price: parseNaira(price),
        detail: detail.trim() || null,
        duration_minutes: duration,
      })
      navigate('/provider/services', { replace: true })
    } catch (err) {
      setError(friendlyError(err))
    }
  }

  async function doDelete() {
    if (!existing || !window.confirm(`Delete “${existing.name}”? Past bookings keep their record.`)) return
    setError(null)
    try {
      await remove.mutateAsync(existing.id)
      navigate('/provider/services', { replace: true })
    } catch (err) {
      setError(friendlyError(err))
    }
  }

  return (
    <Screen>
      <PageHeader title={existing ? 'Edit service' : 'New service'} back="/provider/services" icon="x" />
      <div className="px-[22px] pb-8 space-y-4 mt-4">
        <Input label="Service name" value={name} onChange={setName} placeholder="Ready-to-wear, single piece" />
        <Input label="Price (₦)" value={price} onChange={setPrice} placeholder="12000" hint={parseNaira(price) > 0 ? formatNaira(parseNaira(price)) : undefined} />
        <Input label="What's included" value={detail} onChange={setDetail} placeholder="Fabric not included · 4–6 days" />

        <div>
          <SectionLabel className="mb-2.5">Time to block in your calendar</SectionLabel>
          <div className="flex flex-wrap gap-2">
            {DURATIONS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setDuration(m)}
                className={`rounded-full px-3.5 py-2 text-[13.5px] ${
                  duration === m ? 'bg-ink text-white font-semibold' : 'bg-white border border-line text-ink font-medium'
                }`}
              >
                {m < 60 ? `${m} min` : `${m / 60} h`}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[13px] text-muted-2">Nobody else can book you during this window.</p>
        </div>

        {error && <Alert>{error}</Alert>}
        <Button onClick={submit} disabled={!valid} loading={save.isPending} className="w-full">
          {existing ? 'Save changes' : 'Add service'}
        </Button>
        {existing && (
          <button onClick={doDelete} disabled={remove.isPending} className="w-full text-[15px] font-semibold text-danger">
            Delete this service
          </button>
        )}
      </div>
    </Screen>
  )
}
