/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string | undefined
  readonly VITE_SUPABASE_ANON_KEY: string | undefined
  readonly VITE_OAUTH_PROVIDERS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
