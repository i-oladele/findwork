import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert } from '../../components/ui/Alert'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Chip } from '../../components/ui/Chip'
import { Input } from '../../components/ui/Input'
import { SectionLabel } from '../../components/ui/SectionLabel'
import { QueryState } from '../../components/system/QueryState'
import { useRecordStock, useSaveStockItem, useStockHistory, useStockItems } from '../../lib/api'
import { friendlyError } from '../../lib/supabase'
import { formatDateTime } from '../../lib/format'
import type { StockItem } from '../../lib/database.types'

const REASON_LABEL = { received: 'Received', used: 'Used', counted: 'Counted' } as const

const wholeNumber = (value: string) => {
  const digits = value.replace(/\D/g, '')
  return digits === '' ? null : Number(digits)
}

/**
 * What the buying side holds: goods received on purchase orders, less what
 * has been used, corrected by counts. Anyone in the organisation can record
 * use; owners and approvers add items, set reorder levels and count.
 */
export function StockSection({ organizationId, canManage }: { organizationId: string | null; canManage: boolean }) {
  const items = useStockItems(organizationId)
  const [adding, setAdding] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const [lowOnly, setLowOnly] = useState(false)

  return (
    <>
      <div className="flex items-center justify-between mt-6 mb-2.5">
        <SectionLabel>Stock</SectionLabel>
        {canManage && !adding && <button className="min-h-11 text-[14px] font-semibold text-brand-hover" onClick={() => setAdding(true)}>Add an item</button>}
      </div>
      {adding && <ItemForm organizationId={organizationId} onDone={() => setAdding(false)} />}
      <QueryState query={items} errorMessage="We could not load your stock." skeletonRows={2}
        empty={{ icon: 'ph-package', title: 'No stock records yet', body: 'When a purchase order is delivered, record what arrived and it appears here.' }}>
        {(rows) => {
          const low = rows.filter(isLow)
          const shown = lowOnly ? low : rows
          return (
            <>
              {low.length > 0 && (
                <div className="flex gap-2 mb-3">
                  <Chip active={!lowOnly} onClick={() => setLowOnly(false)}>All {rows.length}</Chip>
                  <Chip active={lowOnly} onClick={() => setLowOnly(true)}>Running low {low.length}</Chip>
                </div>
              )}
              {shown.map((item) => (
                <StockRow key={item.id} item={item} canManage={canManage} open={open === item.id}
                  onToggle={() => setOpen(open === item.id ? null : item.id)} organizationId={organizationId} />
              ))}
            </>
          )
        }}
      </QueryState>
    </>
  )
}

const isLow = (item: StockItem) => item.reorder_level !== null && item.on_hand <= item.reorder_level

function StockRow({ item, canManage, open, onToggle, organizationId }: {
  item: StockItem; canManage: boolean; open: boolean; onToggle: () => void; organizationId: string | null
}) {
  const record = useRecordStock()
  const [mode, setMode] = useState<'used' | 'counted' | 'edit' | null>(null)
  const [quantity, setQuantity] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const qty = wholeNumber(quantity)
  // A reorder pre-fills a request for quotes: enough to get back above the level.
  const reorderQty = Math.max(1, (item.reorder_level ?? 0) * 2 - item.on_hand)
  const reorderLink = `/rfqs/new?${new URLSearchParams({ item: item.name, qty: String(reorderQty), unit: item.unit, ...(organizationId ? { org: organizationId } : {}) })}`

  async function save() {
    if (qty === null || !mode || mode === 'edit') return
    setError(null)
    try {
      await record.mutateAsync({ itemId: item.id, reason: mode, quantity: qty, note: note.trim() })
      setMode(null); setQuantity(''); setNote('')
    } catch (err) { setError(friendlyError(err)) }
  }

  return (
    <div className="bg-white border border-line rounded-2xl p-4 mb-3">
      <button className="w-full text-left" onClick={onToggle} aria-expanded={open}>
        <div className="flex items-center justify-between gap-2">
          <span className="font-display font-semibold text-[15.5px] text-ink truncate">{item.name}</span>
          {isLow(item) && <Badge tone="warning" icon="warning">Running low</Badge>}
        </div>
        <div className="flex items-baseline justify-between gap-3 mt-1">
          <span className="font-display font-bold text-[18px] text-ink">{item.on_hand.toLocaleString('en-NG')} <span className="text-[13px] font-normal text-muted-2">{item.unit}</span></span>
          {item.reorder_level !== null && <span className="text-[12.5px] text-muted-2">Reorder at {item.reorder_level}</span>}
        </div>
      </button>

      {open && (
        <div className="border-t border-line-soft mt-3 pt-3">
          {mode === 'edit' ? <ItemForm organizationId={organizationId} item={item} onDone={() => setMode(null)} /> : (
            <>
              <div className="flex flex-wrap gap-2">
                <Chip active={mode === 'used'} onClick={() => setMode(mode === 'used' ? null : 'used')}>Record use</Chip>
                {canManage && <Chip active={mode === 'counted'} onClick={() => setMode(mode === 'counted' ? null : 'counted')}>Count</Chip>}
                {canManage && <Chip onClick={() => setMode('edit')}>Edit</Chip>}
                {isLow(item) && <Link to={reorderLink} className="inline-flex items-center min-h-9 px-3.5 rounded-full bg-brand text-white text-[13.5px] font-semibold">Request quotes</Link>}
              </div>
              {(mode === 'used' || mode === 'counted') && (
                <div className="space-y-3 mt-3">
                  <Input label={mode === 'used' ? `How many ${item.unit} were used` : `How many ${item.unit} are there now`} value={quantity} onChange={setQuantity} type="tel" />
                  <Input label={mode === 'used' ? 'What for (optional)' : 'Why the figure changed'} value={note} onChange={setNote} />
                  {error && <Alert>{error}</Alert>}
                  <Button className="h-12" disabled={qty === null || (mode === 'used' && qty === 0) || (mode === 'counted' && note.trim().length < 3)}
                    loading={record.isPending} onClick={save}>{mode === 'used' ? 'Take off stock' : 'Save the count'}</Button>
                </div>
              )}
              <History itemId={item.id} unit={item.unit} />
            </>
          )}
        </div>
      )}
    </div>
  )
}

function History({ itemId, unit }: { itemId: string; unit: string }) {
  const history = useStockHistory(itemId)
  if (!history.data?.length) return null
  return (
    <ul className="mt-3 space-y-1.5 text-[13px]">
      {history.data.map((m) => (
        <li key={m.id} className="flex justify-between gap-3">
          <span className="text-muted-2 min-w-0 truncate">{formatDateTime(m.created_at)} · {REASON_LABEL[m.reason]}{m.note ? ` · ${m.note}` : ''}{m.actor?.full_name ? ` · ${m.actor.full_name}` : ''}</span>
          <span className={`shrink-0 font-semibold ${m.delta > 0 ? 'text-success-text' : 'text-ink'}`}>{m.delta > 0 ? '+' : ''}{m.delta} {unit}</span>
        </li>
      ))}
    </ul>
  )
}

function ItemForm({ organizationId, item, onDone }: { organizationId: string | null; item?: StockItem; onDone: () => void }) {
  const save = useSaveStockItem()
  const [name, setName] = useState(item?.name ?? '')
  const [unit, setUnit] = useState(item?.unit ?? '')
  const [reorder, setReorder] = useState(item?.reorder_level === null || item?.reorder_level === undefined ? '' : String(item.reorder_level))
  const [error, setError] = useState<string | null>(null)
  return (
    <form className="bg-white border border-line rounded-2xl p-4 mb-3 space-y-3" onSubmit={async (e) => {
      e.preventDefault()
      setError(null)
      try {
        await save.mutateAsync({ itemId: item?.id ?? null, organizationId, name: name.trim(), unit: unit.trim() || 'units', reorderLevel: wholeNumber(reorder) })
        onDone()
      } catch (err) { setError(friendlyError(err)) }
    }}>
      <Input label="Item" value={name} onChange={setName} placeholder="50kg rice" />
      <Input label="Counted in" value={unit} onChange={setUnit} placeholder="bags" />
      <Input label="Tell me when it falls to (optional)" value={reorder} onChange={setReorder} type="tel" hint="Owners and approvers are notified once when stock reaches this level." />
      {error && <Alert>{error}</Alert>}
      <Button type="submit" className="h-12" disabled={name.trim().length < 2} loading={save.isPending}>{item ? 'Save' : 'Add to stock'}</Button>
      <button type="button" className="block w-full min-h-11 text-[14.5px] text-muted" onClick={onDone}>Cancel</button>
    </form>
  )
}
