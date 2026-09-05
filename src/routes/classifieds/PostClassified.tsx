import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { StatusBar } from '../../components/chrome/StatusBar'
import { Button } from '../../components/ui/Button'
import { Chip } from '../../components/ui/Chip'
import { PlaceholderImage } from '../../components/ui/PlaceholderImage'
import { useAppStore } from '../../store/appStore'

export function PostClassified() {
  const navigate = useNavigate()
  const postClassified = useAppStore((s) => s.postClassified)

  const [title, setTitle] = useState('')
  const [price, setPrice] = useState('')
  const [category, setCategory] = useState<'Rentals' | 'Used goods'>('Used goods')
  const [location, setLocation] = useState('Yaba, Lagos')
  const [description, setDescription] = useState('')

  const canSubmit = title.trim().length > 0 && Number(price.replace(/,/g, '')) > 0

  function submit() {
    const id = postClassified({
      title,
      price: Number(price.replace(/,/g, '')) || 0,
      category,
      location,
      description,
    })
    navigate(`/classifieds/${id}`)
  }

  return (
    <Screen>
      <StatusBar />
      <div className="px-[22px] pt-1.5">
        <div className="flex items-center gap-1.5">
          <Link to="/classifieds" className="inline-flex items-center justify-center w-11 h-11 -ml-2.5 text-ink">
            <i className="ph-bold ph-x text-xl" />
          </Link>
          <span className="font-display font-semibold text-[17px] text-ink">Post a listing</span>
        </div>

        <div className="flex gap-2 mt-4">
          <Chip active={category === 'Used goods'} onClick={() => setCategory('Used goods')}>Used goods</Chip>
          <Chip active={category === 'Rentals'} onClick={() => setCategory('Rentals')}>Rentals</Chip>
        </div>

        <div className="mt-4">
          <div className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-muted-2 mb-2">Title</div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What are you listing?"
            className="w-full flex items-center bg-white border-[1.5px] border-line rounded-lg h-[52px] px-3.5 text-[16px] text-ink outline-none placeholder:text-muted-2"
          />
        </div>

        <div className="mt-4">
          <div className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-muted-2 mb-2">Description</div>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            placeholder="Condition, why you're selling, any details a buyer would ask"
            className="w-full bg-white border-[1.5px] border-line rounded-lg p-3.5 min-h-24 text-[15.5px] leading-[1.55] text-ink outline-none resize-none placeholder:text-muted-2"
          />
        </div>

        <div className="mt-4">
          <div className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-muted-2 mb-2">Photos</div>
          <div className="flex gap-2.5">
            <PlaceholderImage className="w-[74px] h-[74px] rounded-lg" />
            <div className="w-[74px] h-[74px] border-[1.5px] border-dashed border-muted-4 rounded-lg flex items-center justify-center text-muted-2">
              <i className="ph ph-plus text-2xl" />
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-4">
          <div className="flex-1">
            <div className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-muted-2 mb-2">
              Price{category === 'Rentals' ? ' / year' : ''}
            </div>
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
            <div className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-muted-2 mb-2">Location</div>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full flex items-center bg-white border-[1.5px] border-line rounded-lg h-[52px] px-3.5 text-[15.5px] text-ink outline-none"
            />
          </div>
        </div>
      </div>

      <div className="sticky bottom-0 left-0 right-0 bg-cream border-t border-line px-[22px] pt-3.5 pb-[22px] mt-5">
        <Button onClick={submit} disabled={!canSubmit}>Post listing</Button>
      </div>
    </Screen>
  )
}
