import { useQuery } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { useStaff } from './admin'
import { keys } from './keys'
import { reportRange, type AnalyticsReport } from '../analytics'

export function useAnalytics(from: string, through: string) {
  const admin = useStaff().can('analytics')
  const range = reportRange(from, through)
  return useQuery({
    queryKey: keys.admin.analytics(from, through),
    enabled: admin && Boolean(range),
    refetchInterval: 30_000,
    queryFn: async (): Promise<AnalyticsReport> => {
      if (!range) throw new Error('Choose a date range of up to 366 days.')
      const { data, error } = await supabase.rpc('admin_analytics', { p_from: range.from, p_to: range.to })
      if (error) throw error
      return data as unknown as AnalyticsReport
    },
  })
}

export type EngagementReport = {
  sessions: number; page_views: number; people: number
  top_screens: { path: string; views: number; people: number }[]
  segments: { providers: number; riders: number; business_buyers: number; verified: number }
  booking_funnel: Record<string, number>
  shopping_funnel: Record<string, number>
  retention: { new_accounts: number; back_after_a_week: number }
  bookings: {
    created: number; completed: number; cancelled: number; average_value: number; rescheduled: number
    by_category: { category: string; bookings: number; value: number }[]
    by_area: { area: string; bookings: number }[]
  }
  marketplace: {
    orders_value: number; discounts_given: number; wholesale_value: number; deliveries_completed: number; rider_payouts: number
    top_sellers: { seller: string; orders: number; value: number }[]
  }
}

export function useEngagement(from: string, through: string) {
  const admin = useStaff().can('analytics')
  const range = reportRange(from, through)
  return useQuery({
    queryKey: [...keys.admin.analytics(from, through), 'engagement'],
    enabled: admin && Boolean(range),
    refetchInterval: 60_000,
    queryFn: async (): Promise<EngagementReport> => {
      const { data, error } = await supabase.rpc('admin_engagement', { p_from: range!.from, p_to: range!.to })
      if (error) throw error
      return data as unknown as EngagementReport
    },
  })
}

export type UserActivity = {
  recorded: boolean; opted_out: boolean; sessions: number; page_views: number; last_seen: string | null
  top_screens: { path: string; views: number }[]; days: { date: string; events: number }[]
}

export function useUserActivity(profileId: string) {
  const allowed = useStaff().can('lookup')
  return useQuery({
    queryKey: [...keys.admin.user(profileId), 'activity'],
    enabled: allowed,
    queryFn: async (): Promise<UserActivity> => {
      const { data, error } = await supabase.rpc('admin_user_activity', { p_profile_id: profileId })
      if (error) throw error
      return data as unknown as UserActivity
    },
  })
}
