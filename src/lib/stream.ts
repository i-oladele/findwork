/**
 * How a stream's video can be shown. FindWork does not carry the video: the
 * seller broadcasts with their own tool and gives the link people watch at.
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
