/**
 * One run of the live video meter. Kept free of Deno imports so it can be
 * unit-tested from Vitest; index.ts supplies the real LiveKit and database
 * calls.
 */

export type RoomSample = { room: string; participants: number }

/**
 * LiveKit's ListRooms answer, as { room, participants } pairs. Its JSON may
 * use the proto names (num_participants) or camel case (numParticipants), and
 * leaves out a count of zero, so all three are accepted.
 */
export function readRooms(body: unknown): RoomSample[] {
  const rooms = (body as { rooms?: unknown } | null)?.rooms
  if (!Array.isArray(rooms)) return []
  return rooms.flatMap((r) => {
    const room = r as { name?: unknown; num_participants?: unknown; numParticipants?: unknown }
    if (typeof room.name !== 'string' || !room.name) return []
    const count = Number(room.num_participants ?? room.numParticipants ?? 0)
    return [{ room: room.name, participants: Number.isFinite(count) && count > 0 ? Math.floor(count) : 0 }]
  })
}

export type MeterSteps = {
  /** RoomService.ListRooms, raw JSON. */
  listRooms: () => Promise<unknown>
  /** public.live_video_tick: records the minute and says which rooms to close. */
  tick: (rooms: RoomSample[]) => Promise<{ close?: unknown }>
  /** RoomService.DeleteRoom; true when the room is gone. */
  deleteRoom: (room: string) => Promise<boolean>
}

export async function runMeter(steps: MeterSteps): Promise<{ rooms: number; closed: number; failed: string[] }> {
  const rooms = readRooms(await steps.listRooms())
  const answer = await steps.tick(rooms)
  const close = Array.isArray(answer.close) ? answer.close.filter((r): r is string => typeof r === 'string') : []
  const failed: string[] = []
  let closed = 0
  for (const room of close) {
    // One room that will not close must not stop the others.
    const ok = await steps.deleteRoom(room).catch(() => false)
    if (ok) closed++
    else failed.push(room)
  }
  return { rooms: rooms.length, closed, failed }
}
