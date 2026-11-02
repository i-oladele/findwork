import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { livekitSettingsSql, paystackSettingsSql, SERVER_KEYS, serverSecrets, valueOf } from '../../../scripts/push-secrets.ts'

const ENV = `
# app
VITE_SUPABASE_URL=https://example.supabase.co
VITE_SUPABASE_ANON_KEY=public-anon
VITE_VAPID_PUBLIC_KEY=BPublicKeyForBrowsers
VITE_OAUTH_PROVIDERS=

# server
PAYSTACK_SECRET_KEY=sk_test_abc
APP_URL=http://localhost:5173
DOJAH_APP_ID=
DOJAH_SECRET_KEY=''
FCM_SERVICE_ACCOUNT_JSON='{"type":"service_account","private_key":"-----BEGIN-----\\nabc\\n-----END-----\\n"}'
`

describe('uploading server keys from .env.local', () => {
  it('takes only filled server lines, exactly as written', () => {
    const found = serverSecrets(ENV)
    expect(found.problems).toEqual([])
    expect(found.names).toEqual(['PAYSTACK_SECRET_KEY', 'APP_URL', 'FCM_SERVICE_ACCOUNT_JSON'])
    expect(found.lines[2]).toBe(`FCM_SERVICE_ACCOUNT_JSON='{"type":"service_account","private_key":"-----BEGIN-----\\nabc\\n-----END-----\\n"}'`)
    expect(found.empty).toEqual(['DOJAH_APP_ID', 'DOJAH_SECRET_KEY'])
  })

  it('never uploads the app settings', () => {
    expect(serverSecrets(ENV).lines.some((l) => l.startsWith('VITE_'))).toBe(false)
  })

  it('can upload just the named keys', () => {
    expect(serverSecrets(ENV, ['APP_URL']).names).toEqual(['APP_URL'])
    expect(serverSecrets(ENV, ['NOPE']).problems).toEqual(['NOPE is not in .env.local'])
  })

  it('stops when a secret has been given a VITE_ prefix', () => {
    const found = serverSecrets('VITE_PAYSTACK_SECRET_KEY=sk_live_x\nVITE_SOMETHING_TOKEN=y\nVITE_VAPID_PRIVATE_KEY=z')
    expect(found.problems).toHaveLength(3)
    expect(found.problems[0]).toContain('sent to browsers')
  })

  it('stops on misspelt, duplicated, Supabase-owned or malformed lines, without echoing values', () => {
    const found = serverSecrets('PAYSTAK_SECRET_KEY=sk_test_1\nAPP_URL=a\nAPP_URL=b\nSUPABASE_SERVICE_ROLE_KEY=eyJsecret\nnot a line sk_live_zzz')
    expect(found.problems).toEqual([
      'PAYSTAK_SECRET_KEY is not a key the server functions read; check the spelling',
      'APP_URL appears more than once',
      'SUPABASE_SERVICE_ROLE_KEY is set by Supabase itself; remove it',
      'line 5 is not NAME=value',
    ])
    expect(found.problems.join(' ')).not.toMatch(/sk_test_1|eyJsecret|sk_live_zzz/)
  })

  it('knows every key the server functions read', () => {
    const dir = join(process.cwd(), 'supabase/functions')
    const files = (d: string): string[] => readdirSync(d).flatMap((n) => {
      const p = join(d, n)
      return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : []
    })
    const read = new Set(files(dir).flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/Deno\.env\.get\('([A-Z_]+)'\)/g)].map((m) => m[1])))
    const missing = [...read].filter((name) => !name.startsWith('SUPABASE_') && !SERVER_KEYS.has(name))
    expect(missing).toEqual([])
  })

  it('reads a value with or without quotes', () => {
    expect(valueOf('APP_URL=http://localhost:5173')).toBe('http://localhost:5173')
    expect(valueOf(`FCM_PROJECT_ID='findwork-app'`)).toBe('findwork-app')
    expect(valueOf('X="a=b"')).toBe('a=b')
  })

  it('points the database at this project\'s Paystack functions, with the same secret', () => {
    const sql = paystackSettingsSql('yletjxnmsytdmhtsyezd', "abc'123")
    expect(sql).toContain("('paystack_charge_url', 'https://yletjxnmsytdmhtsyezd.supabase.co/functions/v1/paystack-charge')")
    expect(sql).toContain("('paystack_payout_url', 'https://yletjxnmsytdmhtsyezd.supabase.co/functions/v1/paystack-payout')")
    expect(sql).toContain("('paystack_hook_secret', 'abc''123')")
    expect(sql).toContain('on conflict (key) do update')
    expect(() => paystackSettingsSql("x'; drop table", 's')).toThrow()
  })

  it('points the database at the live video meter, with the same secret', () => {
    const sql = livekitSettingsSql('yletjxnmsytdmhtsyezd', 'meter-secret')
    expect(sql).toContain("('livekit_tick_url', 'https://yletjxnmsytdmhtsyezd.supabase.co/functions/v1/livekit-meter')")
    expect(sql).toContain("('livekit_hook_secret', 'meter-secret')")
  })
})
