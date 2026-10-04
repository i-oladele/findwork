import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { useProfile } from './profile'
import { keys } from './keys'
import { staffCan, type StaffArea } from '../staff'
import type { BusinessVerification, Dispute, PaymentIntent, ProviderProfile, Report, RiskAlert, StaffRole, SupportRequest, Verification, Withdrawal } from '../database.types'
import type { OrderWithItems } from './commerce'

/**
 * The operator console's data. Every read here is also gated by RLS
 * (public.is_admin()) and every write by a check inside the RPC, so these
 * hooks return nothing useful to a non-admin even if the screen is reached.
 */
export function useIsAdmin() {
  const { data } = useProfile()
  return Boolean(data?.is_admin)
}

/** The signed-in person's staff role, and what it lets them open. */
export function useStaff() {
  const { data } = useProfile()
  const role = data?.staff_role ?? null
  return { role, can: (area: StaffArea) => staffCan(role, area) }
}

function useStaffCan(area: StaffArea) {
  return useStaff().can(area)
}

type Named = { full_name: string } | null

export type AdminDispute = Dispute & { raiser: Named; against: Named }

export function useAdminDisputes() {
  const isAdmin = useStaffCan('disputes')
  return useQuery({
    queryKey: keys.admin.disputes(),
    enabled: isAdmin,
    refetchInterval: 15_000,
    queryFn: async (): Promise<AdminDispute[]> => {
      const { data, error } = await supabase
        .from('disputes')
        .select(
          '*, raiser:profiles!disputes_raised_by_fkey(full_name), against:profiles!disputes_against_id_fkey(full_name)',
        )
        .eq('status', 'open')
        .order('opened_at')
      if (error) throw error
      return data as unknown as AdminDispute[]
    },
  })
}

export type AdminOrder = OrderWithItems & { customer: Named }

export function useAdminOrders() {
  const isAdmin = useStaffCan('orders')
  return useQuery({
    queryKey: keys.admin.orders(),
    enabled: isAdmin,
    queryFn: async (): Promise<AdminOrder[]> => {
      const { data, error } = await supabase
        .from('orders')
        .select('*, order_items(*), customer:profiles!orders_customer_id_fkey(full_name)')
        .in('status', ['placed', 'dispatched'])
        // Sellers dispatch their own orders and the customer's confirmation
        // pays them; the team fulfils FindWork's own catalog.
        .is('seller_id', null)
        .order('placed_at')
      if (error) throw error
      return data as unknown as AdminOrder[]
    },
  })
}

export type AdminWithdrawal = Withdrawal & { profile: Named }

export function useAdminWithdrawals() {
  const isAdmin = useStaffCan('finance')
  return useQuery({
    queryKey: keys.admin.withdrawals(),
    enabled: isAdmin,
    queryFn: async (): Promise<AdminWithdrawal[]> => {
      const { data, error } = await supabase
        .from('withdrawals')
        .select('*, profile:profiles!withdrawals_profile_id_fkey(full_name)')
        .eq('status', 'requested')
        .order('created_at')
      if (error) throw error
      return data as unknown as AdminWithdrawal[]
    },
  })
}

export type AdminVerification = Verification & { profile: Named }

/** Submissions waiting for the team, oldest first. */
export function useAdminVerifications() {
  const isAdmin = useStaffCan('verification')
  return useQuery({
    queryKey: keys.admin.verifications(),
    enabled: isAdmin,
    queryFn: async (): Promise<AdminVerification[]> => {
      const { data, error } = await supabase
        .from('verifications')
        .select('*, profile:profiles!verifications_profile_id_fkey(full_name)')
        .eq('status', 'pending')
        .order('created_at')
      if (error) throw error
      return data as unknown as AdminVerification[]
    },
  })
}

/** Top-ups that reached an account after it was deleted: send back by hand. */
export function useAdminRefundsDue() {
  const isAdmin = useStaffCan('finance')
  return useQuery({
    queryKey: keys.admin.refunds(),
    enabled: isAdmin,
    queryFn: async (): Promise<PaymentIntent[]> => {
      const { data, error } = await supabase
        .from('payment_intents')
        .select('*')
        .eq('status', 'refund_due')
        .order('paid_at')
      if (error) throw error
      return data
    },
  })
}

export type AdminReport = Report & { reporter: Named }

export function useAdminReports() {
  const isAdmin = useStaffCan('moderation')
  return useQuery({
    queryKey: keys.admin.reports(),
    enabled: isAdmin,
    queryFn: async (): Promise<AdminReport[]> => {
      const { data, error } = await supabase
        .from('reports')
        .select('*, reporter:profiles!reports_reporter_id_fkey(full_name)')
        .eq('status', 'open')
        .order('created_at')
      if (error) throw error
      return data as unknown as AdminReport[]
    },
  })
}

export type AdminSupportRequest = SupportRequest & { profile: Named }

export function useAdminSupport() {
  const isAdmin = useStaffCan('support')
  return useQuery({
    queryKey: keys.admin.support(),
    enabled: isAdmin,
    queryFn: async (): Promise<AdminSupportRequest[]> => {
      const { data, error } = await supabase
        .from('support_requests')
        .select('*, profile:profiles!support_requests_profile_id_fkey(full_name)')
        .eq('status', 'open')
        .order('created_at')
      if (error) throw error
      return data as unknown as AdminSupportRequest[]
    },
  })
}

export function useAdminUnverifiedProviders() {
  const isAdmin = useStaffCan('verification')
  return useQuery({
    queryKey: keys.admin.providers(),
    enabled: isAdmin,
    queryFn: async (): Promise<ProviderProfile[]> => {
      const { data, error } = await supabase
        .from('provider_profiles')
        .select('*')
        .eq('verified', false)
        .order('created_at')
      if (error) throw error
      return data
    },
  })
}

export type FoundProfile = { id: string; full_name: string; email: string; phone: string; balance: number }

export async function adminFindProfiles(query: string): Promise<FoundProfile[]> {
  const { data, error } = await supabase.rpc('admin_find_profiles', { p_query: query })
  if (error) throw error
  return (data ?? []).map((r) => ({ ...r, balance: Number(r.balance) }))
}

function useAdminMutation<T>(fn: (input: T) => Promise<void>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.admin.all })
      qc.invalidateQueries({ queryKey: keys.wallet.all })
    },
  })
}

export function useAdminSetOrderStatus() {
  return useAdminMutation(async ({ orderId, status }: { orderId: string; status: 'dispatched' | 'delivered' }) => {
    const { error } = await supabase.rpc('admin_set_order_status', { p_order_id: orderId, p_status: status })
    if (error) throw error
  })
}

export function useAdminProcessWithdrawal() {
  return useAdminMutation(async ({ id, paid, note }: { id: string; paid: boolean; note: string }) => {
    const { error } = await supabase.rpc('admin_process_withdrawal', { p_withdrawal_id: id, p_paid: paid, p_note: note })
    if (error) throw error
  })
}

export function useAdminReviewVerification() {
  return useAdminMutation(async ({ id, approve, note }: { id: string; approve: boolean; note: string }) => {
    const { error } = await supabase.rpc('admin_review_verification', {
      p_verification_id: id,
      p_approve: approve,
      p_note: note.trim() || null,
    })
    if (error) throw error
  })
}

export function useAdminMarkTopupRefunded() {
  return useAdminMutation(async ({ id, note }: { id: string; note: string }) => {
    const { error } = await supabase.rpc('admin_mark_topup_refunded', { p_intent_id: id, p_note: note })
    if (error) throw error
  })
}

export function useAdminResolveReport() {
  return useAdminMutation(async ({ id, action }: { id: string; action: 'remove' | 'dismiss' }) => {
    const { error } = await supabase.rpc('admin_resolve_report', { p_report_id: id, p_action: action })
    if (error) throw error
  })
}

export function useAdminReplySupport() {
  return useAdminMutation(async ({ id, reply }: { id: string; reply: string }) => {
    const { error } = await supabase.rpc('admin_reply_support', { p_request_id: id, p_reply: reply })
    if (error) throw error
  })
}

export function useAdminSetVerified() {
  return useAdminMutation(async ({ providerId, verified }: { providerId: string; verified: boolean }) => {
    const { error } = await supabase.rpc('admin_set_provider_verified', { p_provider_id: providerId, p_verified: verified })
    if (error) throw error
  })
}

export function useAdminAdjustBalance() {
  return useAdminMutation(async ({ profileId, amount, reason }: { profileId: string; amount: number; reason: string }) => {
    const { error } = await supabase.rpc('admin_adjust_balance', { p_profile_id: profileId, p_amount: amount, p_reason: reason })
    if (error) throw error
  })
}

export type UserOverview = {
  id: string; full_name: string; email: string; phone: string; created_at: string
  deleted_at: string | null; verified_at: string | null
  staff_role: StaffRole | null; suspended_at: string | null; suspended_reason: string | null
  is_provider: boolean; balance: number | null; escrow_held: number | null
  bookings: number; orders: number; disputes_raised: number; disputes_against: number; disputes_lost: number
  reports_against: number; open_alerts: number
  devices: { label: string; last_seen_at: string; last_ip: string | null }[]
  events: { kind: string; created_at: string; detail: Record<string, unknown> }[]
  actions: { action: string; created_at: string; detail: Record<string, unknown> }[]
}

export function useAdminUserOverview(profileId: string | null) {
  const allowed = useStaffCan('lookup')
  return useQuery({
    queryKey: keys.admin.user(profileId ?? ''),
    enabled: allowed && Boolean(profileId),
    queryFn: async (): Promise<UserOverview> => {
      const { data, error } = await supabase.rpc('admin_user_overview', { p_profile_id: profileId! })
      if (error) throw error
      return data as unknown as UserOverview
    },
  })
}

export function useAdminSuspendUser() {
  return useAdminMutation(async ({ profileId, reason }: { profileId: string; reason: string }) => {
    const { error } = await supabase.rpc('admin_suspend_user', { p_profile_id: profileId, p_reason: reason })
    if (error) throw error
  })
}

export function useAdminReinstateUser() {
  return useAdminMutation(async ({ profileId, note }: { profileId: string; note: string }) => {
    const { error } = await supabase.rpc('admin_reinstate_user', { p_profile_id: profileId, p_note: note })
    if (error) throw error
  })
}

export function useAdminSetStaffRole() {
  return useAdminMutation(async ({ profileId, role }: { profileId: string; role: StaffRole | null }) => {
    const { error } = await supabase.rpc('admin_set_staff_role', { p_profile_id: profileId, p_role: role })
    if (error) throw error
  })
}

export type AdminRiskAlert = RiskAlert & { profile: Named }

export function useRiskAlerts() {
  const allowed = useStaffCan('risk')
  return useQuery({
    queryKey: keys.admin.risk(),
    enabled: allowed,
    refetchInterval: 30_000,
    queryFn: async (): Promise<AdminRiskAlert[]> => {
      const { data, error } = await supabase
        .from('risk_alerts')
        .select('*, profile:profiles!risk_alerts_profile_id_fkey(full_name)')
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) throw error
      return data as unknown as AdminRiskAlert[]
    },
  })
}

export function useReviewRiskAlert() {
  return useAdminMutation(async ({ id, status, note }: { id: string; status: 'reviewed' | 'dismissed'; note: string }) => {
    const { error } = await supabase.rpc('admin_review_risk_alert', { p_alert_id: id, p_status: status, p_note: note })
    if (error) throw error
  })
}

export type AdminBusinessVerification = BusinessVerification & { profile: Named }

export function useAdminBusinessVerifications() {
  const allowed = useStaffCan('verification')
  return useQuery({
    queryKey: keys.admin.businessVerifications(),
    enabled: allowed,
    queryFn: async (): Promise<AdminBusinessVerification[]> => {
      const { data, error } = await supabase
        .from('business_verifications')
        .select('*, profile:profiles!business_verifications_profile_id_fkey(full_name)')
        .eq('status', 'pending')
        .order('created_at')
      if (error) throw error
      return data as unknown as AdminBusinessVerification[]
    },
  })
}

export function useAdminReviewBusinessVerification() {
  return useAdminMutation(async ({ id, approve, note }: { id: string; approve: boolean; note: string }) => {
    const { error } = await supabase.rpc('admin_review_business_verification', { p_verification_id: id, p_approve: approve, p_note: note })
    if (error) throw error
  })
}
