import { describe, expect, it, vi } from 'vitest'
import { vapidKeyBytes } from '../push'
import { pushPayload, sendPush, webOutcome, worthPushing, type PushDevice, type PushNotification, type PushOutcome } from '../../../supabase/functions/send-push/pushPayload.ts'

const note = (over: Partial<PushNotification> = {}): PushNotification => ({
  id: 'n1', kind: 'payment', title: 'You have been paid', body: 'Tailoring · ₦9,400', created_at: new Date().toISOString(), read_at: null, ...over,
})
const subs = [{ endpoint: 'https://push/a', p256dh: 'k', auth: 'a' }, { endpoint: 'https://push/b', p256dh: 'k', auth: 'a' }]
const devices = [{ token: 'android-token', platform: 'android' as const }, { token: 'iphone-token', platform: 'ios' as const }]
const web = (send = vi.fn(async (_sub: { endpoint: string }): Promise<number> => 201)) => ({ send, delivered: vi.fn(async (_sent: string[], _gone: string[]) => ({ error: null })) })
const apps = (send = vi.fn(async (_device: PushDevice): Promise<PushOutcome> => 'sent')) => ({ send, delivered: vi.fn(async (_sent: string[], _gone: string[]) => ({ error: null })) })
const steps = (over: Partial<Parameters<typeof sendPush>[2]> = {}) => ({
  expectedSecret: 'secret' as string | undefined,
  targets: vi.fn(async (): Promise<{ data: unknown; error: null }> => ({ data: { notification: note(), subscriptions: subs, devices }, error: null })),
  web: web(),
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

  it('sends to every browser and forgets the ones that have dropped it', async () => {
    const browsers = web(vi.fn(async (sub: { endpoint: string }) => (sub.endpoint.endsWith('a') ? 201 : 410)))
    expect(await (await sendPush('secret', 'n1', steps({ web: browsers }))).json()).toEqual({ sent: 1, removed: 1 })
    expect(browsers.delivered).toHaveBeenCalledWith(['https://push/a'], ['https://push/b'])
  })

  it('keeps a subscription when the push service is merely unavailable', async () => {
    const browsers = web(vi.fn(async () => 503))
    expect(await (await sendPush('secret', 'n1', steps({ web: browsers }))).json()).toEqual({ sent: 0, removed: 0 })
    expect(browsers.delivered).not.toHaveBeenCalled()
    expect([webOutcome(201), webOutcome(404), webOutcome(410), webOutcome(429), webOutcome(0)]).toEqual(['sent', 'gone', 'gone', 'failed', 'failed'])
  })

  it('pushes the phone apps too, with the same alert', async () => {
    const phones = apps()
    expect(await (await sendPush('secret', 'n1', steps({ apps: phones }))).json()).toEqual({ sent: 4, removed: 0 })
    expect(phones.send).toHaveBeenCalledWith(devices[0], pushPayload(note()))
    expect(phones.delivered).toHaveBeenCalledWith(['android-token', 'iphone-token'], [])
  })

  it('forgets an app FCM no longer knows, and keeps one that merely failed', async () => {
    const phones = apps(vi.fn(async (d: PushDevice): Promise<PushOutcome> => (d.token === 'android-token' ? 'gone' : 'failed')))
    expect(await (await sendPush('secret', 'n1', steps({ web: undefined, apps: phones }))).json()).toEqual({ sent: 0, removed: 1 })
    expect(phones.delivered).toHaveBeenCalledWith([], ['android-token'])
  })

  it('sends to whichever kind is set up, leaving the other kind alone', async () => {
    expect(await (await sendPush('secret', 'n1', steps({ web: undefined, apps: apps() }))).json()).toEqual({ sent: 2, removed: 0 })
    expect(await (await sendPush('secret', 'n1', steps())).json()).toEqual({ sent: 2, removed: 0 })
  })

  it('treats a sender that throws as a failure, not a reason to forget the app', async () => {
    const phones = apps(vi.fn(async (): Promise<PushOutcome> => { throw new Error('network down') }))
    expect(await (await sendPush('secret', 'n1', steps({ web: undefined, apps: phones }))).json()).toEqual({ sent: 0, removed: 0 })
    expect(phones.delivered).not.toHaveBeenCalled()
  })

  it('copes with a database that does not list apps yet', async () => {
    const phones = apps()
    const targets = vi.fn(async () => ({ data: { notification: note(), subscriptions: subs }, error: null }))
    expect(await (await sendPush('secret', 'n1', steps({ apps: phones, targets }))).json()).toEqual({ sent: 2, removed: 0 })
    expect(phones.send).not.toHaveBeenCalled()
  })
})
