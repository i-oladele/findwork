import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PLATFORM_FEE_RATE, platformFee } from '../api/bookings'
import { DELIVERY_FEE } from '../api/commerce'

const migrations = join(process.cwd(), 'supabase/migrations')

/** Every migration, oldest first — later ones redefine earlier functions. */
function migrationSql(): string[] {
  return readdirSync(migrations)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => readFileSync(join(migrations, f), 'utf8'))
}

/** The last value a migration assigns for a pattern, i.e. the one in force. */
function latestMatch(pattern: RegExp): RegExpMatchArray {
  let found: RegExpMatchArray | null = null
  for (const sql of migrationSql()) {
    const match = sql.match(pattern)
    if (match) found = match
  }
  if (!found) throw new Error(`no migration matches ${pattern}`)
  return found
}

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
 * backend charged 5%. These assertions fail if the two drift apart again —
 * wherever in the migrations the rule currently lives.
 */
describe('fee and delivery constants match the migrations', () => {
  it('uses the same customer service fee as the booking function', () => {
    const match = latestMatch(/v_fee := round\(p_price \* ([0-9.]+)\)/)
    expect(Number(match[1])).toBe(PLATFORM_FEE_RATE)
  })

  it('uses the same delivery fees as place_order', () => {
    const match = latestMatch(/case p_delivery_speed when 'same-day' then (\d+) else (\d+) end/)
    expect(Number(match[1])).toBe(DELIVERY_FEE['same-day'])
    expect(Number(match[2])).toBe(DELIVERY_FEE.standard)
  })

  it('charges providers the commission rate their plan advertises', () => {
    // The seed is what a real project gets, so the plan rows and the
    // features they promise must agree.
    const seed = readFileSync(join(process.cwd(), 'supabase/seed.sql'), 'utf8')
    const rows = [...seed.matchAll(/\('(free|pro|business)', '[^']+', \d+, array\[([^\]]+)\], ([0-9.]+)/g)]
    expect(rows).toHaveLength(3)
    for (const [, plan, features, rate] of rows) {
      const advertised = features.match(/(\d+)% platform fee/)
      expect(advertised, `${plan} should advertise a fee`).not.toBeNull()
      expect(Number(rate) * 100).toBe(Number(advertised![1]))
    }
  })
})
