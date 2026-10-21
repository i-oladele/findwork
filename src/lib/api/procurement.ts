import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { useAuth } from '../authContext'
import { useStaff } from './admin'
import { keys } from './keys'
import type { Invoice, OrgRole, Organization, PurchaseOrder, StockItem, StockMovement } from '../database.types'

export type MyOrganization = Organization & { role: OrgRole }
type Named = { full_name: string } | null
export type PurchaseOrderWithParties = PurchaseOrder & { supplier: Named; buyer: Named; organization: { name: string } | null }

const PO_SELECT =
  '*, supplier:profiles!purchase_orders_supplier_id_fkey(full_name), buyer:profiles!purchase_orders_buyer_id_fkey(full_name), organization:organizations!purchase_orders_organization_id_fkey(name)'

function useInvalidateProcurement() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: keys.procurement.all })
    qc.invalidateQueries({ queryKey: keys.rfqs.all })
    qc.invalidateQueries({ queryKey: keys.wallet.all })
  }
}

/** The organisations the signed-in person buys for, with their role in each. */
export function useMyOrganizations() {
  const { user } = useAuth()
  return useQuery({
    queryKey: keys.procurement.organizations(),
    enabled: Boolean(user),
    queryFn: async (): Promise<MyOrganization[]> => {
      const { data, error } = await supabase.from('organization_members')
        .select('role, organization:organizations!organization_members_organization_id_fkey(*)').eq('profile_id', user!.id)
      if (error) throw error
      return (data as unknown as { role: OrgRole; organization: Organization }[]).map((m) => ({ ...m.organization, role: m.role }))
    },
  })
}

export type OrgMember = { profile_id: string; role: OrgRole; profile: Named }

export function useOrganizationMembers(organizationId: string | null) {
  return useQuery({
    queryKey: keys.procurement.members(organizationId ?? ''),
    enabled: Boolean(organizationId),
    queryFn: async (): Promise<OrgMember[]> => {
      const { data, error } = await supabase.from('organization_members')
        .select('profile_id, role, profile:profiles!organization_members_profile_id_fkey(full_name)').eq('organization_id', organizationId!).order('created_at')
      if (error) throw error
      return data as unknown as OrgMember[]
    },
  })
}

function useProcurementAction<T, R = void>(fn: (input: T) => Promise<R>) {
  const invalidate = useInvalidateProcurement()
  return useMutation({ mutationFn: fn, onSuccess: invalidate })
}

export function useCreateOrganization() {
  return useProcurementAction(async (input: { name: string; approvalThreshold: number }): Promise<string> => {
    const { data, error } = await supabase.rpc('create_organization', { p_name: input.name, p_approval_threshold: input.approvalThreshold })
    if (error) throw error
    return data
  })
}

export function useUpdateOrganization() {
  return useProcurementAction(async (input: { id: string; name: string; approvalThreshold: number }) => {
    const { error } = await supabase.rpc('update_organization', { p_organization_id: input.id, p_name: input.name, p_approval_threshold: input.approvalThreshold })
    if (error) throw error
  })
}

/** role null removes the member. */
export function useSetOrganizationMember() {
  return useProcurementAction(async (input: { organizationId: string; profileId: string; role: 'approver' | 'buyer' | null }) => {
    const { error } = await supabase.rpc('set_organization_member', { p_organization_id: input.organizationId, p_profile_id: input.profileId, p_role: input.role })
    if (error) throw error
  })
}

/** status null takes the supplier off the list. */
export function useSetOrganizationSupplier() {
  return useProcurementAction(async (input: { organizationId: string; supplierId: string; status: 'approved' | 'blocked' | null }) => {
    const { error } = await supabase.rpc('set_organization_supplier', { p_organization_id: input.organizationId, p_supplier_id: input.supplierId, p_status: input.status, p_note: null })
    if (error) throw error
  })
}

/** Purchase orders you are buying (yourself, or for one organisation), or supplying. */
export function usePurchaseOrders(scope: 'buying' | 'supplying', organizationId: string | null) {
  const { user } = useAuth()
  return useQuery({
    queryKey: keys.procurement.orders(scope, organizationId),
    enabled: Boolean(user),
    refetchInterval: 30_000,
    queryFn: async (): Promise<PurchaseOrderWithParties[]> => {
      const base = supabase.from('purchase_orders').select(PO_SELECT)
      const filtered = scope === 'supplying'
        ? base.eq('supplier_id', user!.id)
        : organizationId ? base.eq('organization_id', organizationId) : base.is('organization_id', null).eq('buyer_id', user!.id)
      const { data, error } = await filtered.order('created_at', { ascending: false }).limit(100)
      if (error) throw error
      return data as unknown as PurchaseOrderWithParties[]
    },
  })
}

export function usePurchaseOrder(id: string | undefined) {
  return useQuery({
    queryKey: keys.procurement.order(id ?? ''),
    enabled: Boolean(id),
    refetchInterval: 30_000,
    queryFn: async (): Promise<{ order: PurchaseOrderWithParties; invoice: Invoice | null } | null> => {
      const { data, error } = await supabase.from('purchase_orders').select(PO_SELECT).eq('id', id!).maybeSingle()
      if (error) throw error
      if (!data) return null
      const invoice = await supabase.from('invoices').select('*').eq('purchase_order_id', id!).maybeSingle()
      if (invoice.error) throw invoice.error
      return { order: data as unknown as PurchaseOrderWithParties, invoice: invoice.data }
    },
  })
}

export function useReviewPurchaseOrder() {
  return useProcurementAction(async (input: { id: string; approve: boolean; note: string }) => {
    const { error } = await supabase.rpc('review_purchase_order', { p_po_id: input.id, p_approve: input.approve, p_note: input.note })
    if (error) throw error
  })
}

export function useMarkPurchaseOrderDelivered() {
  return useProcurementAction(async (input: { id: string; stock: { product_id: string; qty: number }[] }) => {
    const { error } = await supabase.rpc('mark_purchase_order_delivered', { p_po_id: input.id, p_stock: input.stock.length ? input.stock : null })
    if (error) throw error
  })
}

export function useConfirmPurchaseOrder() {
  return useProcurementAction(async (id: string) => {
    const { error } = await supabase.rpc('confirm_purchase_order', { p_po_id: id })
    if (error) throw error
  })
}

export function useCancelPurchaseOrder() {
  return useProcurementAction(async (id: string) => {
    const { error } = await supabase.rpc('cancel_purchase_order', { p_po_id: id })
    if (error) throw error
  })
}

export function useHoldPurchaseOrder() {
  return useProcurementAction(async (input: { id: string; reason: string }) => {
    const { error } = await supabase.rpc('hold_purchase_order', { p_po_id: input.id, p_reason: input.reason })
    if (error) throw error
  })
}

export type ProcurementSummary = {
  spent: number; in_escrow: number; awaiting_approval: number; open: number; completed: number
  stock_items: number; low_stock: number; to_receive: number
  suppliers: { supplier_id: string; name: string; tier: number; trust: number; orders: number; spent: number; status: 'approved' | 'blocked' | null }[]
  months: { month: string; spent: number }[]
}

export function useProcurementSummary(organizationId: string | null) {
  const { user } = useAuth()
  return useQuery({
    queryKey: keys.procurement.summary(organizationId),
    enabled: Boolean(user),
    queryFn: async (): Promise<ProcurementSummary> => {
      const { data, error } = await supabase.rpc('procurement_summary', { p_organization_id: organizationId })
      if (error) throw error
      return data as unknown as ProcurementSummary
    },
  })
}

/** Purchase orders whose payment a buyer has put on hold, for staff to decide. */
export function useAdminHeldPurchaseOrders() {
  const allowed = useStaff().can('disputes')
  return useQuery({
    queryKey: keys.procurement.held(),
    enabled: allowed,
    refetchInterval: 30_000,
    queryFn: async (): Promise<PurchaseOrderWithParties[]> => {
      const { data, error } = await supabase.from('purchase_orders').select(PO_SELECT).eq('status', 'on_hold').order('created_at')
      if (error) throw error
      return data as unknown as PurchaseOrderWithParties[]
    },
  })
}

export function useAdminResolvePurchaseOrder() {
  return useProcurementAction(async (input: { id: string; outcome: 'release' | 'refund'; note: string }) => {
    const { error } = await supabase.rpc('admin_resolve_purchase_order', { p_po_id: input.id, p_outcome: input.outcome, p_note: input.note })
    if (error) throw error
  })
}

/** The buying side's stock: an organisation's, or the signed-in person's own when organizationId is null. */
export function useStockItems(organizationId: string | null) {
  const { user } = useAuth()
  return useQuery({
    queryKey: keys.procurement.stock(organizationId),
    enabled: Boolean(user),
    queryFn: async (): Promise<StockItem[]> => {
      const base = supabase.from('stock_items').select('*')
      const scoped = organizationId ? base.eq('organization_id', organizationId) : base.eq('owner_id', user!.id)
      const { data, error } = await scoped.order('name').limit(500)
      if (error) throw error
      return data
    },
  })
}

export type StockMovementWithActor = StockMovement & { actor: Named }

export function useStockHistory(itemId: string | null) {
  return useQuery({
    queryKey: keys.procurement.stockHistory(itemId ?? ''),
    enabled: Boolean(itemId),
    queryFn: async (): Promise<StockMovementWithActor[]> => {
      const { data, error } = await supabase.from('stock_movements')
        .select('*, actor:profiles!stock_movements_actor_id_fkey(full_name)').eq('item_id', itemId!).order('created_at', { ascending: false }).limit(50)
      if (error) throw error
      return data as unknown as StockMovementWithActor[]
    },
  })
}

/** itemId null adds an item by hand. */
export function useSaveStockItem() {
  return useProcurementAction(async (input: { itemId: string | null; organizationId: string | null; name: string; unit: string; reorderLevel: number | null }): Promise<string> => {
    const { data, error } = await supabase.rpc('save_stock_item', {
      p_item_id: input.itemId, p_organization_id: input.organizationId, p_name: input.name, p_unit: input.unit, p_reorder_level: input.reorderLevel,
    })
    if (error) throw error
    return data
  })
}

/** 'used' takes quantity off what is on hand; 'counted' sets it to quantity and needs a note. */
export function useRecordStock() {
  return useProcurementAction(async (input: { itemId: string; reason: 'used' | 'counted'; quantity: number; note: string }) => {
    const { error } = await supabase.rpc('record_stock', { p_item_id: input.itemId, p_reason: input.reason, p_quantity: input.quantity, p_note: input.note || null })
    if (error) throw error
  })
}

/** Records what arrived on a delivered purchase order, once. */
export function useReceivePurchaseOrderStock() {
  return useProcurementAction(async (input: { id: string; lines: { name: string; unit: string; quantity: number }[] }): Promise<number> => {
    const { data, error } = await supabase.rpc('receive_purchase_order_stock', { p_po_id: input.id, p_lines: input.lines })
    if (error) throw error
    return data
  })
}

export const PO_STATUS: Record<PurchaseOrder['status'], { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }> = {
  pending_approval: { label: 'Awaiting approval', tone: 'warning' },
  rejected: { label: 'Not approved', tone: 'neutral' },
  funded: { label: 'Paid into escrow', tone: 'success' },
  delivered: { label: 'Delivered, awaiting confirmation', tone: 'warning' },
  on_hold: { label: 'Payment on hold', tone: 'danger' },
  completed: { label: 'Completed', tone: 'success' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
  refunded: { label: 'Refunded', tone: 'neutral' },
}
