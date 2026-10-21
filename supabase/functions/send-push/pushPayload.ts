/**
 * Decides what to push for one notification. Kept free of Deno imports so it
 * can be unit-tested from Vitest.
 */
import { json } from '../_shared/cors.ts'

export type PushNotification = { id: string; kind: string; title: string; body: string; created_at: string; read_at: string | null }
export type PushSubscription = { endpoint: string; p256dh: string; auth: string }

/** What the service worker or the phone shows. Opening it lands on the inbox, which routes on to the right screen. */
export function pushPayload(n: PushNotification) {
  return {
    title: n.title.slice(0, 120) || 'FindWork',
    body: n.body.slice(0, 240),
    // One alert per notification: a retry replaces rather than repeats it.
    tag: n.id,
    url: `/notifications?open=${n.id}`,
  }
}

/** Already read, or so old that an alert now would only confuse. */
export function worthPushing(n: PushNotification, now: number = Date.now()): boolean {
  return n.read_at === null && now - new Date(n.created_at).getTime() < 15 * 60_000
}

export type PushPayload = ReturnType<typeof pushPayload>
/** A phone with the app, registered with Firebase Cloud Messaging. */
export type PushDevice = { token: string; platform: 'ios' | 'android' }
/** "gone" means the browser or app will never take a push at this address again. */
export type PushOutcome = 'sent' | 'gone' | 'failed'
type Delivered = (sent: string[], gone: string[]) => PromiseLike<{ error: { message: string } | null }>

export type PushSteps = {
  expectedSecret: string | undefined
  targets: (notificationId: string) => PromiseLike<{ data: unknown; error: { message: string } | null }>
  /** Browsers, by Web Push; left out when the VAPID keys are not set. send resolves to the HTTP status the push service answered with. */
  web?: { send: (subscription: PushSubscription, payload: string) => Promise<number>; delivered: Delivered }
  /** The iPhone and Android apps, through FCM; left out when Firebase is not set up. */
  apps?: { send: (device: PushDevice, payload: PushPayload) => Promise<PushOutcome>; delivered: Delivered }
}

/** 404 and 410 mean the browser dropped this subscription for good. */
export function webOutcome(status: number): PushOutcome {
  if (status >= 200 && status < 300) return 'sent'
  return status === 404 || status === 410 ? 'gone' : 'failed'
}

/** Sends to each address in turn, then records which took it and forgets the ones that are gone. */
async function deliverAll<T>(targets: T[], send: (target: T) => Promise<PushOutcome>, address: (target: T) => string, delivered: Delivered) {
  const sent: string[] = []
  const gone: string[] = []
  for (const target of targets) {
    const outcome = await send(target).catch((): PushOutcome => 'failed')
    if (outcome === 'sent') sent.push(address(target))
    else if (outcome === 'gone') gone.push(address(target))
  }
  if (sent.length > 0 || gone.length > 0) await delivered(sent, gone)
  return { sent: sent.length, removed: gone.length }
}

export async function sendPush(secret: string | null, notificationId: unknown, steps: PushSteps): Promise<Response> {
  if (!steps.expectedSecret || secret !== steps.expectedSecret) return json({ error: 'unauthorised' }, 401)
  if (typeof notificationId !== 'string') return json({ error: 'notification_id required' }, 400)
  const found = await steps.targets(notificationId)
  if (found.error) return json({ error: 'lookup failed' }, 500)
  const target = found.data as { notification: PushNotification; subscriptions: PushSubscription[]; devices?: PushDevice[] } | null
  if (!target || !worthPushing(target.notification)) return json({ sent: 0 })

  const payload = pushPayload(target.notification)
  const total = { sent: 0, removed: 0 }
  const add = (part: { sent: number; removed: number }) => { total.sent += part.sent; total.removed += part.removed }
  const { web, apps } = steps
  if (web) {
    const body = JSON.stringify(payload)
    add(await deliverAll(target.subscriptions, async (s) => webOutcome(await web.send(s, body)), (s) => s.endpoint, web.delivered))
  }
  if (apps) add(await deliverAll(target.devices ?? [], (d) => apps.send(d, payload), (d) => d.token, apps.delivered))
  return json(total)
}
