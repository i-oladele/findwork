import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PLATFORM_FEE_RATE, platformFee } from '../api/bookings'
import { DELIVERY_FEE } from '../api/commerce'

const migrations = join(process.cwd(), 'supabase/migrations')

describe('platformFee', () => {
  it('rounds like the SQL does', () => {
    // round(12000 * 0.05) = 600
    expect(platformFee(12000)).toBe(600)
    expect(platformFee(8500)).toBe(425)
  })

  it('rounds half away from zero on a .5 result, matching Postgres round()', () => {
    // 8510 * 0.05 = 425.5
    expect(platformFee(8510)).toBe(426)
  })
})

/**
 * The frontend previously showed a 6% fee on the earnings screen while the
 * backend charged 5%. These assertions fail if the two drift apart again.
 */
describe('fee and delivery constants match the migrations', () => {
  /** The rate from the most recent migration that defines pay_booking. */
  function currentCommissionRate(): number {
    const files = readdirSync(migrations).filter((f) => f.endsWith('.sql')).sort()
    let rate: number | null = null
    for (const file of files) {
      const sql = readFileSync(join(migrations, file), 'utf8')
      if (!/create (or replace )?function public\.pay_booking/.test(sql)) continue
      const match = sql.match(/round\(p_price \* ([0-9.]+)\)/)
      if (match) rate = Number(match[1])
    }
    if (rate === null) throw new Error('no migration defines pay_booking')
    return rate
  }

  it('uses the same commission rate as pay_booking', () => {
    expect(currentCommissionRate()).toBe(PLATFORM_FEE_RATE)
  })

  it('uses the same delivery fees as place_order', () => {
    const sql = readFileSync(join(migrations, '20260815130012_functions.sql'), 'utf8')
    const match = sql.match(
      /case p_delivery_speed when 'same-day' then (\d+) else (\d+) end/,
    )
    expect(match).not.toBeNull()
    expect(Number(match![1])).toBe(DELIVERY_FEE['same-day'])
    expect(Number(match![2])).toBe(DELIVERY_FEE.standard)
  })
})
