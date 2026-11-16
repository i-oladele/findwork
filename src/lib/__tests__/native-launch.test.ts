import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  launch: vi.fn(),
  addListener: vi.fn(async () => ({ remove: vi.fn() })),
  hide: vi.fn(),
}))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' } }))
vi.mock('@capacitor/app', () => ({ App: { getLaunchUrl: mocks.launch, addListener: mocks.addListener } }))
vi.mock('@capacitor/status-bar', () => ({ StatusBar: { setStyle: async () => {} }, Style: { Dark: 'DARK' } }))
vi.mock('@capacitor/splash-screen', () => ({ SplashScreen: { hide: mocks.hide } }))
vi.mock('@capacitor/browser', () => ({ Browser: {} }))
vi.mock('@capacitor/push-notifications', () => ({ PushNotifications: { addListener: mocks.addListener } }))
import { startNativeShell } from '../native'

beforeEach(() => vi.clearAllMocks())
describe('native cold launch', () => {
  it('restores a payment return received before listeners were ready', async () => {
    mocks.launch.mockResolvedValue({ url: 'https://findwork.africa/wallet/topup?reference=payment1' })
    const navigate = vi.fn()
    await startNativeShell(navigate)
    expect(navigate).toHaveBeenCalledWith('/wallet/topup?reference=payment1')
    expect(mocks.hide).toHaveBeenCalled()
  })
  it('ignores external launch links', async () => {
    mocks.launch.mockResolvedValue({ url: 'https://untrusted.example/wallet' })
    const navigate = vi.fn()
    await startNativeShell(navigate)
    expect(navigate).not.toHaveBeenCalled()
  })
  it('finishes startup when launch URL lookup fails', async () => {
    mocks.launch.mockRejectedValue(new Error('unavailable'))
    await startNativeShell(vi.fn())
    expect(mocks.hide).toHaveBeenCalled()
  })
})
