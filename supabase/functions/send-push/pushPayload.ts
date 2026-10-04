/**
 * Decides what to push for one notification. Kept free of Deno imports so it
 * can be unit-tested from Vitest.
 */
import { json } from '../_shared/cors.ts'

export type PushNotification = { id: string; kind: string; title: string; body: string; created_at: string; read_at: string | null }
export type PushSubscription = { endpoint: string; p256dh: string; auth: string }

/** What the service worker shows. Opening it lands on the inbox, which routes on to the right screen. */
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

export type PushSteps = {
  expectedSecret: string | undefined
  targets: (notificationId: string) => PromiseLike<{ data: unknown; error: { message: string } | null }>
  /** Resolves to the HTTP status the push service answered with. */
  send: (subscription: PushSubscription, payload: string) => Promise<number>
  delivered: (sent: string[], gone: string[]) => PromiseLike<{ error: { message: string } | null }>
}

export async function sendPush(secret: string | null, notificationId: unknown, steps: PushSteps): Promise<Response> {
  if (!steps.expectedSecret || secret !== steps.expectedSecret) return json({ error: 'unauthorised' }, 401)
  if (typeof notificationId !== 'string') return json({ error: 'notification_id required' }, 400)
  const found = await steps.targets(notificationId)
  if (found.error) return json({ error: 'lookup failed' }, 500)
  const target = found.data as { notification: PushNotification; subscriptions: PushSubscription[] } | null
  if (!target || !worthPushing(target.notification)) return json({ sent: 0 })

  const payload = JSON.stringify(pushPayload(target.notification))
  const sent: string[] = []
  const gone: string[] = []
  for (const subscription of target.subscriptions) {
    const status = await steps.send(subscription, payload).catch(() => 0)
    if (status >= 200 && status < 300) sent.push(subscription.endpoint)
    // 404 and 410 mean the browser dropped this subscription for good.
    else if (status === 404 || status === 410) gone.push(subscription.endpoint)
  }
  if (sent.length > 0 || gone.length > 0) await steps.delivered(sent, gone)
  return json({ sent: sent.length, removed: gone.length })
}
