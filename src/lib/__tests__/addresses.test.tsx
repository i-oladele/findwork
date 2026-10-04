import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Addresses } from '../../routes/settings/Addresses'

const mocks = vi.hoisted(() => ({ save: vi.fn(), remove: vi.fn() }))
vi.mock('../api', () => ({
  useAddresses: () => ({ data: [{ id: 'home', label: 'Home', recipient: 'Ada', address: '14 Home Street', phone: '+2348034129087', is_default: true }], isLoading: false, isError: false }),
  useSaveAddress: () => ({ mutateAsync: mocks.save, isPending: false }),
  useDeleteAddress: () => ({ mutateAsync: mocks.remove, isPending: false }),
}))

beforeEach(() => { vi.clearAllMocks(); mocks.save.mockResolvedValue('saved'); mocks.remove.mockResolvedValue(undefined) })
describe('address book', () => {
  it('saves an address with a normalized Nigerian phone number', async () => {
    render(<MemoryRouter><Addresses /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'Add address' }))
    fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'Work' } })
    fireEvent.change(screen.getByLabelText('Recipient'), { target: { value: 'Bisi' } })
    fireEvent.change(screen.getByLabelText('Phone number'), { target: { value: '0805 987 6543' } })
    fireEvent.change(screen.getByLabelText('Address'), { target: { value: '20 Office Road, Ikeja' } })
    fireEvent.click(screen.getByLabelText('Default delivery address'))
    fireEvent.click(screen.getByRole('button', { name: 'Save address' }))
    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith({ id: undefined, label: 'Work', recipient: 'Bisi', phone: '+2348059876543', address: '20 Office Road, Ikeja', is_default: true }))
  })

  it('preserves edits and displays an actionable save failure', async () => {
    mocks.save.mockRejectedValue(new Error('No connection'))
    render(<MemoryRouter><Addresses /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.change(screen.getByLabelText('Address'), { target: { value: '25 Changed Street' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save address' }))
    await screen.findByText('No connection')
    expect(screen.getByLabelText('Address')).toHaveValue('25 Changed Street')
  })

  it('requires explicit confirmation before removing an address', async () => {
    render(<MemoryRouter><Addresses /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(mocks.remove).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm delete' }))
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith('home'))
  })
})
