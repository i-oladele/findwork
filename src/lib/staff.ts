import type { StaffRole } from './database.types'

export type { StaffRole }
export type StaffArea =
  | 'console'
  | 'lookup'
  | 'disputes'
  | 'moderation'
  | 'verification'
  | 'users'
  | 'risk'
  | 'finance'
  | 'analytics'
  | 'support'
  | 'orders'
  | 'roles'
  | 'logistics'
  | 'content'

const AREAS: Record<Exclude<StaffRole, 'admin'>, StaffArea[]> = {
  moderator: ['console', 'lookup', 'disputes', 'moderation', 'verification', 'users', 'risk', 'content'],
  finance: ['console', 'lookup', 'finance', 'analytics', 'risk'],
  support: ['console', 'lookup', 'support', 'orders', 'logistics'],
}

export const STAFF_ROLE_LABEL: Record<StaffRole, string> = {
  admin: 'Admin · everything',
  moderator: 'Moderator · disputes, reports, verification, users, courses',
  finance: 'Finance · payouts, wallets, reports',
  support: 'Support · help requests, orders and deliveries',
}

/**
 * Mirrors public.staff_can. The database is the boundary; this only decides
 * which parts of the console to draw.
 */
export function staffCan(role: StaffRole | null | undefined, area: StaffArea): boolean {
  if (!role) return false
  if (role === 'admin') return true
  return AREAS[role].includes(area)
}
