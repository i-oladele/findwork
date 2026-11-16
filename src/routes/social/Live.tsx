import { lazy, Suspense, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { PageHeader } from '../../components/chrome/PageHeader'
import { Alert } from '../../components/ui/Alert'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { PlaceholderImage } from '../../components/ui/PlaceholderImage'
import { BlockUserButton } from '../../components/ui/BlockUserButton'
import { ReportButton } from '../../components/ui/ReportButton'
import { SectionLabel } from '../../components/ui/SectionLabel'
import { QueryState } from '../../components/system/QueryState'
import { RequireProvider } from '../../components/system/RequireProvider'
import { EmptyState, FullScreenLoader } from '../../components/system/States'
import { useAuth } from '../../lib/authContext'
import {
  productImage,
  useMyProducts,
  useRemoveStreamMessage,
  useScheduleStream,
  useSendStreamMessage,
  useStream,
  useStreamMessages,
  useStreamProducts,
  useStreams,
  useLiveVideoAllowance,
  useLiveVideoAvailable,
  useStreamViewers,
  useUpdateStream,
  type StreamWithSeller,
} from '../../lib/api'
import { friendlyError } from '../../lib/supabase'
import { formatDateTime, formatNaira } from '../../lib/format'
import { allowanceSummary, cameraAvailability, ENDED_REASON, minutesLeft, playbackFor, type LiveVideoAllowance } from '../../lib/stream'
import { useCart } from '../../store/cart'

// The video client is large; it loads only on a stream that FindWork carries.
const LiveBroadcast = lazy(() => import('../../components/ui/LiveVideo').then((m) => ({ default: m.LiveBroadcast })))
const LiveWatch = lazy(() => import('../../components/ui/LiveVideo').then((m) => ({ default: m.LiveWatch })))
const videoLoading = <div className="bg-ink rounded-2xl py-16 text-center text-[14px] text-muted-3">Loading the video…</div>

/** Sellers who are live now, and streams coming up. */
export function Streams() {
  const streams = useStreams()
  return (
    <Screen bottomNav="customer">
      <PageHeader title="Live selling" back="/feed" right={<Link to="/live/new" className="text-[14.5px] font-semibold text-brand-hover">Go live</Link>} />
      <div className="px-[22px] pb-8">
        <QueryState query={streams} errorMessage="We could not load streams." empty={{ icon: 'ph-broadcast', title: 'Nobody is live right now', body: 'Save a seller to hear when they go live.' }}>
          {(rows) => rows.map((s) => (
            <Link key={s.id} to={`/live/${s.id}`} className="flex gap-3.5 bg-white border border-line rounded-2xl p-4 mt-3">
              <PlaceholderImage src={s.seller?.photo_urls?.[0]} className="w-14 h-14 flex-none" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-display font-semibold text-[15.5px] text-ink truncate">{s.title}</span>
                  {s.status === 'live' ? <Badge tone="danger" icon="broadcast">Live</Badge> : <Badge tone="neutral">Soon</Badge>}
                </div>
                <div className="text-[13px] text-muted-2 mt-0.5">{s.seller?.business_name}</div>
                {s.status === 'scheduled' && s.scheduled_for && <div className="text-[12.5px] text-muted-2">{formatDateTime(s.scheduled_for)}</div>}
              </div>
            </Link>
          ))}
        </QueryState>
      </div>
    </Screen>
  )
}

export function NewStream() {
  return <RequireProvider>{() => <StreamForm />}</RequireProvider>
}

function StreamForm() {
  const navigate = useNavigate()
  const schedule = useScheduleStream()
  const { data: products } = useMyProducts()
  const { data: liveVideo } = useLiveVideoAvailable()
  const { data: allowance } = useLiveVideoAllowance(Boolean(liveVideo))
  const camera = allowance ? cameraAvailability(allowance) : { ok: true as const }
  const [video, setVideo] = useState<'livekit' | 'link' | null>(null)
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [when, setWhen] = useState('')
  const [chosen, setChosen] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const live = (products ?? []).filter((p) => p.status === 'live')
  // FindWork carries the video when it can; a pasted link is the other choice,
  // and the only one once this month's live video is used up.
  const source = camera.ok ? (video ?? (liveVideo ? 'livekit' : 'link')) : 'link'
  const valid = title.trim().length >= 3 && (source === 'livekit' || /^https:\/\/\S+$/.test(url.trim()))

  return (
    <Screen>
      <PageHeader title="Set up a live sale" back="/live" icon="x" />
      <div className="px-[22px] pb-8 space-y-4">
        <Input label="Title" value={title} onChange={setTitle} placeholder="Friday fabric sale" />
        {liveVideo && (
          <fieldset>
            <legend className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-muted-2 mb-2">Video</legend>
            <div className="flex flex-wrap gap-2">
              <button type="button" aria-pressed={source === 'livekit'} disabled={!camera.ok} onClick={() => setVideo('livekit')}
                className={`rounded-full px-[15px] py-2 text-[13.5px] disabled:opacity-50 ${source === 'livekit' ? 'bg-ink text-white font-semibold' : 'bg-white border border-line text-ink font-medium'}`}>From this phone&apos;s camera</button>
              <button type="button" aria-pressed={source === 'link'} onClick={() => setVideo('link')}
                className={`rounded-full px-[15px] py-2 text-[13.5px] ${source === 'link' ? 'bg-ink text-white font-semibold' : 'bg-white border border-line text-ink font-medium'}`}>A link from another app</button>
            </div>
            {!camera.ok && <p className="mt-2 text-[13px] leading-[1.45] text-text-soft">{camera.reason}</p>}
          </fieldset>
        )}
        {source === 'livekit' ? (
          <>
            <Alert tone="info">You broadcast from your camera inside FindWork, and viewers watch beside the chat and your products. You can check your camera before going live.</Alert>
            {allowance && <AllowanceNote a={allowance} />}
          </>
        ) : (
          <>
            <Alert tone="info">FindWork runs the selling room: the chat, your pinned products and checkout. The video comes from the app you broadcast with (YouTube Live, or any service that gives you a watch link). Paste that link below.</Alert>
            <Input label="Link where people watch the video" value={url} onChange={setUrl} placeholder="https://youtube.com/live/…" autoCapitalize="none" hint="YouTube links and direct video links play inside FindWork; other links open in a new tab." />
          </>
        )}
        <label className="block text-[14px] text-text-soft">When (optional)
          <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="block w-full mt-1.5 bg-white border-[1.5px] border-line rounded-lg h-[52px] px-3.5 text-ink" />
        </label>
        {live.length > 0 && (
          <fieldset>
            <legend className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-muted-2 mb-2">Products you will sell</legend>
            {live.map((p) => (
              <label key={p.id} className="flex items-center gap-3 min-h-11 text-[14.5px] text-ink">
                <input type="checkbox" checked={chosen.includes(p.id)} className="w-5 h-5 accent-[var(--color-brand)]"
                  onChange={(e) => setChosen((all) => (e.target.checked ? [...all, p.id] : all.filter((id) => id !== p.id)))} />
                <span className="flex-1 truncate">{p.name}</span><span className="text-muted">{formatNaira(p.price)}</span>
              </label>
            ))}
          </fieldset>
        )}
        {error && <Alert>{error}</Alert>}
        <Button disabled={!valid} loading={schedule.isPending} onClick={async () => {
          setError(null)
          try {
            const id = await schedule.mutateAsync({
              title: title.trim(), video: source, playbackUrl: source === 'link' ? url.trim() : null,
              scheduledFor: when ? new Date(when).toISOString() : null, productIds: chosen.slice(0, 20),
            })
            navigate(`/live/${id}`, { replace: true })
          } catch (err) { setError(friendlyError(err)) }
        }}>Create the stream</Button>
      </div>
    </Screen>
  )
}

export function StreamRoom() {
  const { id } = useParams<{ id: string }>()
  const stream = useStream(id)
  if (stream.isLoading) return <FullScreenLoader />
  if (!stream.data) return <Screen><PageHeader title="Live" back="/live" /><EmptyState icon="ph-broadcast" title="Stream not found" /></Screen>
  return <Room s={stream.data} />
}

function Room({ s }: { s: StreamWithSeller }) {
  const { user } = useAuth()
  const isLive = s.status === 'live'
  const products = useStreamProducts(s.id)
  const messages = useStreamMessages(s.id, isLive)
  const viewers = useStreamViewers(s.id, isLive)
  const update = useUpdateStream()
  const send = useSendStreamMessage()
  const removeMessage = useRemoveStreamMessage()
  const add = useCart((c) => c.add)
  const [text, setText] = useState('')
  const [added, setAdded] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const mine = user?.id === s.seller_id
  const carried = s.video === 'livekit'
  const playback = s.playback_url ? playbackFor(s.playback_url) : null
  const pinned = products.data?.find((p) => p.id === s.pinned_product_id)
  const run = (input: Parameters<typeof update.mutate>[0]) => { setError(null); update.mutate(input, { onError: (e) => setError(friendlyError(e)) }) }

  return (
    <Screen>
      <PageHeader title={s.title} back="/live" right={isLive ? <Badge tone="danger" icon="broadcast">{viewers.data ?? 0} watching</Badge> : undefined} />
      <div className="px-[22px] pb-8">
        <Link to={`/store/${s.seller_id}`} className="inline-flex items-center min-h-11 text-[14px] font-semibold text-brand-hover">{s.seller?.business_name ?? 'Seller'} · visit the store</Link>

        {s.status === 'scheduled' && <Alert tone="info">This stream has not started{s.scheduled_for ? `. It is planned for ${formatDateTime(s.scheduled_for)}` : ''}.</Alert>}
        {s.status === 'ended' && <Alert tone="info">{s.ended_reason ? ENDED_REASON[s.ended_reason] : 'This stream has ended. The products are still on sale in the store.'}</Alert>}
        {carried && mine && s.status !== 'ended' && <SellerVideoTime startedAt={s.started_at} />}
        {carried && mine && <Suspense fallback={videoLoading}><LiveBroadcast streamId={s.id} ended={s.status === 'ended'} /></Suspense>}
        {carried && !mine && isLive && <Suspense fallback={videoLoading}><LiveWatch streamId={s.id} /></Suspense>}
        {!carried && isLive && playback && (
          <div className="bg-ink rounded-2xl overflow-hidden">
            {playback.kind === 'video' && <video controls autoPlay playsInline src={playback.src} aria-label={s.title} className="w-full max-h-[50vh]" />}
            {playback.kind === 'embed' && <iframe src={playback.src} title={s.title} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen className="w-full aspect-video" />}
            {playback.kind === 'link' && (
              <a href={playback.href} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center justify-center gap-2 py-10 text-cream">
                <i className="ph-fill ph-play-circle text-[44px] text-brand" />
                <span className="font-semibold">Watch the video</span>
                <span className="text-[12.5px] text-muted-3">Opens in a new tab; keep this page open to chat and buy.</span>
              </a>
            )}
          </div>
        )}

        {mine && (
          <div className="flex flex-wrap gap-x-5 mt-2 text-[14.5px] font-semibold">
            {s.status === 'scheduled' && <button disabled={update.isPending} className="min-h-11 text-success-text" onClick={() => { if (window.confirm('Go live now? People who saved your shop are notified.')) run({ id: s.id, action: 'start' }) }}>Go live now</button>}
            {s.status !== 'ended' && <button disabled={update.isPending} className="min-h-11 text-danger" onClick={() => { if (window.confirm('End this stream?')) run({ id: s.id, action: 'end' }) }}>End stream</button>}
          </div>
        )}
        {error && <Alert className="mt-2">{error}</Alert>}

        {pinned && (
          <div className="flex items-center gap-3 bg-white border-[1.5px] border-brand rounded-2xl p-3 mt-3">
            <PlaceholderImage src={productImage(pinned)} className="w-14 h-14 flex-none" />
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-mono uppercase tracking-[0.12em] text-brand">On screen now</div>
              <div className="text-[15px] font-semibold text-ink truncate">{pinned.name}</div>
              <div className="text-[13.5px] text-muted">{formatNaira(pinned.price)}</div>
            </div>
            <Link to={`/product/${pinned.id}`} className="flex-none px-4 h-11 inline-flex items-center bg-brand text-white rounded-lg text-[14.5px] font-semibold">Buy</Link>
          </div>
        )}

        {(products.data?.length ?? 0) > 0 && (
          <>
            <SectionLabel className="mt-5 mb-2.5">In this sale</SectionLabel>
            <div className="bg-white border border-line rounded-2xl overflow-hidden">
              {products.data!.map((p, i, all) => (
                <div key={p.id} className={`flex items-center gap-3 p-3 ${i < all.length - 1 ? 'border-b border-line-soft' : ''}`}>
                  <Link to={`/product/${p.id}`} className="flex-1 min-w-0">
                    <div className="text-[14.5px] font-semibold text-ink truncate">{p.name}</div>
                    <div className="text-[13px] text-muted">{formatNaira(p.price)}{p.stock !== null && p.stock <= 0 ? ' · sold out' : ''}</div>
                  </Link>
                  {mine && isLive ? (
                    <button disabled={update.isPending} className="min-h-11 text-[13.5px] font-semibold text-brand" onClick={() => run({ id: s.id, action: 'pin', productId: s.pinned_product_id === p.id ? null : p.id })}>{s.pinned_product_id === p.id ? 'Unpin' : 'Show now'}</button>
                  ) : !mine && (
                    <button className="min-h-11 text-[13.5px] font-semibold text-brand-hover" onClick={() => { add(p.id, 1); setAdded(p.id) }}>{added === p.id ? 'Added ✓' : 'Add to cart'}</button>
                  )}
                </div>
              ))}
            </div>
            {added && <Link to="/cart" className="inline-block min-h-11 pt-2.5 text-[14.5px] font-semibold text-brand-hover">Go to cart and pay from your wallet</Link>}
            <p className="text-[12.5px] text-muted-2 mt-1">Products sold in sizes or colours are chosen on the product page.</p>
          </>
        )}

        <SectionLabel className="mt-5 mb-2.5">Chat</SectionLabel>
        <div className="bg-white border border-line rounded-2xl p-3 max-h-72 overflow-y-auto" aria-live="polite">
          {(messages.data?.length ?? 0) === 0 && <p className="text-[13.5px] text-muted py-2">{isLive ? 'Say hello, or ask about what is on screen.' : 'The chat opens when the stream is live.'}</p>}
          {messages.data?.map((m) => (
            <div key={m.id} className="flex items-start gap-2 py-1 text-[14px]">
              <span className="flex-1 min-w-0"><span className={`font-semibold ${m.sender_id === s.seller_id ? 'text-brand' : 'text-ink'}`}>{m.sender?.full_name?.split(' ')[0] || 'Viewer'}</span> <span className="text-text-soft break-words">{m.body}</span></span>
              {mine && <button aria-label="Remove message" className="flex-none w-8 h-8 text-muted-3" onClick={() => removeMessage.mutate(m.id)}><i className="ph ph-x" /></button>}
            </div>
          ))}
        </div>
        {isLive && (
          <form className="flex gap-2.5 mt-2.5" onSubmit={(e) => {
            e.preventDefault()
            if (!text.trim() || send.isPending) return
            setError(null)
            send.mutate({ streamId: s.id, body: text }, { onSuccess: () => setText(''), onError: (err) => setError(friendlyError(err)) })
          }}>
            <input value={text} onChange={(e) => setText(e.target.value)} maxLength={300} placeholder="Message" aria-label="Chat message" className="flex-1 min-w-0 bg-white border-[1.5px] border-line rounded-lg h-12 px-3.5 text-[15px] text-ink outline-none" />
            <button type="submit" disabled={!text.trim() || send.isPending} className="px-4 h-12 bg-ink text-cream rounded-lg text-[14.5px] font-semibold disabled:opacity-50">Send</button>
          </form>
        )}
        {!mine && <><ReportButton targetType="stream" targetId={s.id} label="Report this stream" className="mt-5" /><BlockUserButton profileId={s.seller_id} /></>}
      </div>
    </Screen>
  )
}

/** What a FindWork video stream may use, in plain terms. */
function AllowanceNote({ a }: { a: LiveVideoAllowance }) {
  return (
    <p className="text-[13px] leading-[1.5] text-text-soft">
      {allowanceSummary(a)} (resets {formatDateTime(a.resets_at)}). Everyone in the stream counts, you included: 10 viewers for
      30 minutes is about 330 minutes. A stream runs for up to {a.stream_minutes} minutes once live, after a camera check of up
      to {a.preview_minutes}, with up to {a.max_viewers} people watching at once. A YouTube link has no limits.
    </p>
  )
}

/** For the seller during a FindWork video stream: time left on it, and this month's minutes. */
function SellerVideoTime({ startedAt }: { startedAt: string | null }) {
  const { data: a } = useLiveVideoAllowance(true)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [])
  if (!a) return null
  const left = minutesLeft(startedAt, a.stream_minutes, now)
  return (
    <p className={`mt-2 text-[13px] ${left !== null && left <= 5 ? 'font-semibold text-danger' : 'text-text-soft'}`}>
      {left === null ? `Up to ${a.stream_minutes} minutes once you go live. ` : `${left} minute${left === 1 ? '' : 's'} left on this stream. `}
      {allowanceSummary(a)}.
    </p>
  )
}

