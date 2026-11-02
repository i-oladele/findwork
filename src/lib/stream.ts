/**
 * How a stream's video can be shown when the seller broadcasts with their own
 * tool and gives the link people watch at. (Video FindWork carries itself,
 * through LiveKit, is in components/ui/LiveVideo.tsx.)
 */
export type Playback =
  | { kind: 'video'; src: string }
  | { kind: 'embed'; src: string }
  | { kind: 'link'; href: string }

/** A direct video file plays here; YouTube embeds; anything else opens where it lives. */
export function playbackFor(url: string): Playback {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return { kind: 'link', href: 'about:blank' }
  }
  // Only a secure web link is ever put in the page.
  if (parsed.protocol !== 'https:') return { kind: 'link', href: 'about:blank' }
  const host = parsed.hostname.replace(/^www\./, '')
  const youtubeId =
    host === 'youtu.be'
      ? parsed.pathname.slice(1)
      : host === 'youtube.com' || host === 'm.youtube.com'
        ? parsed.searchParams.get('v') ?? parsed.pathname.match(/^\/(?:live|embed|shorts)\/([\w-]+)/)?.[1] ?? null
        : null
  if (youtubeId && /^[\w-]{6,20}$/.test(youtubeId)) return { kind: 'embed', src: `https://www.youtube.com/embed/${youtubeId}?autoplay=1&playsinline=1` }
  if (/\.(mp4|webm)$/i.test(parsed.pathname)) return { kind: 'video', src: url }
  // HLS plays natively in Safari and on iPhones; other browsers need the link.
  if (/\.m3u8$/i.test(parsed.pathname)) {
    const native = typeof document !== 'undefined' && document.createElement('video').canPlayType('application/vnd.apple.mpegurl') !== ''
    return native ? { kind: 'video', src: url } : { kind: 'link', href: url }
  }
  return { kind: 'link', href: url }
}

/**
 * Live video inside FindWork is shared: LiveKit's free plan gives the whole
 * platform a monthly pool of minutes, counted for every person in a room for
 * every minute (the seller too). The database keeps each seller to a share of
 * it and each stream to a time and a number of viewers (live_video_tick).
 */
export type LiveVideoState = 'open' | 'paused' | 'stopped'
export type LiveVideoAllowance = {
  used: number
  allowance: number
  state: LiveVideoState
  stream_minutes: number
  preview_minutes: number
  max_viewers: number
  resets_at: string
}

/** Why the video would not let someone in, from livekit-token's video_limit answer. */
export function videoLimitMessage(reason: string | undefined): string {
  switch (reason) {
    case 'budget':
      return 'Live video inside FindWork is used up for this month. Stream with YouTube and paste the link instead; FindWork video comes back when the month resets.'
    case 'allowance':
      return 'You have used this month’s live video inside FindWork. Stream with YouTube and paste the link instead until your minutes reset.'
    case 'preview':
      return 'Your camera check time is used up. Go live when you are ready and the camera starts again.'
    case 'time':
      return 'This stream has reached its time limit. Start another one to keep selling.'
    case 'full':
      return 'This stream is full right now. Try again in a minute.'
    default:
      return 'This stream is not open to watch.'
  }
}

/** Why FindWork ended a stream (live_streams.ended_reason). */
export const ENDED_REASON: Record<'time_limit' | 'allowance' | 'budget', string> = {
  time_limit: 'This stream reached its time limit and FindWork ended it. The products are still on sale in the store.',
  allowance: 'The seller’s live video for this month ran out, so FindWork ended the stream. The products are still on sale in the store.',
  budget: 'Live video inside FindWork is used up for this month, so the stream ended. The products are still on sale in the store.',
}

/** Whole minutes left on a live stream, never below zero; null before it starts. */
export function minutesLeft(startedAt: string | null, streamMinutes: number, now = Date.now()): number | null {
  if (!startedAt) return null
  const end = new Date(startedAt).getTime() + streamMinutes * 60_000
  return Math.max(0, Math.ceil((end - now) / 60_000))
}

/** Whether a seller can start the camera now, and if not, why. */
export function cameraAvailability(a: LiveVideoAllowance): { ok: true } | { ok: false; reason: string } {
  if (a.state !== 'open') return { ok: false, reason: videoLimitMessage('budget') }
  if (a.used >= a.allowance) return { ok: false, reason: videoLimitMessage('allowance') }
  return { ok: true }
}

/** "312 of 750 minutes used this month". */
export function allowanceSummary(a: LiveVideoAllowance): string {
  const used = Math.min(a.used, a.allowance)
  return `${used.toLocaleString('en-NG')} of ${a.allowance.toLocaleString('en-NG')} live video minutes used this month`
}
