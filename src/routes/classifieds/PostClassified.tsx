import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { PageHeader } from '../../components/chrome/PageHeader'
import { Button } from '../../components/ui/Button'
import { Chip } from '../../components/ui/Chip'
import { Alert } from '../../components/ui/Alert'
import { SectionLabel } from '../../components/ui/SectionLabel'
import { PhotoPicker } from '../../components/ui/PhotoPicker'
import { usePostClassified, useProfile } from '../../lib/api'
import { friendlyError } from '../../lib/supabase'
import { parseNaira } from '../../lib/format'
import type { ClassifiedCategory } from '../../lib/database.types'

export function PostClassified() {
  const navigate = useNavigate()
  const post = usePostClassified()
  const { data: profile } = useProfile()

  const [title, setTitle] = useState('')
  const [price, setPrice] = useState('')
  const [category, setCategory] = useState<ClassifiedCategory>('Used goods')
  const [location, setLocation] = useState(profile?.location ?? '')
  const [description, setDescription] = useState('')
  const [photos, setPhotos] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  const canSubmit = title.trim().length > 2 && parseNaira(price) > 0 && location.trim().length > 1

  async function submit() {
    setError(null)
    try {
      const id = await post.mutateAsync({
        title: title.trim(),
        price: parseNaira(price),
        category,
        location: location.trim(),
        description: description.trim(),
        photo_urls: photos,
      })
      navigate(`/classifieds/${id}`, { replace: true })
    } catch (err) {
      setError(friendlyError(err))
    }
  }

  return (
    <Screen>
      <PageHeader title="Post a listing" back="/classifieds" icon="x" />
      <div className="px-[22px] pb-6">
        <div className="flex gap-2 mt-4">
          <Chip active={category === 'Used goods'} onClick={() => setCategory('Used goods')}>
            Used goods
          </Chip>
          <Chip active={category === 'Rentals'} onClick={() => setCategory('Rentals')}>
            Rentals
          </Chip>
        </div>

        <SectionLabel className="mt-4 mb-2">Title</SectionLabel>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What are you listing?"
          maxLength={120}
          className="w-full bg-white border-[1.5px] border-line rounded-lg h-[52px] px-3.5 text-[16px] text-ink outline-none placeholder:text-muted-2"
        />

        <SectionLabel className="mt-4 mb-2">Description</SectionLabel>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          placeholder="Condition, why you are selling, anything a buyer would ask"
          className="w-full bg-white border-[1.5px] border-line rounded-lg p-3.5 min-h-24 text-[15.5px] leading-[1.55] text-ink outline-none resize-none placeholder:text-muted-2"
        />

        <SectionLabel className="mt-4 mb-2">Photos</SectionLabel>
        <PhotoPicker bucket="classifieds-photos" value={photos} onChange={setPhotos} onError={setError} max={4} />
        <p className="mt-2 text-[13px] text-muted-2">Listings with photos get far more replies.</p>

        <div className="flex gap-3 mt-4">
          <div className="flex-1">
            <SectionLabel className="mb-2">Price{category === 'Rentals' ? ' / year' : ''}</SectionLabel>
            <div className="flex items-center bg-white border-[1.5px] border-line rounded-lg h-[52px] px-3.5 font-display font-bold text-[16px] text-ink">
              <span>₦</span>
              <input
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                inputMode="numeric"
                placeholder="0"
                className="flex-1 bg-transparent outline-none min-w-0 placeholder:text-muted-2 placeholder:font-normal"
              />
            </div>
          </div>
          <div className="flex-1">
            <SectionLabel className="mb-2">Location</SectionLabel>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Yaba, Lagos"
              className="w-full bg-white border-[1.5px] border-line rounded-lg h-[52px] px-3.5 text-[15.5px] text-ink outline-none placeholder:text-muted-2"
            />
          </div>
        </div>

        {error && <Alert className="mt-4">{error}</Alert>}
      </div>

      <div className="sticky bottom-0 left-0 right-0 bg-cream border-t border-line px-[22px] pt-3.5 pb-[max(22px,env(safe-area-inset-bottom))] mt-5">
        <Button onClick={submit} disabled={!canSubmit} loading={post.isPending} className="w-full">
          Post listing
        </Button>
      </div>
    </Screen>
  )
}
