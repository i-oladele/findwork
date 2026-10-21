import { describe, expect, it } from 'vitest'
import { appPathFor, digitalPurchasesAllowed, isNativeApp } from '../native'

describe('the phone apps', () => {
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

  it('changes nothing on the web', () => {
    expect(isNativeApp).toBe(false)
    expect(digitalPurchasesAllowed).toBe(true)
  })
})
