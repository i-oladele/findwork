import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { StatusBar } from '../../components/chrome/StatusBar'
import { Chip } from '../../components/ui/Chip'
import { formatNaira } from '../../data/mock'
import { useAppStore, type Transaction } from '../../store/appStore'

const iconFor: Record<string, { icon: string; bg: string; color: string }> = {
  escrow: { icon: 'lock-simple', bg: 'bg-[#FBE2DC]', color: 'text-[#A8311F]' },
  release: { icon: 'arrow-down-left', bg: 'bg-success-bg', color: 'text-success-text' },
  order: { icon: 'shopping-cart', bg: 'bg-cream', color: 'text-ink' },
  topup: { icon: 'bank', bg: 'bg-success-bg', color: 'text-success-text' },
  fee: { icon: 'receipt', bg: 'bg-warning-bg', color: 'text-warning-text' },
}

const filters = ['All', 'In', 'Out', 'Escrow'] as const

function Row({ t, isLast }: { t: Transaction; isLast: boolean }) {
  const meta = iconFor[t.kind]
  return (
    <div className={`flex items-center gap-3.5 p-3.5 ${isLast ? '' : 'border-b border-line-soft'}`}>
      <span className={`flex-none inline-flex items-center justify-center w-10 h-10 rounded-[10px] ${meta.bg} ${meta.color}`}>
        <i className={`ph-fill ph-${meta.icon} text-lg`} />
      </span>
      <div className="flex-1">
        <div className="text-[15px] font-semibold text-ink">{t.label}</div>
        <div className="text-[12.5px] text-muted-2 mt-0.5">{t.time}</div>
      </div>
      <span className={`font-display font-bold text-[15px] ${t.amount > 0 ? 'text-success-text' : 'text-ink'}`}>
        {formatNaira(t.amount)}
      </span>
    </div>
  )
}

export function Transactions() {
  const [filter, setFilter] = useState<(typeof filters)[number]>('All')
  const transactions = useAppStore((s) => s.transactions)

  const filtered = transactions.filter((t) => {
    if (filter === 'All') return true
    if (filter === 'In') return t.amount > 0
    if (filter === 'Out') return t.amount < 0 && t.kind !== 'escrow'
    return t.kind === 'escrow'
  })

  return (
    <Screen>
      <StatusBar />
      <div className="px-[22px] pt-1.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Link to="/wallet" className="inline-flex items-center justify-center w-11 h-11 -ml-2.5 text-ink">
              <i className="ph-bold ph-arrow-left text-[22px]" />
            </Link>
            <span className="font-display font-semibold text-[17px] text-ink">Transactions</span>
          </div>
          <span className="inline-flex items-center justify-center w-11 h-11 text-ink">
            <i className="ph ph-sliders-horizontal text-xl" />
          </span>
        </div>

        <div className="flex gap-2 mt-3">
          {filters.map((f) => (
            <Chip key={f} active={filter === f} onClick={() => setFilter(f)}>
              {f}
            </Chip>
          ))}
        </div>

        <div className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-muted-2 mt-5 mb-2.5">
          {filtered.length} transaction{filtered.length === 1 ? '' : 's'}
        </div>
        {filtered.length === 0 ? (
          <div className="bg-white border border-line rounded-2xl p-6 text-center text-sm text-muted">
            Nothing here yet
          </div>
        ) : (
          <div className="bg-white border border-line rounded-2xl overflow-hidden">
            {filtered.map((t, i) => (
              <Row key={t.id} t={t} isLast={i === filtered.length - 1} />
            ))}
          </div>
        )}
      </div>
    </Screen>
  )
}
