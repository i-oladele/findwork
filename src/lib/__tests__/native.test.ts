import { describe, expect, it, vi } from 'vitest'
import { allowsDigitalPurchases, appPathFor, digitalPurchasesAllowed, isNativeApp, pushTapPath } from '../native'
import { releaseNativePush, syncNativePush } from '../nativePush'
import { pushSupported } from '../push'
import { supabase } from '../supabase'

describe('the phone apps', () => {
  it('disables new digital purchases on both stores until store billing exists', () => {
    expect(allowsDigitalPurchases('ios')).toBe(false)
    expect(allowsDigitalPurchases('android')).toBe(false)
    expect(allowsDigitalPurchases('web')).toBe(true)
    expect(allowsDigitalPurchases('unknown')).toBe(false)
  })

  it('opens its own links in the app, keeping the path and query', () => {
    expect(appPathFor('https://findwork.africa/wallet/topup?reference=fw_1')).toBe('/wallet/topup?reference=fw_1')
    expect(appPathFor('https://www.findwork.africa/reset-password#access_token=x')).toBe('/reset-password#access_token=x')
    expect(appPathFor('findwork://courses/plumbing-safety-cert')).toBe('/courses/plumbing-safety-cert')
  })

  it('ignores anyone else\'s links', () => {
    expect(appPathFor('https://evil.example/wallet/topup')).toBeNull()
    expect(appPathFor('http://findwork.africa/wallet')).toBeNull()
    expect(appPathFor('not a url')).toBeNull()
  })

  it('changes nothing on the web', async () => {
    expect(isNativeApp).toBe(false)
    expect(digitalPurchasesAllowed).toBe(true)
    // Push in a browser still depends on the browser and the VAPID key, which jsdom lacks.
    expect(pushSupported()).toBe(false)
    // Even with a token left behind, the website never registers or releases a phone.
    const rpc = vi.spyOn(supabase, 'rpc')
    vi.stubGlobal('localStorage', { getItem: () => 'left-over-token', setItem: () => {}, removeItem: () => {} })
    await syncNativePush()
    await releaseNativePush()
    expect(rpc).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('opens the screen a tapped push is about, by way of the inbox', () => {
    expect(pushTapPath({ url: '/notifications?open=n1', notification_id: 'n1' })).toBe('/notifications?open=n1')
    expect(pushTapPath({ notification_id: 'n 1' })).toBe('/notifications?open=n%201')
    expect(pushTapPath(undefined)).toBe('/notifications')
  })

  it('never leaves the app for a link a push carries', () => {
    expect(pushTapPath({ url: 'https://evil.example/wallet' })).toBe('/notifications')
    expect(pushTapPath({ url: '//evil.example/wallet' })).toBe('/notifications')
    expect(pushTapPath({ url: '/\\evil.example' })).toBe('/notifications')
    expect(pushTapPath({ url: 42, notification_id: 'n2' })).toBe('/notifications?open=n2')
  })
})
