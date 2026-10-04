import { useState } from 'react'
import { Screen } from '../../components/chrome/Screen'
import { PageHeader } from '../../components/chrome/PageHeader'
import { Button } from '../../components/ui/Button'
import { Alert } from '../../components/ui/Alert'
import { PhoneInput } from '../../components/ui/PhoneInput'
import { QueryState } from '../../components/system/QueryState'
import { useAddresses, useDeleteAddress, useSaveAddress, type AddressInput } from '../../lib/api'
import type { SavedAddress } from '../../lib/database.types'
import { friendlyError } from '../../lib/supabase'
import { emptyPhone, formatPhone, fromInternational, isPhoneNumber, toE164 } from '../../lib/phone'

export function Addresses() {
  const query = useAddresses()
  const save = useSaveAddress()
  const remove = useDeleteAddress()
  const [editing, setEditing] = useState<SavedAddress | 'new' | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const pending = save.isPending || remove.isPending

  async function action(fn: () => Promise<unknown>) {
    setError(null)
    try { await fn(); setDeleting(null) } catch (err) { setError(friendlyError(err)) }
  }

  return (
    <Screen>
      <PageHeader title="Delivery addresses" back="/settings" />
      <div className="px-[22px] pb-8 space-y-4">
        <p className="text-sm text-muted">Save up to 20 addresses. Your default is selected at checkout. Addresses are private.</p>
        {error && <Alert>{error}</Alert>}
        {editing ? <AddressForm key={editing === 'new' ? 'new' : editing.id}
          address={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} /> : (
          <Button onClick={() => setEditing('new')} disabled={pending || (query.data?.length ?? 0) >= 20}>Add address</Button>
        )}
        <QueryState query={query} errorMessage="We could not load your addresses."
          empty={{ title: 'No saved addresses', body: 'Add your home, workplace or another delivery address.' }}>
          {(addresses) => addresses.map((a) => (
            <article key={a.id} className="bg-white border border-line rounded-2xl p-4 space-y-2">
              <h3 className="font-semibold text-ink">{a.label}{a.is_default && <span className="ml-2 text-sm text-success">Default</span>}</h3>
              <p>{a.recipient}</p><p className="text-sm whitespace-pre-wrap">{a.address}</p>
              <p className="text-sm text-muted">{formatPhone(a.phone)}</p>
              <div className="flex flex-wrap gap-4 text-sm font-semibold">
                <button disabled={pending} onClick={() => { setEditing(a); setDeleting(null) }} className="min-h-11">Edit</button>
                {!a.is_default && <button disabled={pending} className="min-h-11" onClick={() => void action(() => save.mutateAsync({ ...a, is_default: true }))}>Make default</button>}
                <button disabled={pending} className="min-h-11 text-brand" onClick={() => setDeleting(a.id)}>Delete</button>
              </div>
              {deleting === a.id && <div className="border-t border-line pt-3 text-sm">
                <p>Delete “{a.label}”? Existing orders keep their delivery address.</p>
                <div className="flex gap-4 mt-2">
                  <button disabled={pending} className="min-h-11 text-brand font-semibold" onClick={() => void action(() => remove.mutateAsync(a.id))}>Confirm delete</button>
                  <button disabled={pending} className="min-h-11" onClick={() => setDeleting(null)}>Keep address</button>
                </div>
              </div>}
            </article>
          ))}
        </QueryState>
      </div>
    </Screen>
  )
}

function AddressForm({ address, onClose }: { address?: SavedAddress; onClose: () => void }) {
  const save = useSaveAddress()
  const [label, setLabel] = useState(address?.label ?? '')
  const [recipient, setRecipient] = useState(address?.recipient ?? '')
  const [phone, setPhone] = useState(fromInternational(address?.phone ?? '') ?? emptyPhone())
  const [street, setStreet] = useState(address?.address ?? '')
  const [isDefault, setDefault] = useState(address?.is_default ?? false)
  const [error, setError] = useState<string | null>(null)
  const valid = label.trim().length > 0 && recipient.trim().length > 0 && street.trim().length >= 6 && isPhoneNumber(phone)
  async function submit() {
    if (!valid || save.isPending) return
    setError(null)
    const input: AddressInput = { id: address?.id, label, recipient, phone: toE164(phone), address: street, is_default: isDefault }
    try { await save.mutateAsync(input); onClose() } catch (err) { setError(friendlyError(err)) }
  }
  const inputClass = 'mt-1 w-full rounded-lg border border-line bg-white p-3 text-ink'
  return (
    <form className="bg-cream border border-line rounded-2xl p-4 space-y-4" onSubmit={(e) => { e.preventDefault(); void submit() }}>
      <h3 className="font-semibold">{address ? 'Edit address' : 'New address'}</h3>
      <label className="block text-sm">Label<input required maxLength={40} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Home or work" className={inputClass} /></label>
      <label className="block text-sm">Recipient<input required maxLength={120} autoComplete="name" value={recipient} onChange={(e) => setRecipient(e.target.value)} className={inputClass} /></label>
      <PhoneInput value={phone} onChange={setPhone} />
      <label className="block text-sm">Address<textarea required minLength={6} maxLength={500} autoComplete="street-address" value={street} onChange={(e) => setStreet(e.target.value)} rows={3} className={inputClass} /></label>
      <label className="flex gap-2 items-center min-h-11 text-sm"><input type="checkbox" checked={isDefault} disabled={address?.is_default} onChange={(e) => setDefault(e.target.checked)} />Default delivery address</label>
      {error && <Alert>{error}</Alert>}
      <div className="flex gap-4"><Button type="submit" disabled={!valid} loading={save.isPending}>Save address</Button>
        <button type="button" disabled={save.isPending} onClick={onClose}>Cancel</button></div>
    </form>
  )
}
