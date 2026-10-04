import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { PageHeader } from '../../components/chrome/PageHeader'
import { RequireProvider } from '../../components/system/RequireProvider'
import { QueryState } from '../../components/system/QueryState'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { PortfolioAsset } from '../../components/ui/PortfolioAsset'
import { usePortfolio, useRemovePortfolioItem, useSavePortfolioItem } from '../../lib/api'
import { PORTFOLIO_LIMIT, PORTFOLIO_MIME, validatePortfolioFile, type PortfolioKind } from '../../lib/portfolio'
import { friendlyError } from '../../lib/supabase'
import type { ProviderMedia } from '../../lib/database.types'

export function Portfolio() {
  return <RequireProvider>{(p) => <PortfolioManager providerId={p.id} />}</RequireProvider>
}

function PortfolioManager({ providerId }: { providerId: string }) {
  const query = usePortfolio(providerId)
  const remove = useRemovePortfolioItem()
  const [editing, setEditing] = useState<ProviderMedia | 'new' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  return <Screen>
    <PageHeader title="Portfolio & credentials" back="/provider" />
    <div className="px-[22px] pb-8 space-y-4">
      <p className="text-sm text-muted">Show examples of your work and professional credentials. Published items are visible to other signed-in users. Remove personal ID numbers before uploading.</p>
      <Link to="/work-profile" className="block text-sm text-brand underline">Edit profile and cover photos</Link>
      {error && <Alert>{error}</Alert>}
      {editing ? <PortfolioForm key={editing === 'new' ? 'new' : editing.id} item={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} /> : (
        <Button disabled={query.isLoading || query.isError || (query.data?.length ?? 0) >= PORTFOLIO_LIMIT} onClick={() => setEditing('new')}>Add portfolio item</Button>
      )}
      <QueryState query={query} errorMessage="We could not load your portfolio." empty={{ title: 'Show what you can do', body: 'Add an image, a short video or a professional credential.' }}>
        {(items) => items.map((item) => <article key={item.id} className="bg-white border border-line rounded-2xl p-4">
          <PortfolioAsset item={item} />
          <div className="flex gap-5 mt-2 text-sm font-semibold">
            <button disabled={remove.isPending} className="min-h-11" onClick={() => setEditing(item)}>Edit details</button>
            <button disabled={remove.isPending} className="min-h-11 text-brand" onClick={() => setDeleting(item.id)}>Remove</button>
          </div>
          {deleting === item.id && <div className="text-sm border-t border-line pt-3">
            <p>Remove this item from your profile?</p><div className="flex gap-5">
              <button disabled={remove.isPending} className="min-h-11 text-brand font-semibold" onClick={async () => {
                setError(null)
                try {
                  const result = await remove.mutateAsync(item.id)
                  if (result.cleanupPending) setError('The item is no longer published. File cleanup is still pending; contact support if you need it removed from storage.')
                  setDeleting(null)
                  if (editing !== 'new' && editing?.id === item.id) setEditing(null)
                } catch (err) { setError(friendlyError(err)) }
              }}>Confirm remove</button>
              <button disabled={remove.isPending} onClick={() => setDeleting(null)}>Keep item</button>
            </div>
          </div>}
        </article>)}
      </QueryState>
    </div>
  </Screen>
}

function PortfolioForm({ item, onClose }: { item?: ProviderMedia; onClose: () => void }) {
  const save = useSavePortfolioItem()
  const [kind, setKind] = useState<PortfolioKind>(item?.kind ?? 'image')
  const [title, setTitle] = useState(item?.title ?? '')
  const [description, setDescription] = useState(item?.description ?? '')
  const [file, setFile] = useState<File | undefined>()
  const [error, setError] = useState<string | null>(null)
  const field = 'block w-full mt-1 p-3 border border-line rounded-lg bg-white'
  return <form className="p-4 border border-line rounded-2xl space-y-4" onSubmit={async (e) => {
    e.preventDefault()
    if (save.isPending) return
    setError(null)
    try { await save.mutateAsync({ id: item?.id, path: item?.path, file, kind, title, description }); onClose() }
    catch (err) { setError(friendlyError(err)) }
  }}>
    <label className="block text-sm">Item type<select disabled={Boolean(item) || save.isPending} value={kind} onChange={(e) => { setKind(e.target.value as PortfolioKind); setFile(undefined) }} className={field}>
      <option value="image">Work photo</option><option value="video">Work video</option><option value="certificate">Professional credential</option>
    </select></label>
    <label className="block text-sm">Title<input required maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} className={field} /></label>
    <label className="block text-sm">Description<textarea maxLength={1000} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} className={field} /></label>
    {!item && <label className="block text-sm">File (up to 40 MB)<input key={kind} type="file" accept={PORTFOLIO_MIME[kind].join(',')} className={field} disabled={save.isPending} onChange={(e) => {
      const selected = e.target.files?.[0]
      setFile(undefined); setError(null)
      if (!selected) return
      try { validatePortfolioFile(selected, kind); setFile(selected) } catch (err) { setError(friendlyError(err)); e.target.value = '' }
    }} /></label>}
    {error && <Alert>{error}</Alert>}
    <div className="flex gap-4"><Button type="submit" disabled={!title.trim() || (!item && !file)} loading={save.isPending}>{item ? 'Save details' : 'Publish item'}</Button>
      <button type="button" disabled={save.isPending} onClick={onClose}>Cancel</button></div>
  </form>
}
