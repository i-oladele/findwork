/**
 * Which social sign-in buttons to show.
 *
 * A provider has to be enabled in two places: the Supabase dashboard (with
 * credentials from Google or Apple) and here. Showing a button for a
 * provider the project has not been given credentials for just produces
 * "Unsupported provider: provider is not enabled" when someone taps it, so
 * the list is opt-in rather than on by default.
 *
 * Set VITE_OAUTH_PROVIDERS=google  (or google,apple) in .env.local once the
 * provider is configured.
 */
export type OAuthProvider = 'google' | 'apple'

const SUPPORTED: OAuthProvider[] = ['google', 'apple']

export const oauthProviders: OAuthProvider[] = (import.meta.env.VITE_OAUTH_PROVIDERS ?? '')
  .split(',')
  .map((name: string) => name.trim().toLowerCase())
  .filter((name: string): name is OAuthProvider => SUPPORTED.includes(name as OAuthProvider))

export const OAUTH_LABELS: Record<OAuthProvider, { label: string; icon: string }> = {
  google: { label: 'Google', icon: 'ph-bold ph-google-logo' },
  apple: { label: 'Apple', icon: 'ph-fill ph-apple-logo' },
}
