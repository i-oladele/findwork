import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useSubscribe } from '../api/billing'
import { useEnroll } from '../api/learning'
import { useStartPayment } from '../api/wallet'

const mocks = vi.hoisted(() => ({ allowed: false, price: 5000, rpc: vi.fn(), invoke: vi.fn(), single: vi.fn() }))
vi.mock('../native', () => ({ get digitalPurchasesAllowed() { return mocks.allowed } }))
vi.mock('../authContext', () => ({ useAuth: () => ({ user: { id: 'buyer' } }) }))
vi.mock('../supabase', () => ({ supabase: {
  rpc: mocks.rpc,
  functions: { invoke: mocks.invoke },
  from: () => ({ select: () => ({ eq: () => ({ single: mocks.single }) }) }),
} }))
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>{children}</QueryClientProvider>
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.allowed = false
  mocks.price = 5000
  mocks.rpc.mockResolvedValue({ data: null, error: null })
  mocks.invoke.mockResolvedValue({ data: { reference: 'ref', authorization_url: 'https://checkout.example', amount: 10000 }, error: null })
  mocks.single.mockImplementation(async () => ({ data: { price: mocks.price }, error: null }))
})
describe('phone digital purchase restrictions', () => {
  it('refuses a plan wallet charge before calling the server', async () => {
    const { result } = renderHook(() => useSubscribe(), { wrapper })
    await act(async () => { await expect(result.current.mutateAsync('pro')).rejects.toThrow('unavailable') })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('refuses a plan card checkout before calling Paystack', async () => {
    const { result } = renderHook(() => useStartPayment(), { wrapper })
    await act(async () => { await expect(result.current.mutateAsync({ purpose: 'plan', plan: 'pro', save_card: true })).rejects.toThrow('unavailable') })
    expect(mocks.invoke).not.toHaveBeenCalled()
  })
  it('checks the course price and refuses a new paid enrollment', async () => {
    const { result } = renderHook(() => useEnroll(), { wrapper })
    await act(async () => { await expect(result.current.mutateAsync('paid')).rejects.toThrow('unavailable') })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('continues to allow free course enrollment', async () => {
    mocks.price = 0
    const { result } = renderHook(() => useEnroll(), { wrapper })
    await act(async () => { await result.current.mutateAsync('free') })
    expect(mocks.rpc).toHaveBeenCalledWith('enroll_in_course', { p_course_id: 'free' })
  })
  it('continues to allow paid enrollment on the website', async () => {
    mocks.allowed = true
    const { result } = renderHook(() => useEnroll(), { wrapper })
    await act(async () => { await result.current.mutateAsync('paid') })
    expect(mocks.rpc).toHaveBeenCalledWith('enroll_in_course', { p_course_id: 'paid' })
  })
})
