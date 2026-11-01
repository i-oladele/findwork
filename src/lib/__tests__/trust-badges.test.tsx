import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { TrustBadge } from '../../components/ui/TrustBadge'
import { JobQuotes } from '../../routes/hiring/JobQuotes'
import { fill, I18nContext } from '../i18n'
import yo from '../../locales/yo.json'

vi.mock('../../components/ui/QuoteHistory', () => ({ QuoteHistory: () => null }))
vi.mock('../authContext', () => ({ useAuth: () => ({ user: { id: 'customer' } }) }))
vi.mock('../api/matching', () => ({
  useJobMatches: () => ({ data: [] }),
  useInviteProvider: () => ({ mutate: vi.fn(), isPending: false }),
  explainMatch: () => '',
}))
vi.mock('../api', () => ({
  platformFee: () => 0,
  useAcceptJobQuote: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCloseJob: () => ({ mutate: vi.fn(), isPending: false }),
  useWalletSummary: () => ({ data: { balance: 0 } }),
  useJob: () => ({
    isLoading: false,
    data: { id: 'job', customer_id: 'customer', title: 'Fix a leaking tap', description: 'Kitchen', status: 'open', budget: 15000, quote_count: 2, needed_by: null },
  }),
  useQuotesForJob: () => ({
    isLoading: false, isError: false, refetch: vi.fn(),
    data: [
      { id: 'q1', job_id: 'job', provider_id: 'p1', price: 12000, days: 1, start_day: null, status: 'sent', revision: 1, message: '',
        provider: { id: 'p1', business_name: 'Tunde Plumbing', reviews: 0, rating: 0, verified: false, photo_urls: [] },
        trust: { tier: 2, score: 74 } },
      { id: 'q2', job_id: 'job', provider_id: 'p2', price: 13000, days: 2, start_day: null, status: 'sent', revision: 1, message: '',
        provider: { id: 'p2', business_name: 'New Fixers', reviews: 0, rating: 0, verified: false, photo_urls: [] },
        trust: { tier: 0, score: 18 } },
    ],
  }),
}))

describe('the trust badge', () => {
  it('shows the tier and score in the reader\'s language', () => {
    const catalog = yo as Record<string, string>
    render(
      <I18nContext.Provider value={{ language: 'yo', t: (text, values) => fill(catalog[text] ?? text, values), setLanguage: () => {} }}>
        <TrustBadge tier={2} score={74} />
      </I18nContext.Provider>,
    )
    expect(screen.getByText(catalog['ID verified'])).toBeInTheDocument()
    expect(screen.getByText(fill(catalog['Trust {score}'], { score: 74 }))).toBeInTheDocument()
  })

  it('treats a missing tier as unconfirmed and leaves out a missing score', () => {
    render(<TrustBadge tier={null} score={undefined} />)
    expect(screen.getByText('Unconfirmed')).toBeInTheDocument()
    expect(screen.queryByText(/^Trust/)).toBeNull()
  })
})

describe('comparing quotes', () => {
  it('shows each quoting provider\'s verification and trust score', () => {
    render(
      <MemoryRouter initialEntries={['/jobs/job']}>
        <Routes><Route path="/jobs/:jobId" element={<JobQuotes />} /></Routes>
      </MemoryRouter>,
    )
    expect(screen.getByText('Trust 74')).toBeInTheDocument()
    expect(screen.getByText('ID verified')).toBeInTheDocument()
    expect(screen.getByText('Trust 18')).toBeInTheDocument()
    expect(screen.getByText('Unconfirmed')).toBeInTheDocument()
  })
})
