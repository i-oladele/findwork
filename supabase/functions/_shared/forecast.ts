/**
 * Forecasting the platform's daily figures (fees, bookings, orders, sign-ups)
 * with a seasonal exponential smoothing model: additive Holt-Winters with a
 * weekly season. The model learns three things from the history — the
 * current level, the trend, and how each day of the week runs above or
 * below it — and how quickly each should follow new days, choosing the
 * smoothing constants that best predicted each next day in the history.
 *
 * Every forecast says how good it is: the last week is held back, predicted
 * from the weeks before it, and compared with what actually happened, beside
 * the simplest alternative (each day the same as a week earlier). Days that
 * the fitted model did not expect are reported as unusual.
 *
 * Used by the staff reports screen (src/lib/forecast.ts) and by the analyst
 * in the assistant Edge Function, so both read the same numbers. Kept free
 * of Deno and browser imports.
 */

export type DayValue = { date: string; value: number }
export type ForecastDay = { date: string; value: number; low: number; high: number }
export type Forecast = {
  days: ForecastDay[]
  /** How far off the model was on the held-back last week, and the week-ago baseline beside it. */
  backtest: { mae: number; baseline_mae: number; mape: number | null } | null
  model: { alpha: number; beta: number; gamma: number }
}
export type Anomaly = { date: string; value: number; expected: number; direction: 'high' | 'low' }

const PERIOD = 7
const ALPHAS = [0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]
const BETAS = [0, 0.05, 0.1, 0.2, 0.3]
const GAMMAS = [0.05, 0.1, 0.2, 0.3, 0.5]
/** An 80% interval: about one day in five falls outside it. */
const Z80 = 1.2816

type Run = { sse: number; level: number; trend: number; season: number[]; fitted: (number | null)[] }

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length

/**
 * One pass of the model over the history with given smoothing constants.
 * A day further than `clip` from what the model expected moves it only as
 * far as `clip`: one promotion or outage must not drag the following weeks.
 */
function run(y: number[], alpha: number, beta: number, gamma: number, clip = Infinity): Run {
  // Start from the first two weeks: the level at the end of week one, the
  // trend between the weeks, and each weekday's offset with the trend taken out.
  const first = mean(y.slice(0, PERIOD))
  let trend = (mean(y.slice(PERIOD, 2 * PERIOD)) - first) / PERIOD
  const season = y.slice(0, PERIOD).map((v, i) => v - (first + trend * (i - (PERIOD - 1) / 2)))
  let level = first + trend * ((PERIOD - 1) / 2)
  const fitted: (number | null)[] = y.map(() => null)
  let sse = 0
  for (let t = PERIOD; t < y.length; t++) {
    const s = season[t % PERIOD]
    const predicted = level + trend + s
    fitted[t] = predicted
    const error = Math.max(-clip, Math.min(clip, y[t] - predicted))
    const seen = predicted + error
    sse += error ** 2
    const nextLevel = alpha * (seen - s) + (1 - alpha) * (level + trend)
    trend = beta * (nextLevel - level) + (1 - beta) * trend
    season[t % PERIOD] = gamma * (seen - nextLevel) + (1 - gamma) * s
    level = nextLevel
  }
  return { sse, level, trend, season, fitted }
}

type Fitted = Run & { alpha: number; beta: number; gamma: number; typical: number }

/** The median size of the model's errors after the first two weeks, scaled to a standard deviation. */
function typicalError(y: number[], fitted: (number | null)[]): number {
  const sizes = fitted.flatMap((f, t) => (f === null || t < 2 * PERIOD ? [] : [Math.abs(y[t] - f)])).sort((a, b) => a - b)
  return sizes.length ? 1.4826 * sizes[Math.floor(sizes.length / 2)] : 0
}

function search(y: number[], clip: number): Run & { alpha: number; beta: number; gamma: number } {
  let best: (Run & { alpha: number; beta: number; gamma: number }) | null = null
  for (const alpha of ALPHAS) for (const beta of BETAS) for (const gamma of GAMMAS) {
    const r = run(y, alpha, beta, gamma, clip)
    if (!best || r.sse < best.sse - 1e-9) best = { ...r, alpha, beta, gamma }
  }
  return best!
}

/**
 * The smoothing constants that best predicted each next day, in two rounds:
 * a first fit finds the typical error, and the second caps each day's pull
 * at three of those. Needs two full weeks.
 */
function fit(y: number[]): Fitted | null {
  if (y.length < 2 * PERIOD) return null
  const floor = Math.max(1, 0.05 * mean(y.map(Math.abs)))
  const first = search(y, Infinity)
  const clip = 3 * Math.max(typicalError(y, first.fitted), floor)
  const robust = search(y, clip)
  return { ...robust, typical: typicalError(y, robust.fitted) }
}

function ahead(r: Run, n: number, h: number): number {
  return r.level + h * r.trend + r.season[(n - 1 + h) % PERIOD]
}

const nextDate = (last: string, k: number) => new Date(Date.parse(`${last}T12:00:00Z`) + k * 86_400_000).toISOString().slice(0, 10)

/** The next `days` days, with an 80% range, and how well the same model did on the last week. */
export function forecast(history: DayValue[], days = 7): Forecast | null {
  const y = history.map((h) => h.value)
  const model = fit(y)
  if (!model) return null
  // The spread of ordinary days; unusual ones are reported, not built into the range.
  const sd = model.typical || Math.sqrt(mean(model.fitted.flatMap((f, t) => (f === null ? [] : [(y[t] - f) ** 2]))))

  let backtest: Forecast['backtest'] = null
  if (y.length >= 3 * PERIOD) {
    const train = y.slice(0, -PERIOD)
    const held = y.slice(-PERIOD)
    const trained = fit(train)!
    const errors = held.map((actual, k) => Math.abs(actual - Math.max(0, ahead(trained, train.length, k + 1))))
    const baseline = held.map((actual, k) => Math.abs(actual - train[train.length - PERIOD + k]))
    const relative = held.flatMap((actual, k) => (actual > 0 ? [errors[k] / actual] : []))
    backtest = {
      mae: Math.round(mean(errors)),
      baseline_mae: Math.round(mean(baseline)),
      mape: relative.length ? Math.round(mean(relative) * 1000) / 10 : null,
    }
  }

  const last = history[history.length - 1].date
  return {
    days: Array.from({ length: days }, (_, k) => {
      const value = ahead(model, y.length, k + 1)
      const spread = Z80 * sd * Math.sqrt(k + 1)
      return {
        date: nextDate(last, k + 1),
        value: Math.max(0, Math.round(value)),
        low: Math.max(0, Math.round(value - spread)),
        high: Math.max(0, Math.round(value + spread)),
      }
    }),
    backtest,
    model: { alpha: model.alpha, beta: model.beta, gamma: model.gamma },
  }
}

/**
 * Days the fitted model did not expect: more than three typical errors from
 * its prediction for that day. The typical error is the median one, so a few
 * unusual days do not hide each other. The first two weeks only teach the
 * model and are never flagged.
 */
export function anomalies(history: DayValue[]): Anomaly[] {
  const y = history.map((h) => h.value)
  const model = fit(y)
  if (!model) return []
  const residuals = model.fitted.flatMap((f, t) => (f === null || t < 2 * PERIOD ? [] : [{ t, r: y[t] - f }]))
  const floor = Math.max(1, 0.05 * mean(y.map(Math.abs)))
  return residuals
    .filter((x) => Math.abs(x.r) > Math.max(3 * model.typical, floor))
    .map((x) => ({ date: history[x.t].date, value: y[x.t], expected: Math.max(0, Math.round(model.fitted[x.t]!)), direction: x.r > 0 ? 'high' as const : 'low' as const }))
}

/** The next days' expected values alone, for callers that need only the line. */
export function project(history: DayValue[], days = 7): DayValue[] | null {
  return forecast(history, days)?.days.map(({ date, value }) => ({ date, value })) ?? null
}
