import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { PageHeader } from '../../components/chrome/PageHeader'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Alert } from '../../components/ui/Alert'
import { SectionLabel } from '../../components/ui/SectionLabel'
import { PhotoPicker } from '../../components/ui/PhotoPicker'
import { Toggle } from '../../components/ui/Toggle'
import { FullScreenLoader } from '../../components/system/States'
import { RequireProvider } from '../../components/system/RequireProvider'
import { useMyProducts, useSaveProduct } from '../../lib/api'
import { friendlyError } from '../../lib/supabase'
import { formatNaira, parseNaira } from '../../lib/format'
import type { Product } from '../../lib/database.types'

const MAX_PHOTOS = 6

export function ProductEditor() {
  return <RequireProvider>{() => <Loader />}</RequireProvider>
}

function Loader() {
  const { id } = useParams<{ id: string }>()
  const { data: products, isLoading } = useMyProducts()
  if (id && isLoading) return <FullScreenLoader />
  const existing = id ? (products?.find((p) => p.id === id) ?? null) : null
  return <Form key={existing?.id ?? 'new'} existing={existing} />
}

function Form({ existing }: { existing: Product | null }) {
  const navigate = useNavigate()
  const save = useSaveProduct()
  const [name, setName] = useState(existing?.name ?? '')
  const [price, setPrice] = useState(existing ? String(existing.price) : '')
  const [variant, setVariant] = useState(existing?.variant ?? '')
  const [description, setDescription] = useState(existing?.description ?? '')
  const [photos, setPhotos] = useState<string[]>(existing?.photo_urls ?? [])
  const [limited, setLimited] = useState(existing ? existing.stock !== null : true)
  const [stock, setStock] = useState(existing?.stock != null ? String(existing.stock) : '')
  const [live, setLive] = useState(existing ? existing.status === 'live' : true)
  const [error, setError] = useState<string | null>(null)

  const stockCount = Number.parseInt(stock, 10)
  const stockValid = !limited || (Number.isInteger(stockCount) && stockCount >= 0 && String(stockCount) === stock.trim())
  const valid = name.trim().length >= 2 && name.trim().length <= 120 && parseNaira(price) > 0 && stockValid

  async function submit() {
    setError(null)
    try {
      await save.mutateAsync({
        id: existing?.id,
        name: name.trim(),
        price: parseNaira(price),
        variant: variant.trim() || null,
        description: description.trim() || null,
        stock: limited ? stockCount : null,
        status: live ? 'live' : 'hidden',
        photo_urls: photos,
      })
      navigate('/provider/products', { replace: true })
    } catch (err) {
      setError(friendlyError(err))
    }
  }

  return (
    <Screen>
      <PageHeader title={existing ? 'Edit product' : 'New product'} back="/provider/products" icon="x" />
      <div className="px-[22px] pb-8 space-y-4 mt-4">
        <Input label="What you are selling" value={name} onChange={setName} placeholder="Ankara wax print, 6 yards" />
        <Input
          label="Price (₦)"
          value={price}
          onChange={setPrice}
          placeholder="9800"
          hint={parseNaira(price) > 0 ? `${formatNaira(parseNaira(price))} each. Delivery is added at checkout.` : undefined}
        />
        <Input label="Colour, size or pack (optional)" value={variant} onChange={setVariant} placeholder="Red and gold" />

        <div>
          <SectionLabel className="mb-2">Description</SectionLabel>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            maxLength={2000}
            placeholder="Material, sizes, condition, how long it takes you to send"
            className="w-full bg-white border-[1.5px] border-line rounded-lg p-3.5 min-h-24 text-[15.5px] leading-[1.55] text-ink outline-none resize-none placeholder:text-muted-2"
          />
        </div>

        <div>
          <SectionLabel className="mb-2">Photos</SectionLabel>
          <PhotoPicker bucket="product-images" value={photos} onChange={setPhotos} onError={setError} max={MAX_PHOTOS} />
          <p className="mt-2 text-[13px] text-muted-2">The first photo is the one shown in the Shop.</p>
        </div>

        <div className="bg-white border border-line rounded-2xl p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[15px] font-semibold text-ink">Limited stock</div>
              <div className="text-[13px] text-muted-2 mt-0.5">
                {limited ? 'Sales stop when it runs out.' : 'Made to order: it never sells out.'}
              </div>
            </div>
            <Toggle label="Limited stock" on={limited} onChange={setLimited} />
          </div>
          {limited && (
            <div className="mt-3.5">
              <Input label="How many you have" value={stock} onChange={setStock} placeholder="10" type="number" />
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 bg-white border border-line rounded-2xl p-4">
          <div>
            <div className="text-[15px] font-semibold text-ink">Show in the Shop</div>
            <div className="text-[13px] text-muted-2 mt-0.5">
              {live ? 'Customers can find and buy it.' : 'Hidden: nobody else can see it.'}
            </div>
          </div>
          <Toggle label="Show in the Shop" on={live} onChange={setLive} />
        </div>

        {error && <Alert>{error}</Alert>}
        <Button onClick={submit} disabled={!valid} loading={save.isPending} className="w-full">
          {existing ? 'Save changes' : 'Add product'}
        </Button>
        {existing && (
          <p className="text-center text-[13px] text-muted-2">
            Sold products keep their order history, so they are hidden rather than deleted.
          </p>
        )}
      </div>
    </Screen>
  )
}
