import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { allowanceSummary, cameraAvailability, minutesLeft, videoLimitMessage, type LiveVideoAllowance } from '../stream'
import { readRooms, runMeter } from '../../../supabase/functions/livekit-meter/meter.ts'
import { joinGrant, serverGrant } from '../../../supabase/functions/livekit-token/livekitToken.ts'

const mocks = vi.hoisted(() => ({ allowance: null as unknown }))
vi.mock('../../components/system/RequireProvider', () => ({ RequireProvider: ({ children }: { children: () => ReactNode }) => children() }))
vi.mock('../api', () => ({
  productImage: () => '',
  useMyProducts: () => ({ data: [] }),
  useScheduleStream: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useLiveVideoAvailable: () => ({ data: true }),
  useLiveVideoAllowance: () => ({ data: mocks.allowance }),
  useRemoveStreamMessage: () => ({}), useSendStreamMessage: () => ({}), useStream: () => ({}), useStreamMessages: () => ({}),
  useStreamProducts: () => ({}), useStreams: () => ({}), useStreamViewers: () => ({}), useUpdateStream: () => ({}),
}))
const { NewStream } = await import('../../routes/social/Live')

const base: LiveVideoAllowance = {
  used: 312, allowance: 750, state: 'open', stream_minutes: 60, preview_minutes: 15, max_viewers: 50, resets_at: '2026-12-01T00:00:00Z',
}

describe('live video limits, as the seller sees them', () => {
  it('explains each limit that stops someone joining', () => {
    expect(videoLimitMessage('budget')).toMatch(/used up for this month/)
    expect(videoLimitMessage('allowance')).toMatch(/until your minutes reset/)
    expect(videoLimitMessage('full')).toMatch(/full right now/)
    expect(videoLimitMessage(undefined)).toBe('This stream is not open to watch.')
  })

  it('counts the minutes left on a live stream, never below zero', () => {
    const now = Date.parse('2026-11-01T12:00:00Z')
    expect(minutesLeft('2026-11-01T11:30:00Z', 60, now)).toBe(30)
    expect(minutesLeft('2026-11-01T11:00:30Z', 60, now)).toBe(1)
    expect(minutesLeft('2026-11-01T10:00:00Z', 60, now)).toBe(0)
    expect(minutesLeft(null, 60, now)).toBeNull()
  })

  it('offers the camera only while the platform is open and the seller has minutes left', () => {
    expect(cameraAvailability(base)).toEqual({ ok: true })
    expect(cameraAvailability({ ...base, state: 'paused' }).ok).toBe(false)
    expect(cameraAvailability({ ...base, used: 750 }).ok).toBe(false)
    expect(allowanceSummary({ ...base, used: 900 })).toBe('750 of 750 live video minutes used this month')
  })

  it('switches the form to a YouTube link when the allowance is used up', () => {
    mocks.allowance = { ...base, used: 760 }
    render(<MemoryRouter><NewStream /></MemoryRouter>)
    expect(screen.getByRole('button', { name: /From this phone/ })).toBeDisabled()
    expect(screen.getByLabelText(/Link where people watch the video/)).toBeInTheDocument()
    expect(screen.getByText(/until your minutes reset/)).toBeInTheDocument()
  })

  it('shows what a camera stream may use while there is allowance', () => {
    mocks.allowance = base
    render(<MemoryRouter><NewStream /></MemoryRouter>)
    expect(screen.getByRole('button', { name: /From this phone/ })).toBeEnabled()
    expect(screen.getByText(/312 of 750 live video minutes used this month/)).toBeInTheDocument()
    expect(screen.getByText(/up to 50 people watching at once/)).toBeInTheDocument()
  })
})

describe('the live video meter', () => {
  it('reads LiveKit room lists in either JSON style, treating a missing count as zero', () => {
    expect(readRooms({ rooms: [
      { name: 'stream-a', num_participants: 3 },
      { name: 'stream-b', numParticipants: 2 },
      { name: 'stream-c' },
      { num_participants: 9 },
    ] })).toEqual([
      { room: 'stream-a', participants: 3 },
      { room: 'stream-b', participants: 2 },
      { room: 'stream-c', participants: 0 },
    ])
    expect(readRooms({})).toEqual([])
    expect(readRooms(null)).toEqual([])
  })

  it('records the minute, then closes what the database says to, carrying on past a failure', async () => {
    const deleted: string[] = []
    const tick = vi.fn(async () => ({ close: ['stream-a', 'stream-b', 42] }))
    const result = await runMeter({
      listRooms: async () => ({ rooms: [{ name: 'stream-a', num_participants: 4 }] }),
      tick,
      deleteRoom: async (room) => {
        if (room === 'stream-a') throw new Error('LiveKit down')
        deleted.push(room)
        return true
      },
    })
    expect(tick).toHaveBeenCalledWith([{ room: 'stream-a', participants: 4 }])
    expect(deleted).toEqual(['stream-b'])
    expect(result).toEqual({ rooms: 1, closed: 1, failed: ['stream-a'] })
  })

  it('asks LiveKit with the permissions its room API requires', () => {
    expect(serverGrant('delete', 'stream-a')).toEqual({ room: 'stream-a', roomCreate: true })
    expect(serverGrant('list')).toEqual({ roomList: true })
    expect(joinGrant('stream-a', false)).not.toHaveProperty('roomCreate')
  })
})
