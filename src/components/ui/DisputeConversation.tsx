import { useState } from 'react'
import { useAuth } from '../../lib/authContext'
import { useDisputeResponses, useRespondToDispute } from '../../lib/api/disputes'
import { formatDateTime } from '../../lib/format'
import { friendlyError } from '../../lib/supabase'
import { QueryState } from '../system/QueryState'
import { EvidenceGallery } from './PrivateAttachment'
import { PhotoPicker } from './PhotoPicker'
import { Button } from './Button'
import { Alert } from './Alert'

export function DisputeConversation({ disputeId, open }: { disputeId: string; open: boolean }) {
  const { user } = useAuth()
  const responses = useDisputeResponses(disputeId)
  const send = useRespondToDispute()
  const [body, setBody] = useState('')
  const [photos, setPhotos] = useState<string[]>([])
  const [id, setId] = useState(() => crypto.randomUUID())
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  return <section className="mt-5 border-t border-line pt-4">
    <h3 className="font-display font-semibold text-lg">Responses & shared evidence</h3>
    <QueryState query={responses} errorMessage="We could not load the case responses." skeletonRows={1}
      empty={{ title: 'No responses yet' }}>
      {(messages) => <ol className="mt-3 space-y-3">{messages.map((m) => <li key={m.id} className="bg-cream border border-line rounded-xl p-3">
        <div className="text-xs text-muted">{m.author_id === user?.id ? 'You' : m.author_role === 'moderator' ? 'FindWork moderator' : m.author_role === 'claimant' ? 'Person who reported this' : 'Other participant'} · {formatDateTime(m.created_at)}</div>
        {m.body && <p className="mt-2 text-sm whitespace-pre-wrap">{m.body}</p>}
        {!!m.evidence_paths.length && <EvidenceGallery paths={m.evidence_paths} />}
      </li>)}</ol>}
    </QueryState>
    {open && <form className="mt-4 space-y-3" onSubmit={async (e) => {
      e.preventDefault()
      if (uploading || send.isPending || (!body.trim() && !photos.length)) return
      setError(null)
      try {
        await send.mutateAsync({ id, disputeId, body, evidencePaths: photos })
        setBody(''); setPhotos([]); setId(crypto.randomUUID())
      } catch (err) { setError(friendlyError(err)) }
    }}>
      <p className="text-sm text-muted">Your response and these photos will be shared with the other participant and FindWork moderators. Submitted responses become part of the case history.</p>
      <label className="block text-sm">Your response<textarea aria-label="Your dispute response" value={body} onChange={(e) => { setBody(e.target.value); setId(crypto.randomUUID()) }} maxLength={2000} rows={3} disabled={send.isPending} className="block mt-1 w-full border border-line rounded-xl p-3 bg-white" /></label>
      <fieldset disabled={send.isPending}><PhotoPicker bucket="dispute-evidence" value={photos} onChange={(value) => { setPhotos(value); setId(crypto.randomUUID()) }} onError={setError} onUploadingChange={setUploading} max={4} /></fieldset>
      {error && <Alert>{error}</Alert>}
      <Button type="submit" loading={send.isPending} disabled={uploading || (!body.trim() && !photos.length)}>Send response</Button>
    </form>}
  </section>
}
