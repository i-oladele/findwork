/**
 * Forecasts for the staff reports: a seasonal model (Holt-Winters, weekly
 * season) fitted to the selected days, with a likely range, a check against
 * the last week, and the days it did not expect. The model lives beside the
 * Edge Functions so the analyst reads exactly the same numbers.
 */
export { anomalies, forecast, project } from '../../supabase/functions/_shared/forecast.ts'
export type { Anomaly, DayValue, Forecast, ForecastDay } from '../../supabase/functions/_shared/forecast.ts'

/** Kept for callers that only need the projected values. */
export type Projection = { date: string; value: number }[]
