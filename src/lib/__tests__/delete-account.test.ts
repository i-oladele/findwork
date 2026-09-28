import { createClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { cors } from '../../../supabase/functions/_shared/cors.ts'
import { deleteAccount, REFUSALS } from '../../../supabase/functions/delete-account/deleteAccount.ts'

/**
 * Deleting an account is irreversible, so the function must refuse whenever
 * it cannot prove the account is clear, and the browser must be able to
 * reach it at all. The function runs on Deno; its decision is tested here.
 */

describe('delete-account CORS', () => {
  it('allows every header the installed Supabase SDK sends', async () => {
    let sent: Headers | undefined
    const client = createClient('https://example.supabase.co', 'anon-key', {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: async (_input: RequestInfo | URL, init?: RequestInit) => {
          sent = new Headers(init?.headers)
          return new Response('{}', { headers: { 'Content-Type': 'application/json' } })
        },
      },
    })

    await client.functions.invoke('delete-account', { method: 'POST' })

    const allowed = cors['Access-Control-Allow-Headers'].split(',').map((h) => h.trim().toLowerCase())
    const names = [...sent!.keys()]
    expect(names).toEqual(expect.arrayContaining(['apikey', 'x-client-info', 'authorization']))
    for (const name of names) expect(allowed).toContain(name)
  })
})

type Step = () => Promise<{ error: { message: string } | null }>

const ok = { error: null }
const failed = (message: string) => ({ error: { message } })

function steps(anonymise: Step, deleteUser: Step = async () => ok) {
  return { anonymise: vi.fn(anonymise), deleteUser: vi.fn(deleteUser) }
}

describe('deleteAccount', () => {
  it('deletes the sign-in once the account is anonymised', async () => {
    const s = steps(async () => ok)
    const res = await deleteAccount('user-1', s)
    expect(res.status).toBe(200)
    expect(s.anonymise).toHaveBeenCalledWith('user-1')
    expect(s.deleteUser).toHaveBeenCalledWith('user-1')
  })

  it.each(Object.keys(REFUSALS))('refuses with a reason on %s, and deletes nothing', async (code) => {
    // PostgREST passes the exception text through as the message.
    const s = steps(async () => failed(code))
    const res = await deleteAccount('user-1', s)
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: code, message: REFUSALS[code] })
    expect(s.deleteUser).not.toHaveBeenCalled()
  })

  it('fails closed when the check itself errors', async () => {
    const s = steps(async () => failed('FetchError: connection reset'))
    const res = await deleteAccount('user-1', s)
    expect(res.status).toBe(500)
    expect((await res.json()).message).toContain('Nothing was deleted')
    expect(s.deleteUser).not.toHaveBeenCalled()
  })

  it('fails closed when the check throws instead of returning an error', async () => {
    const s = steps(async () => {
      throw new TypeError('Failed to fetch')
    })
    const res = await deleteAccount('user-1', s)
    expect(res.status).toBe(500)
    expect(s.deleteUser).not.toHaveBeenCalled()
  })

  it('reports a failed sign-in removal rather than claiming success', async () => {
    const s = steps(async () => ok, async () => failed('auth service unavailable'))
    const res = await deleteAccount('user-1', s)
    expect(res.status).toBe(500)
    expect((await res.json()).error).toBe('delete_failed')
  })

  it('sends CORS headers on every answer, so the browser can read refusals', async () => {
    const res = await deleteAccount('user-1', steps(async () => failed('open_orders')))
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
  })
})
