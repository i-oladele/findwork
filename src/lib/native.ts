import { Capacitor } from '@capacitor/core'

/**
 * The iPhone and Android apps run this same web app inside Capacitor. These
 * helpers are the only places it behaves differently there; on the web every
 * one of them is a no-op. Plugins are imported when first used, so the web
 * build does not carry them.
 */
export const isNativeApp = Capacitor.isNativePlatform()
export const nativePlatform = Capacitor.getPlatform() as 'ios' | 'android' | 'web'

/**
 * Whether digital purchases (plans, paid courses) may be bought here. Apple
 * requires its own in-app purchase for digital goods sold in an iPhone app,
 * so until FindWork decides to offer it, they are bought on the web or on
 * Android. Goods and services (bookings, orders, top-ups) are not affected.
 */
export const digitalPurchasesAllowed = nativePlatform !== 'ios'

/** Hosts whose links open the app instead of a browser (see public/.well-known). */
const APP_HOSTS = ['findwork.africa', 'www.findwork.africa']

/** The in-app path for a link the system handed to the app, or null when it is not ours. */
export function appPathFor(url: string): string | null {
  try {
    const parsed = new URL(url)
    const ours = parsed.protocol === 'findwork:' || (parsed.protocol === 'https:' && APP_HOSTS.includes(parsed.hostname))
    if (!ours) return null
    const path = parsed.protocol === 'findwork:' ? `/${parsed.host}${parsed.pathname}` : parsed.pathname
    return `${path.replace(/\/{2,}/g, '/')}${parsed.search}${parsed.hash}`
  } catch {
    return null
  }
}

/**
 * Opens a payment page. In the apps it opens in an in-app browser rather
 * than replacing the app, and when the browser closes the app checks the
 * payment, whether or not the return link brought it back first.
 */
export async function openPaymentPage(url: string, onClosed: () => void): Promise<void> {
  if (!isNativeApp) {
    window.location.assign(url)
    return
  }
  const { Browser } = await import('@capacitor/browser')
  const listener = await Browser.addListener('browserFinished', () => {
    void listener.remove()
    onClosed()
  })
  await Browser.open({ url, presentationStyle: 'popover' })
}

/**
 * Sets up the native shell once: status bar, splash screen, links that open
 * the app, and Android's back button.
 */
export async function startNativeShell(navigate: (path: string) => void): Promise<void> {
  if (!isNativeApp) return
  const [{ App }, { StatusBar, Style }, { SplashScreen }, { Browser }] = await Promise.all([
    import('@capacitor/app'), import('@capacitor/status-bar'), import('@capacitor/splash-screen'), import('@capacitor/browser'),
  ])
  await StatusBar.setStyle({ style: Style.Dark }).catch(() => {})
  await App.addListener('appUrlOpen', ({ url }) => {
    const path = appPathFor(url)
    if (!path) return
    void Browser.close().catch(() => {})
    navigate(path)
  })
  await App.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) window.history.back()
    else void App.exitApp()
  })
  await SplashScreen.hide()
}
