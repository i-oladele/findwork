import { useState } from 'react'
import { Screen } from '../../components/chrome/Screen'
import { PageHeader } from '../../components/chrome/PageHeader'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Alert } from '../../components/ui/Alert'
import { Badge } from '../../components/ui/Badge'
import { SectionLabel } from '../../components/ui/SectionLabel'
import { ListSkeleton } from '../../components/system/States'
import {
  usePayoutAccount,
  useRequestWithdrawal,
  useSavePayoutAccount,
  useWalletSummary,
  useWithdrawals,
} from '../../lib/api'
import { friendlyError } from '../../lib/supabase'
import { formatDateTime, formatNaira, parseNaira } from '../../lib/format'
import type { PayoutAccount } from '../../lib/database.types'

const MIN = 1000

/**
 * Withdrawals leave the balance immediately and are sent by the FindWork team
 * (usually the same working day). Sending them automatically through
 * Paystack Transfers is the next step once a live Paystack account exists.
 */
export function Withdraw() {
  const { data: account, isLoading } = usePayoutAccount()
  const [editing, setEditing] = useState(false)

  return (
    <Screen>
      <PageHeader title="Withdraw" back="/wallet" />
      <div className="px-[22px] pb-8">
        {isLoading ? (
          <div className="mt-5">
            <ListSkeleton rows={2} />
          </div>
        ) : !account || editing ? (
          <BankForm account={account ?? null} onDone={() => setEditing(false)} />
        ) : (
          <WithdrawForm account={account} onChangeAccount={() => setEditing(true)} />
        )}
        <History />
      </div>
    </Screen>
  )
}

function BankForm({ account, onDone }: { account: PayoutAccount | null; onDone: () => void }) {
  const save = useSavePayoutAccount()
  const [bank, setBank] = useState(account?.bank_name ?? '')
  const [number, setNumber] = useState(account?.account_number ?? '')
  const [name, setName] = useState(account?.account_name ?? '')
  const [error, setError] = useState<string | null>(null)

  const digits = number.replace(/\D/g, '')
  const valid = bank.trim().length > 1 && digits.length === 10 && name.trim().length > 2

  async function submit() {
    setError(null)
    try {
      await save.mutateAsync({ bank_name: bank.trim(), account_number: digits, account_name: name.trim() })
      onDone()
    } catch (err) {
      setError(friendlyError(err))
    }
  }

  return (
    <>
      <p className="mt-4 text-[15px] leading-[1.55] text-muted">Where should we send your money?</p>
      <div className="space-y-4 mt-4">
        <Input label="Bank" value={bank} onChange={setBank} placeholder="GTBank" icon="bank" />
        <Input label="Account number (NUBAN)" value={number} onChange={setNumber} placeholder="0123456789" />
        <Input
          label="Account name"
          value={name}
          onChange={setName}
          placeholder="As it appears at your bank"
          hint="It must match the name on your FindWork account, or the transfer will be refused."
        />
      </div>
      {error && <Alert className="mt-4">{error}</Alert>}
      <Button onClick={submit} disabled={!valid} loading={save.isPending} className="mt-5 w-full">
        Save bank account
      </Button>
    </>
  )
}

function WithdrawForm({ account, onChangeAccount }: { account: PayoutAccount; onChangeAccount: () => void }) {
  const { data: wallet } = useWalletSummary()
  const request = useRequestWithdrawal()
  const [raw, setRaw] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<number | null>(null)

  const balance = wallet?.balance ?? 0
  const amount = parseNaira(raw)
  const valid = amount >= MIN && amount <= balance

  async function submit() {
    if (!window.confirm(`Send ${formatNaira(amount)} to ${account.bank_name} ···${account.account_number.slice(-4)}?`)) return
    setError(null)
    try {
      await request.mutateAsync(amount)
      setSent(amount)
      setRaw('')
    } catch (err) {
      setError(friendlyError(err))
    }
  }

  return (
    <>
      <div className="bg-ink rounded-2xl p-[18px] mt-4">
        <div className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-muted-2">Available</div>
        <div className="font-display font-bold text-[34px] text-cream mt-1">{formatNaira(balance)}</div>
      </div>

      <SectionLabel className="mt-5 mb-2.5">Send to</SectionLabel>
      <div className="flex items-center gap-3 bg-white border border-line rounded-2xl p-4">
        <i className="ph-fill ph-bank text-2xl text-ink" />
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-semibold text-ink">
            {account.bank_name} ···{account.account_number.slice(-4)}
          </div>
          <div className="text-[13px] text-muted-2 truncate">{account.account_name}</div>
        </div>
        <button onClick={onChangeAccount} className="text-[14px] font-semibold text-brand-hover">
          Change
        </button>
      </div>

      <SectionLabel className="mt-5 mb-2">Amount</SectionLabel>
      <div className="flex items-center gap-2 bg-white border-[1.5px] border-line rounded-lg h-[56px] px-4">
        <span className="font-display font-bold text-xl text-ink">₦</span>
        <input
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          inputMode="numeric"
          placeholder={String(balance)}
          aria-label="Amount to withdraw"
          className="flex-1 min-w-0 bg-transparent outline-none font-display font-bold text-xl text-ink placeholder:text-muted-4"
        />
        <button onClick={() => setRaw(String(balance))} className="text-[14px] font-semibold text-brand-hover">
          All
        </button>
      </div>
      <p className="mt-2 text-[13px] text-muted-2">
        Minimum {formatNaira(MIN)}. Sent to your bank by our team, usually the same working day.
      </p>

      {sent !== null && (
        <Alert tone="success" className="mt-4">
          {formatNaira(sent)} is on its way. You will get a notification when it has been sent.
        </Alert>
      )}
      {amount > balance && <Alert className="mt-4">That is more than your balance.</Alert>}
      {error && <Alert className="mt-4">{error}</Alert>}

      <Button onClick={submit} disabled={!valid} loading={request.isPending} className="mt-5 w-full">
        Withdraw {amount > 0 ? formatNaira(amount) : ''}
      </Button>
    </>
  )
}

function History() {
  const { data } = useWithdrawals()
  if (!data?.length) return null

  return (
    <>
      <SectionLabel className="mt-7 mb-2.5">Past withdrawals</SectionLabel>
      <div className="bg-white border border-line rounded-2xl overflow-hidden">
        {data.map((w, i) => (
          <div key={w.id} className={`flex items-center gap-3 p-3.5 ${i < data.length - 1 ? 'border-b border-line-soft' : ''}`}>
            <div className="flex-1 min-w-0">
              <div className="text-[15px] font-semibold text-ink">{formatNaira(w.amount)}</div>
              <div className="text-[12.5px] text-muted-2 mt-0.5 truncate">
                {w.bank_name} ···{w.account_number.slice(-4)} · {formatDateTime(w.created_at)}
              </div>
              {w.status === 'rejected' && w.note && <div className="text-[12.5px] text-danger mt-1">{w.note}</div>}
            </div>
            {w.status === 'paid' ? (
              <Badge tone="success" icon="check-circle">Sent</Badge>
            ) : w.status === 'rejected' ? (
              <Badge tone="danger">Returned to wallet</Badge>
            ) : (
              <Badge tone="warning" icon="clock">Processing</Badge>
            )}
          </div>
        ))}
      </div>
    </>
  )
}
