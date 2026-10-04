import { supabase } from './supabase'

/**
 * Usage analytics: which screens are opened, by the shape of the route and
 * never by the id in it. Sent in small batches; a failure is ignored, and
 * someone who has opted out in Preferences is not recorded by the server.
 */

const STATIC_AFTER: Record<string, string[]> = {
  provider: ['jobs', 'requests', 'availability', 'services', 'portfolio', 'earnings', 'products', 'orders', 'coupons'],
  classifieds: ['new'],
  rfqs: ['new'],
  internships: ['new'],
  feed: ['new'],
  live: ['new'],
  meetups: ['new'],
  disputes: ['new'],
  chat: ['with'],
  wallet: ['add', 'topup', 'withdraw', 'transfer'],
  admin: ['analytics', 'coupons', 'courses'],
}
const ID_PARENTS = new Set(['product', 'store', 'courses', 'order', 'track', 'bookings', 'book', 'jobs', 'purchase-orders', 'certificate', 'services', 'products', 'with', 'new'])

/** "/provider/8f3c…" becomes "/provider/:id": what kind of screen, not whose. */
export function routePattern(pathname: string): string {
  const parts = pathname.split('/').filter(Boolean)
  const out: string[] = []
  parts.forEach((part, i) => {
    if (i === 0) {
      out.push(part)
      return
    }
    const parent = parts[i - 1]
    const looksLikeId = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(part) || (/\d/.test(part) && part.length >= 8)
    const staticChild = STATIC_AFTER[parent]?.includes(part) ?? false
    // The segment after a parent that takes an id is one, whatever it looks like.
    const takesId = out[i - 1] !== ':id' && !staticChild && (ID_PARENTS.has(parent) || parent in STATIC_AFTER)
    out.push(looksLikeId || takesId ? ':id' : part)
  })
  return `/${out.join('/')}`.slice(0, 120)
}

let session: string | null = null
function sessionId(): string {
  if (!session) {
    try {
      session = sessionStorage.getItem('findwork.session') ?? crypto.randomUUID()
      sessionStorage.setItem('findwork.session', session)
    } catch {
      session = crypto.randomUUID()
    }
  }
  return session
}

type Event = { name: string; path: string }
const queue: Event[] = []
let timer: ReturnType<typeof setTimeout> | null = null

function flush() {
  timer = null
  if (queue.length === 0) return
  const events = queue.splice(0, 50)
  void supabase.rpc('track_events', { p_session_id: sessionId(), p_events: events }).then(
    () => undefined,
    () => undefined,
  )
}

/** Queues an event; names are lower_snake_case and carry no personal detail. */
export function track(name: string, pathname: string = typeof window === 'undefined' ? '' : window.location.pathname) {
  queue.push({ name, path: routePattern(pathname) })
  if (queue.length >= 20) flush()
  else if (!timer) timer = setTimeout(flush, 8_000)
}

if (typeof window !== 'undefined') {
  // Whatever is waiting goes when the page is hidden or closed.
  window.addEventListener('pagehide', flush)
}
