import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { SendQuote } from '../../routes/provider/SendQuote'

const mocks = vi.hoisted(() => ({
  revise: vi.fn(), withdraw: vi.fn(), send: vi.fn(),
  quote: { id: 'quote', job_id: 'job', price: 10000, days: 2, message: 'Original offer', start_day: 'Monday', revision: 1, status: 'sent' },
}))
vi.mock('../../components/system/RequireProvider', () => ({ RequireProvider: ({ children }: { children: (provider: { plan: string }) => ReactNode }) => children({ plan: 'free' }) }))
vi.mock('../../components/ui/ReportButton', () => ({ ReportButton: () => null }))
vi.mock('../../components/ui/QuoteHistory', () => ({ QuoteHistory: () => <div>Recorded quote history</div> }))
vi.mock('../api', () => ({
  useJob: () => ({ data: { id: 'job', title: 'Repair a tap', description: 'Kitchen', status: 'open', budget: 12000, quote_count: 1 }, isLoading: false, isError: false }),
  useMySentQuotes: () => ({ data: [mocks.quote], isLoading: false, isError: false }),
  usePlans: () => ({ data: [{ id: 'free', commission_rate: 0.06 }] }),
  useSendQuote: () => ({ mutateAsync: mocks.send, isPending: false }),
  useReviseQuote: () => ({ mutateAsync: mocks.revise, isPending: false }),
  useWithdrawQuote: () => ({ mutateAsync: mocks.withdraw, isPending: false }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.quote = { id: 'quote', job_id: 'job', price: 10000, days: 2, message: 'Original offer', start_day: 'Monday', revision: 1, status: 'sent' }
  mocks.revise.mockResolvedValue(undefined)
  mocks.withdraw.mockResolvedValue(undefined)
})

describe('proposal management', () => {
  it('edits the existing offer and submits the revision that was opened, even after a background refresh', async () => {
    const tree = <MemoryRouter><SendQuote /></MemoryRouter>
    const view = render(tree)
    fireEvent.click(screen.getByRole('button', { name: 'Edit quote' }))
    expect(screen.getByLabelText('Your price')).toHaveValue('10000')
    fireEvent.change(screen.getByLabelText('Your price'), { target: { value: '11000' } })
    mocks.quote = { ...mocks.quote, price: 15000, revision: 2 }
    view.rerender(<MemoryRouter><SendQuote /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'Save revised quote' }))
    await waitFor(() => expect(mocks.revise).toHaveBeenCalledWith({ id: 'quote', revision: 1, price: 11000, days: 2, start_day: 'Monday', message: 'Original offer', milestones: null }))
    expect(mocks.send).not.toHaveBeenCalled()
  })

  it('shows stale-version errors without discarding the edited text', async () => {
    mocks.revise.mockRejectedValue({ message: 'quote_changed' })
    render(<MemoryRouter><SendQuote /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'Edit quote' }))
    fireEvent.change(screen.getByLabelText('Your message'), { target: { value: 'Updated offer' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save revised quote' }))
    await screen.findByText(/This quote has changed/)
    expect(screen.getByLabelText('Your message')).toHaveValue('Updated offer')
  })

  it('asks for confirmation before withdrawing, and supplies the version', async () => {
    render(<MemoryRouter><SendQuote /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw quote' }))
    expect(mocks.withdraw).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm withdrawal' }))
    await waitFor(() => expect(mocks.withdraw).toHaveBeenCalledWith({ id: 'quote', revision: 1 }))
  })

  it('offers a revision before resending a withdrawn offer', () => {
    mocks.quote.status = 'withdrawn'
    render(<MemoryRouter><SendQuote /></MemoryRouter>)
    expect(screen.queryByRole('button', { name: 'Withdraw quote' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Revise and resend' }))
    expect(screen.getByRole('button', { name: 'Resend quote' })).toBeInTheDocument()
    expect(screen.getByLabelText('Your message')).toHaveValue('Original offer')
  })
})
