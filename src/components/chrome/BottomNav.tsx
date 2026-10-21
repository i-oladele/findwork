import { Link, useLocation } from 'react-router-dom'
import { msg, useT } from '../../lib/i18n'

type NavItem = {
  label: string
  path: string
  icon: string
}

const customerItems: NavItem[] = [
  { label: msg('Home'), path: '/home', icon: 'house' },
  { label: msg('Shop'), path: '/shop', icon: 'storefront' },
  { label: msg('Bookings'), path: '/bookings', icon: 'calendar-check' },
  { label: msg('Wallet'), path: '/wallet', icon: 'wallet' },
  { label: msg('Chat'), path: '/messages', icon: 'chat-circle' },
]

const providerItems: NavItem[] = [
  { label: msg('Dashboard'), path: '/provider', icon: 'squares-four' },
  { label: msg('Jobs'), path: '/provider/jobs', icon: 'briefcase' },
  { label: msg('Requests'), path: '/provider/requests', icon: 'calendar-check' },
  { label: msg('Services'), path: '/provider/services', icon: 'list-checks' },
  { label: msg('Earnings'), path: '/provider/earnings', icon: 'wallet' },
]

export function BottomNav({ mode }: { mode: 'customer' | 'provider' }) {
  const { pathname } = useLocation()
  const t = useT()
  const items = mode === 'customer' ? customerItems : providerItems

  return (
    <nav className="sticky bottom-0 left-0 right-0 min-h-[78px] pb-[max(12px,env(safe-area-inset-bottom))] bg-white border-t border-line-soft flex px-1.5 pt-2.5">
      {items.map((item) => {
        const active = pathname === item.path
        return (
          <Link
            key={item.path}
            to={item.path}
            className="flex-1 flex flex-col items-center gap-1 min-h-11"
          >
            <i
              className={`${active ? 'ph-fill' : 'ph'} ph-${item.icon} text-[22px] ${
                active ? 'text-brand' : 'text-muted'
              }`}
            />
            <span className={`text-[10.5px] ${active ? 'font-semibold text-brand' : 'font-medium text-muted'}`}>
              {t(item.label)}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
