import { formatDateTime, formatNaira } from '../../lib/format'
import type { WalletKind, WalletTransaction } from '../../lib/database.types'

const META: Record<WalletKind, { icon: string; bg: string; color: string }> = {
  escrow: { icon: 'lock-simple', bg: 'bg-[#FBE2DC]', color: 'text-[#A8311F]' },
  release: { icon: 'arrow-down-left', bg: 'bg-success-bg', color: 'text-success-text' },
  order: { icon: 'shopping-cart', bg: 'bg-cream', color: 'text-ink' },
  topup: { icon: 'bank', bg: 'bg-success-bg', color: 'text-success-text' },
  fee: { icon: 'receipt', bg: 'bg-warning-bg', color: 'text-warning-text' },
  subscription: { icon: 'crown', bg: 'bg-warning-bg', color: 'text-warning-text' },
  refund: { icon: 'arrow-counter-clockwise', bg: 'bg-success-bg', color: 'text-success-text' },
  course: { icon: 'graduation-cap', bg: 'bg-cream', color: 'text-ink' },
  withdrawal: { icon: 'arrow-up-right', bg: 'bg-cream', color: 'text-ink' },
  adjustment: { icon: 'sliders-horizontal', bg: 'bg-cream', color: 'text-ink' },
}

/**
 * What a ledger row means to the person reading it. Most rows move spendable
 * balance; a release on the customer's side only clears escrow (the cash left
 * their balance when they booked), so it shows the escrow amount instead.
 */
function displayAmount(t: WalletTransaction) {
  return t.balance_delta !== 0 ? t.balance_delta : t.escrow_delta
}

export function TransactionRow({ t, isLast }: { t: WalletTransaction; isLast: boolean }) {
  const meta = META[t.kind]
  const amount = displayAmount(t)
  const escrowOnly = t.balance_delta === 0 && t.escrow_delta !== 0

  return (
    <div className={`flex items-center gap-3.5 p-3.5 ${isLast ? '' : 'border-b border-line-soft'}`}>
      <span className={`flex-none inline-flex items-center justify-center w-10 h-10 rounded-[10px] ${meta.bg} ${meta.color}`}>
        <i className={`ph-fill ph-${meta.icon} text-lg`} />
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[15px] font-semibold text-ink truncate">{t.label}</div>
        <div className="text-[12.5px] text-muted-2 mt-0.5">
          {formatDateTime(t.created_at)}
          {escrowOnly ? ' · from escrow' : t.kind === 'escrow' ? ' · into escrow' : ''}
        </div>
      </div>
      <span className={`font-display font-bold text-[15px] whitespace-nowrap ${amount > 0 ? 'text-success-text' : 'text-ink'}`}>
        {amount > 0 ? '+' : ''}
        {formatNaira(amount)}
      </span>
    </div>
  )
}
