import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { BlockUserButton } from '../../components/ui/BlockUserButton'

const state = vi.hoisted(() => ({ mine: false, error: false, target: 'other', mutate: vi.fn(), refetch: vi.fn() }))
vi.mock('../authContext', () => ({ useAuth: () => ({ user: { id: 'me' } }) }))
vi.mock('../api/blocks', () => ({
  useBlockStatus: () => ({ data: state.error ? undefined : { mine: state.mine, blocked: state.mine }, isError: state.error, refetch: state.refetch }),
  useSetUserBlocked: () => ({ mutate: state.mutate, isPending: false, isError: false }),
}))
vi.mock('../supabase', () => ({ friendlyError: () => 'Something went wrong' }))
beforeEach(() => { cleanup(); vi.clearAllMocks(); state.mine = false; state.error = false })

describe('blocking controls', () => {
  it('requires confirmation before blocking and explains transaction access', () => {
    render(<BlockUserButton profileId="other" />)
    fireEvent.click(screen.getByRole('button', { name: 'Block user' }))
    expect(state.mutate).not.toHaveBeenCalled()
    expect(screen.getByText(/Existing bookings, payments and disputes remain available/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm block' }))
    expect(state.mutate).toHaveBeenCalledWith(true, expect.any(Object))
  })
  it('allows cancelling without a write', () => {
    render(<BlockUserButton profileId="other" />)
    fireEvent.click(screen.getByRole('button', { name: 'Block user' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(state.mutate).not.toHaveBeenCalled()
  })
  it('lets a blocker undo their own block', () => {
    state.mine = true
    render(<BlockUserButton profileId="other" />)
    fireEvent.click(screen.getByRole('button', { name: 'Unblock user' }))
    expect(state.mutate).toHaveBeenCalledWith(false)
  })
  it('does not allow self blocking', () => {
    render(<BlockUserButton profileId="me" />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
  it('provides a retry when the backend is unavailable', () => {
    state.error = true
    render(<BlockUserButton profileId="other" />)
    fireEvent.click(screen.getByRole('button', { name: /Retry/ }))
    expect(state.refetch).toHaveBeenCalled()
    expect(state.mutate).not.toHaveBeenCalled()
  })
})
