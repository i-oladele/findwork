import { useState } from 'react'
import { Screen } from '../../components/chrome/Screen'
import { PageHeader } from '../../components/chrome/PageHeader'
import { Chip } from '../../components/ui/Chip'
import { SectionLabel } from '../../components/ui/SectionLabel'
import { TransactionRow } from '../../components/ui/TransactionRow'
import { QueryState } from '../../components/system/QueryState'
import { useTransactions } from '../../lib/api'
import type { WalletTransaction } from '../../lib/database.types'

const filters = ['All', 'In', 'Out', 'Escrow'] as const
type Filter = (typeof filters)[number]

function matches(t: WalletTransaction, f: Filter) {
  if (f === 'In') return t.balance_delta > 0
  if (f === 'Out') return t.balance_delta < 0 && t.kind !== 'escrow'
  if (f === 'Escrow') return t.escrow_delta !== 0
  return true
}

export function Transactions() {
  const [filter, setFilter] = useState<Filter>('All')
  const transactions = useTransactions(200)
  const filtered = transactions.data?.filter((t) => matches(t, filter))

  return (
    <Screen>
      <PageHeader title="Transactions" back="/wallet" />
      <div className="px-[22px] pb-8">
        <div className="flex gap-2 mt-3">
          {filters.map((f) => (
            <Chip key={f} active={filter === f} onClick={() => setFilter(f)}>
              {f}
            </Chip>
          ))}
        </div>

        {filtered && (
          <SectionLabel className="mt-5 mb-2.5">
            {filtered.length} transaction{filtered.length === 1 ? '' : 's'}
          </SectionLabel>
        )}
        <QueryState
          query={{ ...transactions, data: filtered }}
          errorMessage="We could not load your transactions."
          empty={{ icon: 'ph-receipt', title: 'Nothing here yet' }}
        >
          {(list) => (
            <div className="bg-white border border-line rounded-2xl overflow-hidden">
              {list.map((t, i) => (
                <TransactionRow key={t.id} t={t} isLast={i === list.length - 1} />
              ))}
            </div>
          )}
        </QueryState>
      </div>
    </Screen>
  )
}
