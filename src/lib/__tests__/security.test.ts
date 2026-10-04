import { describe, expect, it, vi } from 'vitest'
import { staffCan } from '../staff'
import { deviceLabel } from '../device'
import { recoverMfa } from '../../../supabase/functions/mfa-recover/recoverMfa.ts'

describe('staff roles', () => {
  it('gives an admin everything and everyone else only their own areas', () => {
    expect(staffCan('admin', 'roles')).toBe(true)
    expect(staffCan('finance', 'finance')).toBe(true)
    expect(staffCan('finance', 'disputes')).toBe(false)
    expect(staffCan('support', 'finance')).toBe(false)
    expect(staffCan('moderator', 'users')).toBe(true)
    expect(staffCan('moderator', 'roles')).toBe(false)
    expect(staffCan(null, 'console')).toBe(false)
  })
})

describe('device labels', () => {
  it('names the browser and system a person would recognise', () => {
    expect(deviceLabel('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36')).toBe('Chrome on Android')
    expect(deviceLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1')).toBe('Safari on iPhone')
    expect(deviceLabel('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36 Edg/126.0')).toBe('Edge on Windows')
    expect(deviceLabel('')).toBe('Browser')
  })
})

const ok = <T,>(data: T) => ({ data, error: null })
const failed = (message: string) => ({ data: null, error: { message } })

describe('recovering from a lost authenticator', () => {
  const steps = (over: Partial<Parameters<typeof recoverMfa>[2]> = {}) => ({
    consume: vi.fn(async () => ok(true)),
    listFactors: vi.fn(async () => ok({ factors: [{ id: 'f1' }, { id: 'f2' }] })),
    deleteFactor: vi.fn(async () => ok(null)),
    ...over,
  })

  it('rejects anything that is not a recovery code without spending a try', async () => {
    const s = steps()
    expect((await recoverMfa('u', '123456', s)).status).toBe(400)
    expect((await recoverMfa('u', undefined, s)).status).toBe(400)
    expect(s.consume).not.toHaveBeenCalled()
  })

  it('removes every authenticator only after the code is accepted', async () => {
    const s = steps()
    const res = await recoverMfa('u', 'ab12c-34de5', s)
    expect(res.status).toBe(200)
    expect(s.deleteFactor).toHaveBeenCalledTimes(2)
  })

  it('leaves the authenticator in place when the code is wrong', async () => {
    const s = steps({ consume: vi.fn(async () => ok(false)) })
    expect((await recoverMfa('u', 'ab12c-34de5', s)).status).toBe(400)
    expect(s.listFactors).not.toHaveBeenCalled()
  })

  it('reports the hourly limit as such', async () => {
    const s = steps({ consume: vi.fn(async () => failed('too_many_attempts')) })
    expect((await recoverMfa('u', 'ab12c-34de5', s)).status).toBe(429)
  })

  it('says so when the code was spent but removal failed', async () => {
    const s = steps({ deleteFactor: vi.fn(async () => failed('boom')) })
    const res = await recoverMfa('u', 'ab12c-34de5', s)
    expect(res.status).toBe(500)
    expect((await res.json()).error).toMatch(/Contact support/)
  })
})
