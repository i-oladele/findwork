/**
 * A projection of the next days from the recent past: a straight-line trend
 * through the daily values, adjusted for which days of the week run high or
 * low. It is arithmetic on a few weeks of history, not a prediction model,
 * and says nothing a chart of the same numbers would not suggest.
 */
export type Projection = { date: string; value: number }[]

export function project(history: { date: string; value: number }[], days = 7): Projection | null {
  // Fewer than two weeks cannot separate a trend from a weekly rhythm.
  if (history.length < 14) return null
  const n = history.length
  const xs = history.map((_, i) => i)
  const meanX = (n - 1) / 2
  const meanY = history.reduce((sum, h) => sum + h.value, 0) / n
  const slope = xs.reduce((sum, x, i) => sum + (x - meanX) * (history[i].value - meanY), 0) / xs.reduce((sum, x) => sum + (x - meanX) ** 2, 0)
  const trend = (x: number) => meanY + slope * (x - meanX)

  // How far each weekday sits above or below the trend, on average.
  const offsets = Array.from({ length: 7 }, () => ({ total: 0, count: 0 }))
  history.forEach((h, i) => {
    const weekday = new Date(`${h.date}T12:00:00Z`).getUTCDay()
    offsets[weekday].total += h.value - trend(i)
    offsets[weekday].count += 1
  })
  const last = new Date(`${history[n - 1].date}T12:00:00Z`)
  return Array.from({ length: days }, (_, k) => {
    const day = new Date(last.getTime() + (k + 1) * 86_400_000)
    const offset = offsets[day.getUTCDay()]
    const value = trend(n + k) + (offset.count ? offset.total / offset.count : 0)
    return { date: day.toISOString().slice(0, 10), value: Math.max(0, Math.round(value)) }
  })
}
