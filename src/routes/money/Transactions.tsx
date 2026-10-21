import { useState } from 'react'
import { Screen } from '../../components/chrome/Screen'
import { PageHeader } from '../../components/chrome/PageHeader'
import { Chip } from '../../components/ui/Chip'
import { SectionLabel } from '../../components/ui/SectionLabel'
import { TransactionRow } from '../../components/ui/TransactionRow'
import { QueryState } from '../../components/system/QueryState'
import { useTransactions } from '../../lib/api'
import type { WalletTransaction } from '../../lib/database.types'
import { useT } from '../../lib/i18n'

const filters = ['All', 'In', 'Out', 'Escrow'] as const
type Filter = (typeof filters)[number]

function matches(tx: WalletTransaction, f: Filter) {
  if (f === 'In') return tx.balance_delta > 0
  if (f === 'Out') return tx.balance_delta < 0 && tx.kind !== 'escrow'
  if (f === 'Escrow') return tx.escrow_delta !== 0
  return true
}

export function Transactions() {
  const t = useT()
  const [filter, setFilter] = useState<Filter>('All')
  const transactions = useTransactions(200)
  const filtered = transactions.data?.filter((tx) => matches(tx, filter))

  return (
    <Screen>
      <PageHeader title={t('Transactions')} back="/wallet" />
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
          errorMessage={t('We could not load your transactions.')}
          empty={{ icon: 'ph-receipt', title: 'Nothing here yet' }}
        >
          {(list) => (
            <div className="bg-white border border-line rounded-2xl overflow-hidden">
              {list.map((tx, i) => (
                <TransactionRow key={tx.id} t={tx} isLast={i === list.length - 1} />
              ))}
            </div>
          )}
        </QueryState>
      </div>
    </Screen>
  )
}
