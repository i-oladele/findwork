import { Link } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { StatusBar } from '../../components/chrome/StatusBar'
import { BackButton } from '../../components/chrome/PageHeader'
import { EmptyState, ErrorState, ListSkeleton } from '../../components/system/States'
import {
  useNotifications,
  useNotificationsRealtime,
  useMarkNotificationRead,
} from '../../lib/api'
import { timeAgo } from '../../lib/format'
import type { NotificationKind } from '../../lib/database.types'

const ICONS: Record<NotificationKind, string> = {
  order: 'ph-package',
  support: 'ph-lifebuoy',
  booking: 'ph-calendar-check',
  quote: 'ph-note-pencil',
  message: 'ph-chat-circle',
  payment: 'ph-wallet',
  dispute: 'ph-scales',
  review: 'ph-star',
  system: 'ph-info',
}

/** Where a notification takes you, derived from the ref it carries. */
function targetFor(refType: string | null, refId: string | null): string {
  if (!refType) return '/home'
  switch (refType) {
    case 'thread':
      return refId ? `/chat/${refId}` : '/messages'
    case 'booking':
      return '/bookings'
    case 'booking_reschedule':
      return refId ? `/bookings/${refId}/reschedule` : '/bookings'
    case 'booking_request':
      return '/provider/requests'
    case 'order':
      return refId ? `/order/${refId}` : '/orders'
    case 'job':
      return refId ? `/jobs/${refId}` : '/quotes'
    case 'rfq':
      return refId ? `/rfqs/${refId}` : '/rfqs'
    case 'dispute':
      return refId ? `/disputes/${refId}` : '/disputes'
    case 'provider':
      return refId ? `/provider/${refId}` : '/provider'
    case 'wallet':
      return '/wallet'
    case 'billing':
      return '/billing'
    case 'support':
      return '/help'
    // Operator notifications: everything is handled in one console.
    case 'admin_dispute':
    case 'admin_order':
    case 'admin_report':
    case 'admin_support':
    case 'admin_withdrawal':
      return '/admin'
    default:
      return '/home'
  }
}

export function Notifications() {
  const { data, isLoading, isError, refetch } = useNotifications()
  const markRead = useMarkNotificationRead()
  useNotificationsRealtime()

  return (
    <Screen bottomNav="customer">
      <div className="bg-ink px-[22px] pb-6">
        <StatusBar tone="light" />
        <div className="flex items-center gap-1 mt-1.5">
          <BackButton fallback="/home" tone="light" />
          <div className="font-display font-bold text-[22px] text-cream">Notifications</div>
        </div>
      </div>

      <div className="px-[22px] py-5">
        {isLoading && <ListSkeleton rows={5} />}
        {isError && <ErrorState message="We could not load your notifications." onRetry={() => refetch()} />}

        {data?.length === 0 && (
          <EmptyState
            icon="ph-bell-slash"
            title="Nothing yet"
            body="Bookings, quotes, payments and messages will show up here."
          />
        )}

        <div className="space-y-2.5">
          {data?.map((n) => (
            <Link
              key={n.id}
              to={targetFor(n.ref_type, n.ref_id)}
              onClick={() => !n.read_at && markRead.mutate(n.id)}
              className={`flex items-start gap-3 rounded-2xl border p-4 ${
                n.read_at ? 'bg-white border-line' : 'bg-brand/5 border-brand/25'
              }`}
            >
              <i className={`ph-fill ${ICONS[n.kind] ?? 'ph-info'} text-[20px] text-brand relative top-0.5`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-display font-semibold text-[15.5px] text-ink truncate">{n.title}</span>
                  <span className="shrink-0 font-mono text-[11px] text-muted-3">{timeAgo(n.created_at)}</span>
                </div>
                {n.body && <p className="mt-1 text-[14px] leading-[1.45] text-muted line-clamp-2">{n.body}</p>}
              </div>
              {!n.read_at && <span className="shrink-0 w-2 h-2 rounded-full bg-brand mt-2" />}
            </Link>
          ))}
        </div>
      </div>
    </Screen>
  )
}
