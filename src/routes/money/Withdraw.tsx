import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { PageHeader } from '../../components/chrome/PageHeader'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Alert } from '../../components/ui/Alert'
import { Badge } from '../../components/ui/Badge'
import { SectionLabel } from '../../components/ui/SectionLabel'
import { ListSkeleton } from '../../components/system/States'
import {
  resolvePayoutAccount,
  useConfirmPayoutAccount,
  usePayoutAccount,
  usePayoutBanks,
  useRequestWithdrawal,
  useSavePayoutAccount,
  useMyLimits,
  useWalletSummary,
  useWithdrawals,
} from '../../lib/api'
import { friendlyError } from '../../lib/supabase'
import { formatDateTime, formatNaira, parseNaira } from '../../lib/format'
import type { PayoutAccount } from '../../lib/database.types'
import { useT } from '../../lib/i18n'

const MIN = 1000

/**
 * Withdrawals leave the balance immediately. To an account the bank has
 * confirmed through Paystack, they are sent automatically by Paystack
 * Transfers, up to a limit finance sets; anything else is sent by the
 * FindWork team, usually the same working day.
 */
export function Withdraw() {
  const t = useT()
  const { data: account, isLoading } = usePayoutAccount()
  const [editing, setEditing] = useState(false)

  return (
    <Screen>
      <PageHeader title={t('Withdraw')} back="/wallet" />
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

/** With Paystack set up, the bank confirms the account; without it, people type their details for staff to check. */
function BankForm({ account, onDone }: { account: PayoutAccount | null; onDone: () => void }) {
  const banks = usePayoutBanks()
  if (banks.isLoading) return <div className="mt-5"><ListSkeleton rows={2} /></div>
  if (banks.data) return <ConfirmedBankForm banks={banks.data} account={account} onDone={onDone} />
  return <TypedBankForm account={account} onDone={onDone} />
}

function ConfirmedBankForm({ banks, account, onDone }: { banks: { name: string; code: string }[]; account: PayoutAccount | null; onDone: () => void }) {
  const t = useT()
  const confirm = useConfirmPayoutAccount()
  const [bankCode, setBankCode] = useState(account?.bank_code ?? '')
  const [number, setNumber] = useState(account?.account_number ?? '')
  const [found, setFound] = useState<{ key: string; name: string | null; error: string | null } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const digits = number.replace(/\D/g, '')
  const key = `${bankCode}:${digits}`
  const ready = bankCode !== '' && digits.length === 10

  // Ask the bank whose account it is as soon as both are filled in.
  useEffect(() => {
    if (!ready) return
    let cancelled = false
    const timer = setTimeout(() => {
      resolvePayoutAccount(bankCode, digits)
        .then((name) => { if (!cancelled) setFound({ key, name, error: null }) })
        .catch((err) => { if (!cancelled) setFound({ key, name: null, error: friendlyError(err) }) })
    }, 400)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [ready, bankCode, digits, key])

  const current = found?.key === key ? found : null

  async function submit() {
    setError(null)
    try {
      await confirm.mutateAsync({ bankCode, accountNumber: digits })
      onDone()
    } catch (err) {
      setError(friendlyError(err))
    }
  }

  return (
    <>
      <p className="mt-4 text-[15px] leading-[1.55] text-muted">{t('Where should we send your money? Your bank confirms the account name.')}</p>
      <div className="space-y-4 mt-4">
        <label className="block">
          <div className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-muted-2 mb-2">{t('Bank')}</div>
          <select value={bankCode} onChange={(e) => setBankCode(e.target.value)} aria-label={t('Bank')}
            className="w-full bg-white border-[1.5px] border-line rounded-lg h-[52px] px-3 text-[16px] text-ink outline-none">
            <option value="">{t('Choose your bank')}</option>
            {banks.map((b) => <option key={b.code} value={b.code}>{b.name}</option>)}
          </select>
        </label>
        <Input label={t('Account number (NUBAN)')} value={number} onChange={setNumber} placeholder="0123456789" type="tel" />
        {ready && (
          current?.name ? (
            <div className="flex items-center gap-2.5 bg-success-bg rounded-lg p-3 text-[14.5px] text-success-text">
              <i className="ph-fill ph-check-circle text-lg" /> <span><span className="font-semibold">{current.name}</span> {t('— the name your bank has for this account')}</span>
            </div>
          ) : current?.error ? <Alert>{current.error}</Alert>
            : <p className="text-[13.5px] text-muted-2">{t('Checking with your bank…')}</p>
        )}
      </div>
      {error && <Alert className="mt-4">{error}</Alert>}
      <Button onClick={submit} disabled={!current?.name} loading={confirm.isPending} className="mt-5 w-full">
        {t('Save this account')}
      </Button>
      <p className="mt-3 text-[12.5px] leading-[1.45] text-muted-2">{t('Withdrawals to a confirmed account are usually paid within minutes. Larger amounts are checked by our team first.')}</p>
    </>
  )
}

function TypedBankForm({ account, onDone }: { account: PayoutAccount | null; onDone: () => void }) {
  const t = useT()
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
      <p className="mt-4 text-[15px] leading-[1.55] text-muted">{t('Where should we send your money?')}</p>
      <div className="space-y-4 mt-4">
        <Input label={t('Bank')} value={bank} onChange={setBank} placeholder={t('GTBank')} icon="bank" />
        <Input label={t('Account number (NUBAN)')} value={number} onChange={setNumber} placeholder="0123456789" />
        <Input
          label={t('Account name')}
          value={name}
          onChange={setName}
          placeholder={t('As it appears at your bank')}
          hint={t('It must match the name on your FindWork account, or the transfer will be refused.')}
        />
      </div>
      {error && <Alert className="mt-4">{error}</Alert>}
      <Button onClick={submit} disabled={!valid} loading={save.isPending} className="mt-5 w-full">
        {t('Save bank account')}
      </Button>
    </>
  )
}

function WithdrawForm({ account, onChangeAccount }: { account: PayoutAccount; onChangeAccount: () => void }) {
  const t = useT()
  const { data: wallet } = useWalletSummary()
  const request = useRequestWithdrawal()
  const [raw, setRaw] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<number | null>(null)

  const { data: limits } = useMyLimits()
  const balance = wallet?.balance ?? 0
  const amount = parseNaira(raw)
  const left = limits ? Math.max(0, limits.daily_withdrawal - limits.withdrawn_today) : null
  const valid = amount >= MIN && amount <= balance && (left === null || amount <= left)

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
        <div className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-muted-2">{t('Available')}</div>
        <div className="font-display font-bold text-[34px] text-cream mt-1">{formatNaira(balance)}</div>
      </div>

      <SectionLabel className="mt-5 mb-2.5">{t('Send to')}</SectionLabel>
      <div className="flex items-center gap-3 bg-white border border-line rounded-2xl p-4">
        <i className="ph-fill ph-bank text-2xl text-ink" />
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-semibold text-ink">
            {account.bank_name} ···{account.account_number.slice(-4)}
          </div>
          <div className="text-[13px] text-muted-2 truncate">
            {account.account_name}{account.verified_at && <span className="text-success-text"> {t('· confirmed by your bank')}</span>}
          </div>
        </div>
        <button onClick={onChangeAccount} className="text-[14px] font-semibold text-brand-hover">
          {t('Change')}
        </button>
      </div>

      <SectionLabel className="mt-5 mb-2">{t('Amount')}</SectionLabel>
      <div className="flex items-center gap-2 bg-white border-[1.5px] border-line rounded-lg h-[56px] px-4">
        <span className="font-display font-bold text-xl text-ink">₦</span>
        <input
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          inputMode="numeric"
          placeholder={String(balance)}
          aria-label={t('Amount to withdraw')}
          className="flex-1 min-w-0 bg-transparent outline-none font-display font-bold text-xl text-ink placeholder:text-muted-4"
        />
        <button onClick={() => setRaw(String(balance))} className="text-[14px] font-semibold text-brand-hover">
          {t('All')}
        </button>
      </div>
      <p className="mt-2 text-[13px] text-muted-2">
        Minimum {formatNaira(MIN)}. {account.verified_at
          ? 'Usually paid within minutes; larger amounts are checked by our team first.'
          : 'Sent to your bank by our team, usually the same working day.'}
      </p>

      {sent !== null && (
        <Alert tone="success" className="mt-4">
          {formatNaira(sent)} is on its way. You will get a notification when it has been sent.
        </Alert>
      )}
      {limits && (
        <p className="mt-1.5 text-[13px] text-muted-2">
          {limits.label}: up to {formatNaira(limits.daily_withdrawal)} a day, {formatNaira(left ?? 0)} left today.
          {limits.tier < 3 && <> <Link to="/get-verified" className="font-semibold text-brand-hover">{t('Raise your limit')}</Link></>}
        </p>
      )}
      {amount > balance && <Alert className="mt-4">{t('That is more than your balance.')}</Alert>}
      {left !== null && amount <= balance && amount > left && <Alert className="mt-4">{t('That is more than you can withdraw today.')}</Alert>}
      {error && <Alert className="mt-4">{error}</Alert>}

      <Button onClick={submit} disabled={!valid} loading={request.isPending} className="mt-5 w-full">
        Withdraw {amount > 0 ? formatNaira(amount) : ''}
      </Button>
    </>
  )
}

function History() {
  const t = useT()
  const { data } = useWithdrawals()
  if (!data?.length) return null

  return (
    <>
      <SectionLabel className="mt-7 mb-2.5">{t('Past withdrawals')}</SectionLabel>
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
              <Badge tone="success" icon="check-circle">{t('Sent')}</Badge>
            ) : w.status === 'rejected' ? (
              <Badge tone="danger">{t('Returned to wallet')}</Badge>
            ) : w.transfer_status === 'queued' || w.transfer_status === 'sent' ? (
              <Badge tone="warning" icon="paper-plane-tilt">{t('Sending')}</Badge>
            ) : (
              <Badge tone="warning" icon="clock">{t('Processing')}</Badge>
            )}
          </div>
        ))}
      </div>
    </>
  )
}
