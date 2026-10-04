import { describe, expect, it, vi } from 'vitest'
import { vapidKeyBytes } from '../push'
import { pushPayload, sendPush, worthPushing, type PushNotification } from '../../../supabase/functions/send-push/pushPayload.ts'

const note = (over: Partial<PushNotification> = {}): PushNotification => ({
  id: 'n1', kind: 'payment', title: 'You have been paid', body: 'Tailoring · ₦9,400', created_at: new Date().toISOString(), read_at: null, ...over,
})
const subs = [{ endpoint: 'https://push/a', p256dh: 'k', auth: 'a' }, { endpoint: 'https://push/b', p256dh: 'k', auth: 'a' }]
const steps = (over = {}) => ({
  expectedSecret: 'secret' as string | undefined,
  targets: vi.fn(async () => ({ data: { notification: note(), subscriptions: subs }, error: null })),
  send: vi.fn(async () => 201),
  delivered: vi.fn(async () => ({ error: null })),
  ...over,
})

describe('push notifications', () => {
  it('turns a URL-safe key into the bytes the browser subscribes with', () => {
    expect([...vapidKeyBytes('AQID-_8')]).toEqual([1, 2, 3, 251, 255])
  })

  it('opens the inbox on the notification that was pushed', () => {
    expect(pushPayload(note())).toEqual({ title: 'You have been paid', body: 'Tailoring · ₦9,400', tag: 'n1', url: '/notifications?open=n1' })
  })

  it('does not alert for something already read or long past', () => {
    expect(worthPushing(note())).toBe(true)
    expect(worthPushing(note({ read_at: new Date().toISOString() }))).toBe(false)
    expect(worthPushing(note({ created_at: new Date(Date.now() - 20 * 60_000).toISOString() }))).toBe(false)
  })

  it('refuses a caller without the shared secret', async () => {
    const s = steps()
    expect((await sendPush('wrong', 'n1', s)).status).toBe(401)
    expect((await sendPush(null, 'n1', steps({ expectedSecret: undefined }))).status).toBe(401)
    expect(s.targets).not.toHaveBeenCalled()
  })

  it('sends to every device and forgets the ones the browser has dropped', async () => {
    const send = vi.fn(async (sub: { endpoint: string }) => (sub.endpoint.endsWith('a') ? 201 : 410))
    const s = steps({ send })
    expect(await (await sendPush('secret', 'n1', s)).json()).toEqual({ sent: 1, removed: 1 })
    expect(s.delivered).toHaveBeenCalledWith(['https://push/a'], ['https://push/b'])
  })

  it('keeps a subscription when the push service is merely unavailable', async () => {
    const s = steps({ send: vi.fn(async () => 503) })
    expect(await (await sendPush('secret', 'n1', s)).json()).toEqual({ sent: 0, removed: 0 })
    expect(s.delivered).not.toHaveBeenCalled()
  })
})
