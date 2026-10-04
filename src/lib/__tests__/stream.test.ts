import { describe, expect, it } from 'vitest'
import { playbackFor } from '../stream'

describe('showing a stream\'s video', () => {
  it('embeds YouTube links in any of their forms', () => {
    for (const url of ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'https://youtu.be/dQw4w9WgXcQ', 'https://youtube.com/live/dQw4w9WgXcQ']) {
      expect(playbackFor(url)).toEqual({ kind: 'embed', src: 'https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1&playsinline=1' })
    }
  })

  it('plays a direct video file in place', () => {
    expect(playbackFor('https://cdn.example/sale.mp4')).toEqual({ kind: 'video', src: 'https://cdn.example/sale.mp4' })
  })

  it('opens anything else where it lives, and never an insecure or malformed link in place', () => {
    expect(playbackFor('https://facebook.com/shop/live/123')).toEqual({ kind: 'link', href: 'https://facebook.com/shop/live/123' })
    expect(playbackFor('http://cdn.example/sale.mp4').kind).toBe('link')
    expect(playbackFor('javascript:alert(1)').kind).toBe('link')
    expect(playbackFor('not a url').kind).toBe('link')
  })
})
