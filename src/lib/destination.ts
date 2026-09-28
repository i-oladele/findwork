/**
 * Where to take someone once they are signed in.
 *
 * People often arrive through a shared link to a provider or a product. The
 * sign-in guard sends them to /welcome, and signing up takes several screens,
 * so the link they came for is kept here and honoured at the end, instead of
 * everyone landing on /home. Session storage: it belongs to this tab's
 * journey, and it survives the round trip to Google for social sign-in.
 */
const KEY = 'fw.destination'

/** Same-app paths only: this value ends up in navigate() and OAuth redirects. */
export function isAppPath(path: string | null | undefined): path is string {
  return typeof path === 'string' && path.startsWith('/') && !path.startsWith('//') && !path.startsWith('/\\')
}

export function rememberDestination(path: string | null) {
  try {
    if (isAppPath(path)) sessionStorage.setItem(KEY, path)
    else sessionStorage.removeItem(KEY)
  } catch {
    // Private mode or blocked storage: people still land on /home.
  }
}

/** The remembered path, or null. Does not clear it. */
export function storedDestination(): string | null {
  try {
    const path = sessionStorage.getItem(KEY)
    return isAppPath(path) ? path : null
  } catch {
    return null
  }
}

export function destination(fallback = '/home'): string {
  return storedDestination() ?? fallback
}

export function forgetDestination() {
  rememberDestination(null)
}

/**
 * Where a brand-new account goes: choose a role first, then on to the link
 * they arrived with, carried in the URL so a refresh keeps it.
 */
export function onboardingPath(next: string | null = storedDestination()): string {
  return isAppPath(next) && !next.startsWith('/role') ? `/role?next=${encodeURIComponent(next)}` : '/role'
}
