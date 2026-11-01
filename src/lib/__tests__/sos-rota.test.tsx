import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { RiskTab } from '../../routes/admin/RiskTab'
import { OnCallRota } from '../../routes/admin/OnCallRota'

const NOW = new Date('2026-11-01T12:00:00Z')
const hours = (h: number) => new Date(NOW.getTime() + h * 3_600_000).toISOString()

const mocks = vi.hoisted(() => ({
  role: 'moderator' as string,
  take: vi.fn(),
  handle: vi.fn(),
  save: vi.fn(),
  remove: vi.fn(),
  sos: [] as unknown[],
  rota: { shifts: [] as unknown[], gaps: [] as unknown[] },
}))
const query = <T,>(data: T) => ({ data, isLoading: false, isError: false, refetch: vi.fn() })

vi.mock('../api', () => ({
  useStaff: () => ({ role: mocks.role, can: () => true }),
  useProfile: () => ({ data: { id: 'me' } }),
  useRiskAlerts: () => query([]),
  useReviewRiskAlert: () => ({ mutate: vi.fn(), isPending: false }),
  useAdminSos: () => query(mocks.sos),
  useAdminTakeSos: () => ({ mutate: mocks.take, isPending: false }),
  useAdminHandleSos: () => ({ mutate: mocks.handle, isPending: false }),
  useSosRota: () => query(mocks.rota),
  useSosStaff: () => query([{ id: 'ngozi', full_name: 'Ngozi E.', staff_role: 'moderator' }]),
  useSaveSosShift: () => ({ mutate: mocks.save, isPending: false }),
  useRemoveSosShift: () => ({ mutate: mocks.remove, isPending: false }),
}))

const alert = {
  id: 'sos1', profile_id: 'p1', full_name: 'Amaka O.', phone: '+2348031234567', lat: 6.6, lng: 3.34, note: 'Feel unsafe',
  created_at: new Date(NOW.getTime() - 4 * 60_000).toISOString(),
  meetup_id: 'm1', meetup_title: 'Used fridge', meetup_place: 'Ikeja City Mall', meet_at: hours(-1), other_id: 'p2', other_name: 'Tayo B.',
  assigned_to: 'ngozi', assigned_name: 'Ngozi E.', acknowledged_by: null, acknowledged_name: null, acknowledged_at: null, escalation_level: 1,
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  vi.clearAllMocks()
  mocks.role = 'moderator'
  mocks.sos = [alert]
  mocks.rota = {
    shifts: [{ id: 's1', staff_id: 'ngozi', duty: 'primary', starts_at: hours(-2), ends_at: hours(6), created_by: 'admin', created_at: hours(-24), staff: { full_name: 'Ngozi E.' } }],
    gaps: [{ starts_at: hours(6), ends_at: hours(48) }],
  }
})

describe('the SOS queue', () => {
  it('shows who is on call, that nobody has taken it, how to call, and who they were meeting', () => {
    render(<MemoryRouter><RiskTab onError={vi.fn()} /></MemoryRouter>)
    expect(screen.getByText('On call for SOS: Ngozi E.')).toBeInTheDocument()
    expect(screen.getByText(/Nobody has taken this yet \(4 min\)/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Call \+2348031234567/ })).toHaveAttribute('href', 'tel:+2348031234567')
    expect(screen.getByText(/Meeting Tayo B\. for “Used fridge” at Ikeja City Mall/)).toBeInTheDocument()
  })

  it('takes the alert with one tap', () => {
    render(<MemoryRouter><RiskTab onError={vi.fn()} /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: "I'm on it" }))
    expect(mocks.take).toHaveBeenCalledWith('sos1', expect.anything())
  })

  it('once taken, says who took it and offers no second take', () => {
    mocks.sos = [{ ...alert, acknowledged_by: 'me', acknowledged_name: 'Me', acknowledged_at: NOW.toISOString() }]
    render(<MemoryRouter><RiskTab onError={vi.fn()} /></MemoryRouter>)
    expect(screen.getByText(/You took this at/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: "I'm on it" })).toBeNull()
  })

  it('warns loudly when nobody is on call', () => {
    mocks.rota = { shifts: [], gaps: [{ starts_at: hours(-1), ends_at: hours(48) }] }
    render(<MemoryRouter><RiskTab onError={vi.fn()} /></MemoryRouter>)
    expect(screen.getByText('Nobody is on call for SOS right now')).toBeInTheDocument()
  })
})

describe('the on-call rota', () => {
  it('lists the gaps; only admins can change the rota', () => {
    render(<MemoryRouter><OnCallRota /></MemoryRouter>)
    expect(screen.getByText('On call now: Ngozi E.')).toBeInTheDocument()
    expect(screen.getByText(/Sun 1 Nov, 19:00 to Tue 3 Nov, 13:00/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Fill' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Add shift' })).toBeNull()
  })

  it('fills a gap as a Lagos-time shift', async () => {
    mocks.role = 'admin'
    render(<MemoryRouter><OnCallRota /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'Fill' }))
    expect(screen.getByLabelText('Starts (Lagos time)')).toHaveValue('2026-11-01T19:00')
    fireEvent.change(screen.getByLabelText('Who'), { target: { value: 'ngozi' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add shift' }))
    await waitFor(() => expect(mocks.save).toHaveBeenCalled())
    const [input] = mocks.save.mock.calls[0]
    expect(input.staffId).toBe('ngozi')
    expect(input.duty).toBe('primary')
    expect(input.startsAt.toISOString()).toBe(hours(6))
    expect(input.endsAt.toISOString()).toBe(hours(48))
  })

  it('ends a shift under way rather than deleting it', () => {
    mocks.role = 'admin'
    render(<MemoryRouter><OnCallRota /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'End this shift now' }))
    expect(mocks.remove).toHaveBeenCalledWith('s1', expect.anything())
  })
})
