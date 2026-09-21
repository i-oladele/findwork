import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { StatusBar } from '../../components/chrome/StatusBar'
import { BackButton } from '../../components/chrome/PageHeader'
import { Button } from '../../components/ui/Button'
import { Chip } from '../../components/ui/Chip'
import { Input } from '../../components/ui/Input'
import { Alert } from '../../components/ui/Alert'
import { AreaPicker } from '../../components/ui/AreaPicker'
import { PhotoPicker } from '../../components/ui/PhotoPicker'
import { ProgressDots } from '../../components/ui/ProgressDots'
import { SectionLabel } from '../../components/ui/SectionLabel'
import { ListSkeleton } from '../../components/system/States'
import { useBecomeProvider, useMyProviderProfile, useProfile, useUpdateProviderProfile } from '../../lib/api'
import { friendlyError } from '../../lib/supabase'
import { parseNaira } from '../../lib/format'
import { CATEGORIES } from '../../lib/categories'

const UNITS = ['job', 'visit', 'hour', 'day'] as const

/**
 * "Switch to selling": creates the provider profile customers book, or edits
 * it if one exists. Reached from onboarding and from the provider dashboard.
 */
export function WorkProfile() {
  const { data: existing, isLoading } = useMyProviderProfile()
  const { data: profile } = useProfile()

  if (isLoading) {
    return (
      <Screen>
        <StatusBar />
        <div className="px-6 pt-6">
          <ListSkeleton rows={3} />
        </div>
      </Screen>
    )
  }

  return (
    <WorkProfileForm
      key={existing?.id ?? 'new'}
      initial={{
        businessName: existing?.business_name ?? profile?.full_name ?? '',
        category: existing?.category ?? '',
        location: existing?.location ?? profile?.location ?? '',
        price: existing ? String(existing.price) : '',
        unit: (existing?.price_unit as (typeof UNITS)[number]) ?? 'job',
        bio: existing?.bio ?? '',
        area: existing?.area ?? profile?.area ?? null,
        photos: existing?.photo_urls ?? [],
      }}
      isEdit={Boolean(existing)}
    />
  )
}

function WorkProfileForm({
  initial,
  isEdit,
}: {
  initial: {
    businessName: string
    category: string
    location: string
    price: string
    unit: string
    bio: string
    area: string | null
    photos: string[]
  }
  isEdit: boolean
}) {
  const navigate = useNavigate()
  const become = useBecomeProvider()
  const update = useUpdateProviderProfile()

  const [businessName, setBusinessName] = useState(initial.businessName)
  const [category, setCategory] = useState(initial.category)
  const [location, setLocation] = useState(initial.location)
  const [price, setPrice] = useState(initial.price)
  const [unit, setUnit] = useState(initial.unit)
  const [bio, setBio] = useState(initial.bio)
  const [area, setArea] = useState<string | null>(initial.area)
  const [photos, setPhotos] = useState<string[]>(initial.photos)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = businessName.trim().length > 1 && category !== '' && area !== null && parseNaira(price) > 0

  async function submit() {
    setError(null)
    const fields = {
      business_name: businessName.trim(),
      category,
      area,
      // Kept alongside the area for the finer detail customers recognise.
      location: location.trim() || area!,
      price: parseNaira(price),
      price_unit: unit,
      bio: bio.trim() || undefined,
    }
    try {
      if (isEdit) {
        await update.mutateAsync({ ...fields, photo_urls: photos })
        navigate('/provider', { replace: true })
      } else {
        await become.mutateAsync(fields)
        if (photos.length > 0) await update.mutateAsync({ photo_urls: photos })
        navigate('/provider/services', { replace: true, state: { welcome: true } })
      }
    } catch (err) {
      setError(friendlyError(err))
    }
  }

  return (
    <Screen>
      <StatusBar />
      <div className="px-6 pt-1.5 pb-10">
        <BackButton fallback={isEdit ? '/provider' : '/role'} />
        {!isEdit && <ProgressDots step={3} of={3} />}
        <h2 className="font-display font-bold text-[34px] leading-[1.05] tracking-[-0.03em] text-ink">
          {isEdit ? 'Your business' : 'What do you do?'}
        </h2>
        <p className="mt-2.5 text-[15.5px] leading-[1.55] text-muted">
          This is what customers see when they search. You can change it any time.
        </p>

        <div className="mt-6">
          <Input label="Business name" value={businessName} onChange={setBusinessName} placeholder="Ada's Tailoring" />
        </div>

        <SectionLabel className="mt-5 mb-2.5">Category</SectionLabel>
        <div className="flex flex-wrap gap-2.5">
          {CATEGORIES.map((c) => (
            <Chip
              key={c.name}
              active={category === c.name}
              icon={category === c.name ? 'check' : undefined}
              onClick={() => setCategory(c.name)}
            >
              {c.name}
            </Chip>
          ))}
        </div>

        <div className="mt-5">
          <AreaPicker
            value={area}
            onChange={setArea}
            label="Where you work"
            hint="Customers search by area, and can sort by who is closest to them."
          />
        </div>

        <div className="mt-4">
          <Input label="Street or landmark (optional)" value={location} onChange={setLocation} placeholder="Off Herbert Macaulay Way" />
        </div>

        <SectionLabel className="mt-5 mb-2">Starting price</SectionLabel>
        <div className="flex gap-2.5">
          <div className="flex-1 flex items-center gap-2 bg-white border-[1.5px] border-line rounded-lg h-[52px] px-3.5">
            <span className="font-display font-bold text-[16px] text-ink">₦</span>
            <input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              inputMode="numeric"
              placeholder="12,000"
              className="flex-1 min-w-0 text-[16px] font-display font-bold text-ink bg-transparent outline-none placeholder:text-muted-2 placeholder:font-normal"
            />
          </div>
          <select
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            aria-label="Price per"
            className="h-[52px] bg-white border-[1.5px] border-line rounded-lg px-3 text-[15px] text-ink"
          >
            {UNITS.map((u) => (
              <option key={u} value={u}>
                per {u}
              </option>
            ))}
          </select>
        </div>

        <SectionLabel className="mt-5 mb-2">About your work</SectionLabel>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          rows={4}
          placeholder="Experience, what you specialise in, the areas you cover"
          className="w-full bg-white border-[1.5px] border-line rounded-lg p-3.5 text-[15.5px] leading-[1.55] text-ink outline-none resize-none placeholder:text-muted-2"
        />

        <SectionLabel className="mt-5 mb-2.5">Photos of your work</SectionLabel>
        <PhotoPicker bucket="provider-portfolios" value={photos} onChange={setPhotos} onError={setError} max={8} />
        <p className="mt-2 text-[13px] text-muted-2">
          The first photo is what customers see in search results.
        </p>

        {error && <Alert className="mt-4">{error}</Alert>}

        <Button onClick={submit} disabled={!canSubmit} loading={become.isPending || update.isPending} className="mt-6 w-full">
          {isEdit ? 'Save changes' : 'Start selling'}
        </Button>
      </div>
    </Screen>
  )
}
