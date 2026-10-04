import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { PageHeader } from '../../components/chrome/PageHeader'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { SectionLabel } from '../../components/ui/SectionLabel'
import { TrustBadge } from '../../components/ui/TrustBadge'
import { findTransferRecipient, useMyLimits, useTransferFunds, useWalletSummary, type TransferRecipient } from '../../lib/api'
import { friendlyError } from '../../lib/supabase'
import { formatNaira, parseNaira } from '../../lib/format'

const MIN = 100

/** Send money from your wallet to another FindWork account, found by its phone number or email. */
export function Transfer() {
  const { data: wallet } = useWalletSummary()
  const { data: limits } = useMyLimits()
  const send = useTransferFunds()
  const [contact, setContact] = useState('')
  const [recipient, setRecipient] = useState<TransferRecipient | null>(null)
  const [searching, setSearching] = useState(false)
  const [raw, setRaw] = useState('')
  const [note, setNote] = useState('')
  // One id per attempt: sending again after a dropped connection is safe.
  const [attempt, setAttempt] = useState(() => crypto.randomUUID())
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<{ amount: number; name: string } | null>(null)

  const balance = wallet?.balance ?? 0
  const amount = parseNaira(raw)
  const left = limits ? Math.max(0, limits.daily_transfer - limits.transferred_today) : null
  const valid = Boolean(recipient) && amount >= MIN && amount <= balance && (left === null || amount <= left)

  async function find() {
    setError(null)
    setRecipient(null)
    setSearching(true)
    try {
      const found = await findTransferRecipient(contact)
      if (found) setRecipient(found)
      else setError('Nobody on FindWork has that phone number or email. Check it and try again.')
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setSearching(false)
    }
  }

  async function submit() {
    if (!recipient || !valid) return
    if (!window.confirm(`Send ${formatNaira(amount)} to ${recipient.name}? This cannot be undone.`)) return
    setError(null)
    try {
      await send.mutateAsync({ id: attempt, recipientId: recipient.id, amount, note })
      setSent({ amount, name: recipient.name })
      setRaw(''); setNote(''); setRecipient(null); setContact(''); setAttempt(crypto.randomUUID())
    } catch (err) {
      setError(friendlyError(err))
    }
  }

  return (
    <Screen>
      <PageHeader title="Send money" back="/wallet" />
      <div className="px-[22px] pb-8">
        <div className="bg-ink rounded-2xl p-[18px] mt-4">
          <div className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-muted-2">Available</div>
          <div className="font-display font-bold text-[34px] text-cream mt-1">{formatNaira(balance)}</div>
        </div>

        {sent && <Alert tone="success" className="mt-4">{formatNaira(sent.amount)} sent to {sent.name}.</Alert>}

        <SectionLabel className="mt-5 mb-2">Who to</SectionLabel>
        <Input value={contact} onChange={(v) => { setContact(v); setRecipient(null) }} placeholder="Phone number or email" icon="user" autoCapitalize="none" />
        {recipient ? (
          <div className="flex items-center gap-3 bg-white border border-line rounded-2xl p-4 mt-3">
            <i className="ph-fill ph-check-circle text-2xl text-success" />
            <div className="flex-1 min-w-0">
              <div className="text-[15px] font-semibold text-ink truncate">{recipient.name}</div>
              <div className="mt-1"><TrustBadge tier={recipient.verification_tier} score={null} /></div>
            </div>
          </div>
        ) : (
          <Button variant="secondary" className="mt-3 h-12 text-ink" onClick={find} disabled={contact.trim().length < 6} loading={searching}>Find account</Button>
        )}

        {recipient && (
          <>
            <SectionLabel className="mt-5 mb-2">Amount</SectionLabel>
            <div className="flex items-center gap-2 bg-white border-[1.5px] border-line rounded-lg h-[56px] px-4">
              <span className="font-display font-bold text-xl text-ink">₦</span>
              <input value={raw} onChange={(e) => { setRaw(e.target.value); setAttempt(crypto.randomUUID()) }} inputMode="numeric" placeholder="5000" aria-label="Amount to send"
                className="flex-1 min-w-0 bg-transparent outline-none font-display font-bold text-xl text-ink placeholder:text-muted-4" />
            </div>
            <div className="mt-4"><Input label="Note (optional)" value={note} onChange={setNote} placeholder="What it is for" /></div>
            {limits && (
              <p className="mt-2 text-[13px] text-muted-2">
                {limits.label}: up to {formatNaira(limits.daily_transfer)} a day, {formatNaira(left ?? 0)} left today.
                {limits.tier < 3 && <> <Link to="/get-verified" className="font-semibold text-brand-hover">Raise your limit</Link></>}
              </p>
            )}
            <p className="mt-2 text-[13px] leading-[1.45] text-muted-2">
              A transfer is a gift between accounts: it is not held in escrow and FindWork cannot reverse it. Pay for work or goods through a booking or an order instead.
            </p>
            {amount > balance && <Alert className="mt-4">That is more than your balance.</Alert>}
            {left !== null && amount <= balance && amount > left && <Alert className="mt-4">That is more than you can send today.</Alert>}
          </>
        )}
        {error && <Alert className="mt-4">{error}</Alert>}
        {recipient && <Button onClick={submit} disabled={!valid} loading={send.isPending} className="mt-5">Send {amount >= MIN ? formatNaira(amount) : 'money'}</Button>}
      </div>
    </Screen>
  )
}
