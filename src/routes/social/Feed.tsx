import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { PageHeader } from '../../components/chrome/PageHeader'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { Chip } from '../../components/ui/Chip'
import { PlaceholderImage } from '../../components/ui/PlaceholderImage'
import { ReportButton } from '../../components/ui/ReportButton'
import { SectionLabel } from '../../components/ui/SectionLabel'
import { QueryState } from '../../components/system/QueryState'
import { RequireProvider } from '../../components/system/RequireProvider'
import { useAuth } from '../../lib/authContext'
import { POST_MIME, recordPostView, useMyProducts, usePublishPost, useRemovePost, useSocialFeed, useTogglePostLike, type FeedPost } from '../../lib/api'
import { usePrivateMedia } from '../../lib/api/storage'
import { friendlyError } from '../../lib/supabase'
import { formatNaira, timeAgo } from '../../lib/format'

/** Stories from the last day across the top, then reels: what sellers are showing right now. */
export function Feed() {
  const stories = useSocialFeed('story')
  const reels = useSocialFeed('reel')
  const [story, setStory] = useState<FeedPost | null>(null)

  return (
    <Screen bottomNav="customer">
      <PageHeader title="Stories and reels" back="/home" right={<Link to="/feed/new" className="text-[14.5px] font-semibold text-brand-hover">Post</Link>} />
      <div className="px-[22px] pb-8">
        <Link to="/live" className="flex items-center justify-between bg-ink rounded-2xl px-5 py-3.5 mt-4">
          <span className="font-display font-semibold text-[15.5px] text-cream"><i className="ph-fill ph-broadcast text-brand mr-2" />Live selling</span>
          <i className="ph-bold ph-arrow-right text-lg text-brand" />
        </Link>

        {(stories.data?.length ?? 0) > 0 && (
          <>
            <SectionLabel className="mt-5 mb-2.5">Stories · gone after a day</SectionLabel>
            <div className="flex gap-3 overflow-x-auto -mx-[22px] px-[22px] pb-1">
              {stories.data!.map((s) => (
                <button key={s.id} onClick={() => setStory(s)} className="flex-none w-[72px] text-center">
                  <span className="block w-[64px] h-[64px] mx-auto rounded-full p-[2.5px] bg-brand">
                    <PlaceholderImage shape="circle" src={s.author_photo ?? undefined} className="w-full h-full border-2 border-cream" />
                  </span>
                  <span className="block mt-1.5 text-[11.5px] text-ink truncate">{s.author_name}</span>
                </button>
              ))}
            </div>
          </>
        )}
        {story && (
          <div className="mt-3">
            <Post post={story} />
            <button className="min-h-11 text-[14px] font-semibold text-muted" onClick={() => setStory(null)}>Close story</button>
          </div>
        )}

        <SectionLabel className="mt-5 mb-2.5">Reels</SectionLabel>
        <QueryState query={reels} errorMessage="We could not load the feed." empty={{ icon: 'ph-film-reel', title: 'No reels yet', body: 'Sellers post short videos of their work and goods here.' }}>
          {(rows) => rows.map((post) => <Post key={post.id} post={post} />)}
        </QueryState>
      </div>
    </Screen>
  )
}

/** One story or reel: the media, who posted it, what it sells, and how it is doing. */
export function Post({ post }: { post: FeedPost }) {
  const { user } = useAuth()
  const media = usePrivateMedia('social-media', post.media_path)
  const like = useTogglePostLike()
  const remove = useRemovePost()
  const seen = useRef(false)
  const mine = user?.id === post.author_id

  // Counted once the media has actually loaded in front of the viewer.
  useEffect(() => {
    if (media.data && !seen.current && !mine) {
      seen.current = true
      recordPostView(post.id)
    }
  }, [media.data, mine, post.id])

  return (
    <article className="bg-white border border-line rounded-2xl overflow-hidden mb-4">
      <Link to={`/store/${post.author_id}`} className="flex items-center gap-2.5 p-3">
        <PlaceholderImage shape="circle" src={post.author_photo ?? undefined} className="w-9 h-9 flex-none" />
        <span className="flex-1 min-w-0 text-[14.5px] font-semibold text-ink truncate">{post.author_name}{post.author_verified && <i className="ph-fill ph-seal-check text-success ml-1" />}</span>
        <span className="text-[12px] text-muted-2">{timeAgo(post.created_at)}</span>
      </Link>
      <div className="bg-ink">
        {media.isError ? <button className="w-full py-10 text-[14px] text-cream underline" onClick={() => void media.refetch()}>Could not load. Retry</button>
          : !media.data ? <div className="py-16 text-center text-[14px] text-muted-3">Loading…</div>
            : post.mime.startsWith('video/')
              ? <video controls playsInline loop preload="metadata" src={media.data} aria-label={post.caption || `Video from ${post.author_name}`} className="w-full max-h-[70vh]" />
              : <img src={media.data} alt={post.caption || `Photo from ${post.author_name}`} className="w-full max-h-[70vh] object-contain" />}
      </div>
      <div className="p-3">
        {post.caption && <p className="text-[14.5px] leading-[1.45] text-ink whitespace-pre-wrap">{post.caption}</p>}
        {post.product && (
          <Link to={`/product/${post.product.id}`} className="flex items-center justify-between gap-3 bg-cream rounded-xl px-3.5 py-3 mt-2.5">
            <span className="min-w-0"><span className="block text-[14px] font-semibold text-ink truncate">{post.product.name}</span><span className="text-[13px] text-muted">{formatNaira(post.product.price)}</span></span>
            <span className="flex-none text-[14px] font-semibold text-brand-hover">Buy</span>
          </Link>
        )}
        <div className="flex items-center gap-5 mt-2 text-[13.5px] text-muted">
          <button disabled={like.isPending} aria-pressed={post.liked} className="min-h-11 inline-flex items-center gap-1.5" onClick={() => like.mutate(post.id)}>
            <i className={`${post.liked ? 'ph-fill text-brand' : 'ph'} ph-heart text-[19px]`} /> {post.likes}
          </button>
          <span className="inline-flex items-center gap-1.5"><i className="ph ph-eye text-[19px]" /> {post.views}</span>
          {mine
            ? <button disabled={remove.isPending} className="min-h-11 ml-auto font-semibold" onClick={() => { if (window.confirm('Remove this post?')) remove.mutate(post.id) }}>Remove</button>
            : <ReportButton targetType="post" targetId={post.id} label="Report" className="ml-auto" />}
        </div>
      </div>
    </article>
  )
}

/** A seller posts a story or a reel, optionally tagging one of their products. */
export function NewPost() {
  return <RequireProvider>{() => <PostForm />}</RequireProvider>
}

function PostForm() {
  const navigate = useNavigate()
  const publish = usePublishPost()
  const { data: products } = useMyProducts()
  const [kind, setKind] = useState<'story' | 'reel'>('story')
  const [file, setFile] = useState<File | null>(null)
  const [caption, setCaption] = useState('')
  const [productId, setProductId] = useState('')
  const [error, setError] = useState<string | null>(null)

  return (
    <Screen>
      <PageHeader title="New post" back="/feed" icon="x" />
      <div className="px-[22px] pb-8">
        <div className="flex gap-2 mt-4">
          <Chip active={kind === 'story'} onClick={() => { setKind('story'); setFile(null) }}>Story · 24 hours</Chip>
          <Chip active={kind === 'reel'} onClick={() => { setKind('reel'); setFile(null) }}>Reel · stays up</Chip>
        </div>
        <label className="block mt-5 text-[14px] text-text-soft">{kind === 'story' ? 'A photo or a short video (up to 50 MB)' : 'A short video (MP4 or WebM, up to 50 MB)'}
          <input key={kind} type="file" accept={POST_MIME[kind].join(',')} disabled={publish.isPending} className="block w-full mt-1.5 p-3 bg-white border border-line rounded-lg"
            onChange={(e) => { setError(null); setFile(e.target.files?.[0] ?? null) }} />
        </label>
        <label className="block mt-4 text-[14px] text-text-soft">Caption
          <textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={3} maxLength={500} className="block w-full mt-1.5 bg-white border-[1.5px] border-line rounded-lg p-3 text-[15px] text-ink outline-none" />
        </label>
        {(products?.length ?? 0) > 0 && (
          <label className="block mt-4 text-[14px] text-text-soft">Tag one of your products (optional)
            <select value={productId} onChange={(e) => setProductId(e.target.value)} className="block w-full mt-1.5 bg-white border-[1.5px] border-line rounded-lg h-[52px] px-3 text-ink">
              <option value="">No product</option>
              {products!.filter((p) => p.status === 'live').map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        )}
        {error && <Alert className="mt-4">{error}</Alert>}
        <Button className="mt-6" disabled={!file} loading={publish.isPending} onClick={async () => {
          setError(null)
          try { await publish.mutateAsync({ kind, file: file!, caption: caption.trim(), productId: productId || null }); navigate('/feed', { replace: true }) }
          catch (err) { setError(friendlyError(err)) }
        }}>Post {kind}</Button>
      </div>
    </Screen>
  )
}
