import { supabase } from './supabase'
import { deviceLabel } from './device'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

/** Push needs a service worker, the Push API, and a key to subscribe with. iPhones need the app added to the Home Screen first. */
export function pushSupported(): boolean {
  return Boolean(VAPID_PUBLIC_KEY) && typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

/** The applicationServerKey the browser wants: the URL-safe base64 key as bytes. */
export function vapidKeyBytes(key: string): Uint8Array {
  const padded = (key + '='.repeat((4 - (key.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(padded)
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

const keyOf = (subscription: PushSubscription, name: 'p256dh' | 'auth') => {
  const buffer = subscription.getKey(name)
  if (!buffer) throw new Error('This browser did not provide a push key.')
  return btoa(String.fromCharCode(...new Uint8Array(buffer))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function registration() {
  return (await navigator.serviceWorker.getRegistration('/')) ?? (await navigator.serviceWorker.register('/sw.js', { scope: '/' }))
}

/** Whether this browser is currently subscribed. */
export async function pushEnabled(): Promise<boolean> {
  if (!pushSupported() || Notification.permission !== 'granted') return false
  const existing = await navigator.serviceWorker.getRegistration('/')
  return Boolean(await existing?.pushManager.getSubscription())
}

/** Asks permission, subscribes this browser and tells the server where to send. */
export async function enablePush(): Promise<void> {
  if (!pushSupported()) throw new Error('This browser cannot receive push notifications. On an iPhone, add FindWork to your Home Screen first.')
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Notifications are blocked for FindWork. Allow them in your browser settings, then try again.')
  const reg = await registration()
  await navigator.serviceWorker.ready
  const subscription =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidKeyBytes(VAPID_PUBLIC_KEY!) as BufferSource }))
  const { error } = await supabase.rpc('save_push_subscription', {
    p_endpoint: subscription.endpoint,
    p_p256dh: keyOf(subscription, 'p256dh'),
    p_auth: keyOf(subscription, 'auth'),
    p_label: deviceLabel(),
  })
  if (error) throw error
}

export async function disablePush(): Promise<void> {
  const existing = await navigator.serviceWorker.getRegistration('/')
  const subscription = await existing?.pushManager.getSubscription()
  if (!subscription) return
  const { error } = await supabase.rpc('remove_push_subscription', { p_endpoint: subscription.endpoint })
  if (error) throw error
  await subscription.unsubscribe()
}
