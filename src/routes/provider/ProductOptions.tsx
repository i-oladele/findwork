import { useState } from 'react'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { SectionLabel } from '../../components/ui/SectionLabel'
import { useProductVariants, useSaveProductVariants } from '../../lib/api'
import { friendlyError } from '../../lib/supabase'
import { parseNaira } from '../../lib/format'
import type { ProductVariant } from '../../lib/database.types'

type Row = { id?: string; name: string; price: string; stock: string }

const toRow = (v: ProductVariant): Row => ({ id: v.id, name: v.name, price: String(v.price), stock: v.stock === null ? '' : String(v.stock) })

/**
 * The sizes, colours or packs a product is sold in. Each has its own price
 * and stock; once a product has options, a customer must pick one.
 */
export function ProductOptions({ productId }: { productId: string }) {
  const { data, isLoading } = useProductVariants([productId])
  if (isLoading || !data) return null
  return <Editor key={data.map((v) => v.id).join()} productId={productId} initial={data} />
}

function Editor({ productId, initial }: { productId: string; initial: ProductVariant[] }) {
  const save = useSaveProductVariants()
  const [rows, setRows] = useState<Row[]>(initial.map(toRow))
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const update = (i: number, patch: Partial<Row>) => { setSaved(false); setRows((all) => all.map((r, j) => (j === i ? { ...r, ...patch } : r))) }
  const valid = rows.every((r) => r.name.trim() && parseNaira(r.price) > 0 && (r.stock.trim() === '' || /^\d+$/.test(r.stock.trim())))
  const field = 'bg-cream rounded-lg h-11 px-3 text-[14.5px] text-ink outline-none min-w-0'

  return (
    <div className="border-t border-line pt-5">
      <SectionLabel className="mb-1.5">Options (sizes, colours, packs)</SectionLabel>
      <p className="text-[13px] leading-[1.45] text-muted-2">
        Each option has its own price and stock. With options, the product's own price and stock show the lowest price and the total left.
      </p>
      {rows.map((row, i) => (
        <div key={row.id ?? `new-${i}`} className="flex gap-2 mt-3">
          <input value={row.name} maxLength={60} placeholder="Name, e.g. Large" aria-label={`Option ${i + 1} name`} onChange={(e) => update(i, { name: e.target.value })} className={`${field} flex-1`} />
          <input value={row.price} inputMode="numeric" placeholder="₦ price" aria-label={`Option ${i + 1} price`} onChange={(e) => update(i, { price: e.target.value })} className={`${field} w-24`} />
          <input value={row.stock} inputMode="numeric" placeholder="Stock" aria-label={`Option ${i + 1} stock`} onChange={(e) => update(i, { stock: e.target.value })} className={`${field} w-20`} />
          <button type="button" aria-label={`Remove option ${i + 1}`} className="w-10 h-11 text-muted" onClick={() => { setSaved(false); setRows((all) => all.filter((_, j) => j !== i)) }}>
            <i className="ph ph-x" />
          </button>
        </div>
      ))}
      <p className="mt-2 text-[12.5px] text-muted-2">Leave stock empty for an option that never runs out.</p>
      {rows.length < 20 && (
        <button type="button" className="min-h-11 text-[14px] font-semibold text-brand" onClick={() => { setSaved(false); setRows((all) => [...all, { name: '', price: '', stock: '' }]) }}>
          Add an option
        </button>
      )}
      {error && <Alert className="mt-2">{error}</Alert>}
      {saved && <Alert tone="success" className="mt-2">Options saved.</Alert>}
      <Button variant="secondary" className="mt-3 h-12 text-ink" disabled={!valid} loading={save.isPending} onClick={async () => {
        setError(null)
        try {
          await save.mutateAsync({
            productId,
            variants: rows.map((r) => ({ ...(r.id ? { id: r.id } : {}), name: r.name.trim(), price: parseNaira(r.price), stock: r.stock.trim() === '' ? null : Number(r.stock) })),
          })
          setSaved(true)
        } catch (err) { setError(friendlyError(err)) }
      }}>Save options</Button>
    </div>
  )
}
