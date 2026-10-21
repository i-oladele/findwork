import type { PluginListenerHandle } from '@capacitor/core'
import { supabase } from './supabase'
import { isNativeApp, nativePlatform } from './native'
import { msg } from './msg'

/**
 * Push in the iPhone and Android apps, through Firebase Cloud Messaging
 * (README → Phone apps). The phone's token is kept in push_devices, as a
 * browser's subscription is kept in push_subscriptions; send-push delivers
 * to both. Tapping a push is handled with the rest of the shell, in native.ts.
 *
 * Push is on or off for the phone, not the account: the token is remembered
 * here, and whoever signs in on the phone gets its pushes.
 */
const TOKEN_KEY = 'findwork.pushToken'
/** Must match ANDROID_CHANNEL in supabase/functions/send-push/fcm.ts. */
const ANDROID_CHANNEL = 'findwork'
const NOT_REGISTERED = msg('This phone could not be set up for notifications. Try again later.')

const remembered = (): string | null => {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}
const remember = (token: string | null) => {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // Without storage, push is simply asked for again next time.
  }
}

const plugin = async () => (await import('@capacitor/push-notifications')).PushNotifications

/** Asks Apple or Google, through Firebase, for this phone's token. */
async function phoneToken(): Promise<string> {
  const PushNotifications = await plugin()
  // Pushes arrive in FindWork's own channel, which may show them as banners.
  if (nativePlatform === 'android') {
    await PushNotifications.createChannel({ id: ANDROID_CHANNEL, name: 'FindWork', importance: 4, visibility: 1 }).catch(() => {})
  }
  return new Promise((resolve, reject) => {
    let settled = false
    const handles: Promise<PluginListenerHandle>[] = []
    const finish = (settle: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      for (const handle of handles) void handle.then((h) => h.remove())
      settle()
    }
    const timer = setTimeout(() => finish(() => reject(new Error(NOT_REGISTERED))), 20_000)
    handles.push(PushNotifications.addListener('registration', ({ value }) => finish(() => resolve(value))))
    handles.push(PushNotifications.addListener('registrationError', ({ error }) => finish(() => {
      // Most often Firebase is not set up in this build (no google-services.json or GoogleService-Info.plist).
      console.warn('Push registration failed:', error)
      reject(new Error(NOT_REGISTERED))
    })))
    Promise.all(handles).then(() => PushNotifications.register()).catch((error: unknown) => finish(() => {
      console.warn('Push registration failed:', error)
      reject(new Error(NOT_REGISTERED))
    }))
  })
}

async function saveToken(token: string): Promise<void> {
  const { error } = await supabase.rpc('save_push_device', {
    p_token: token,
    p_platform: nativePlatform === 'ios' ? 'ios' : 'android',
    p_label: nativePlatform === 'ios' ? 'FindWork app on iPhone' : 'FindWork app on Android',
  })
  if (error) throw error
  remember(token)
}

/** Whether this phone has push on, for the person signed in. */
export async function nativePushEnabled(): Promise<boolean> {
  const token = remembered()
  if (!token) return false
  if ((await (await plugin()).checkPermissions()).receive !== 'granted') return false
  const { data, error } = await supabase.from('push_devices').select('id').eq('token', token).maybeSingle()
  if (error) throw error
  return Boolean(data)
}

/** Shows the phone's own permission prompt the first time, then registers the phone. */
export async function enableNativePush(): Promise<void> {
  const PushNotifications = await plugin()
  let { receive } = await PushNotifications.checkPermissions()
  if (receive === 'prompt' || receive === 'prompt-with-rationale') receive = (await PushNotifications.requestPermissions()).receive
  if (receive !== 'granted') throw new Error(msg('Notifications are blocked for FindWork. Allow them in your phone\'s Settings, then try again.'))
  await saveToken(await phoneToken())
}

export async function disableNativePush(): Promise<void> {
  const token = remembered()
  if (token) {
    const { error } = await supabase.rpc('remove_push_device', { p_token: token })
    if (error) throw error
  }
  remember(null)
}

/**
 * After a sign-in or a launch: the phone's pushes go to whoever is signed in
 * now, at its current token (tokens can change). Nothing is asked of them.
 */
export async function syncNativePush(): Promise<void> {
  if (!isNativeApp || !remembered()) return
  try {
    if ((await (await plugin()).checkPermissions()).receive !== 'granted') return
    await saveToken(await phoneToken())
  } catch (error) {
    console.warn('Push could not be kept up to date:', error)
  }
}

/**
 * Before signing out: stop sending this person's notifications to a phone
 * they are leaving. Push stays on for whoever signs in next.
 */
export async function releaseNativePush(): Promise<void> {
  const token = isNativeApp ? remembered() : null
  if (!token) return
  const { error } = await supabase.rpc('remove_push_device', { p_token: token })
  if (error) console.warn('Push could not be released:', error)
}
