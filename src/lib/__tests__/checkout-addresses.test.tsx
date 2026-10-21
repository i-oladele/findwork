import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Checkout } from '../../routes/commerce/Checkout'
import { useCart } from '../../store/cart'
import { createJSONStorage } from 'zustand/middleware'

const mocks = vi.hoisted(() => ({ place: vi.fn(), update: vi.fn(), refetch: vi.fn(), start: vi.fn(), go: vi.fn(), addressesError: false, balance: 50000 }))
vi.mock('../api', () => ({
  DELIVERY_FEE: { standard: 1200, 'same-day': 1800 },
  useProfile: () => ({ data: { full_name: 'Buyer', address: 'Old profile address', phone: '+2348034129087' }, isLoading: false, isError: false }),
  useAddresses: () => ({ data: mocks.addressesError ? undefined : [
    { id: 'home', label: 'Home', recipient: 'Ada', address: '14 Home Street, Yaba', phone: '+2348034129087', is_default: true },
    { id: 'office', label: 'Office', recipient: 'Bisi', address: '20 Office Street, Ikeja', phone: '+2348059876543', is_default: false },
  ], isLoading: false, isError: mocks.addressesError, refetch: mocks.refetch }),
  useWalletSummary: () => ({ data: { balance: mocks.balance }, isFetching: false }),
  useCheckoutQuote: () => ({ data: { items_total: 10000, delivery_fee: 1200, seller_count: 1, total: 11200 }, isFetching: false, isError: false, refetch: mocks.refetch }),
  usePlaceOrder: () => ({ mutateAsync: mocks.place, isPending: false }),
  useStartPayment: () => ({ mutateAsync: mocks.start, isPending: false }),
  usePaystackAvailable: () => ({ data: true }),
  useUpdateProfile: () => ({ mutate: mocks.update }),
}))
vi.mock('../payRedirect', () => ({ goToPaystack: mocks.go }))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.addressesError = false
  mocks.balance = 50000
  mocks.start.mockResolvedValue({ reference: 'fw_ref', amount: 11200, authorization_url: 'https://checkout.paystack.com/abc' })
  mocks.place.mockResolvedValue(['order-id'])
  const storage = new Map<string, string>()
  useCart.persist.setOptions({ storage: createJSONStorage(() => ({ getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => { storage.set(key, value) }, removeItem: (key) => { storage.delete(key) } })) })
  useCart.setState({ lines: [{ productId: 'fabric', qty: 1 }] })
})

describe('saved delivery addresses at checkout', () => {
  it('selects the default and pays using a delivery snapshot of the selected recipient, address and phone', async () => {
    render(<MemoryRouter><Checkout /></MemoryRouter>)
    expect(screen.getByLabelText('Delivery address')).toHaveValue('14 Home Street, Yaba')
    fireEvent.change(screen.getByLabelText('Saved delivery address'), { target: { value: 'office' } })
    expect(screen.getByLabelText('Recipient name')).toHaveValue('Bisi')
    fireEvent.click(screen.getByRole('button', { name: /Pay .* from wallet/ }))
    await waitFor(() => expect(mocks.place).toHaveBeenCalledWith({
      items: [{ product_id: 'fabric', qty: 1 }], deliverySpeed: 'standard',
      address: 'Bisi\n20 Office Street, Ikeja', phone: '+2348059876543', expectedTotal: 11200,
    }))
    expect(useCart.getState().lines).toEqual([])
  })

  it('keeps an edited address and prevents payment without a valid contact number', () => {
    render(<MemoryRouter><Checkout /></MemoryRouter>)
    fireEvent.change(screen.getByLabelText('Delivery address'), { target: { value: '25 New Street, Lagos' } })
    expect(screen.getByLabelText('Saved delivery address')).toHaveValue('')
    fireEvent.change(screen.getByLabelText('Phone number for the rider'), { target: { value: '123' } })
    expect(screen.getByRole('button', { name: 'Add a valid phone number' })).toBeDisabled()
    expect(mocks.place).not.toHaveBeenCalled()
  })

  it('allows manual delivery entry when the address book cannot load', () => {
    mocks.addressesError = true
    render(<MemoryRouter><Checkout /></MemoryRouter>)
    expect(screen.getByLabelText('Delivery address')).toHaveValue('Old profile address')
    expect(screen.getByText(/Saved addresses could not be loaded/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Pay .* from wallet/ })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(mocks.refetch).toHaveBeenCalledOnce()
  })

  it('keeps the cart and address when payment fails', async () => {
    mocks.place.mockRejectedValue(new Error('Payment unavailable'))
    render(<MemoryRouter><Checkout /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: /Pay .* from wallet/ }))
    await screen.findByText('Payment unavailable')
    expect(useCart.getState().lines).toHaveLength(1)
    expect(screen.getByLabelText('Delivery address')).toHaveValue('14 Home Street, Yaba')
  })

  it('pays by card when the wallet is short, for exactly the quoted total, and keeps the cart until it is paid', async () => {
    mocks.balance = 5000
    render(<MemoryRouter><Checkout /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'Pay ₦11,200 by card' }))
    await waitFor(() => expect(mocks.start).toHaveBeenCalledWith({
      purpose: 'checkout', items: [{ product_id: 'fabric', qty: 1 }], delivery_speed: 'standard',
      address: 'Ada\n14 Home Street, Yaba', phone: '+2348034129087', coupon_code: null, expected_total: 11200,
    }))
    expect(mocks.go).toHaveBeenCalledWith('fw_ref', 'https://checkout.paystack.com/abc', '/orders')
    expect(mocks.place).not.toHaveBeenCalled()
    expect(useCart.getState().lines).toHaveLength(1)
  })

  it('lets a customer with enough in the wallet choose the card instead', async () => {
    render(<MemoryRouter><Checkout /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: /Card or bank transfer/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Pay ₦11,200 by card' }))
    await waitFor(() => expect(mocks.start).toHaveBeenCalled())
    expect(mocks.place).not.toHaveBeenCalled()
  })
})
