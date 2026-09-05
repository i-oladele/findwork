import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { contacts, products, plans } from '../data/mock'

const DELIVERY_FEE = { 'same-day': 1800, standard: 1200 } as const

export type Profile = { fullName: string; phone: string; email: string; location: string }

export type Booking = {
  id: string
  providerId: string
  providerName: string
  service: string
  price: number
  fee: number
  date: string
  time: string
  status: 'pending' | 'active' | 'done'
  escrowHeld: number
}

export type DraftBooking = {
  providerId: string
  providerName: string
  service: string
  price: number
  date: string
  time: string
}

export type OrderItem = { productId: string; name: string; price: number; qty: number }
export type Order = {
  id: string
  items: OrderItem[]
  total: number
  deliverySpeed: 'same-day' | 'standard'
  placedAt: string
}

export type Transaction = {
  id: string
  label: string
  time: string
  amount: number
  kind: 'escrow' | 'release' | 'order' | 'topup' | 'fee' | 'subscription'
}

export type JobPost = {
  id: string
  title: string
  description: string
  budget: number
  neededBy: string
  postedAt: string
}

export type SentQuote = {
  id: string
  jobId: string
  jobTitle: string
  price: number
  days: number
  startDay: string
  message: string
}

export type ProviderRequest = {
  id: string
  customer: string
  service: string
  when: string
  price: number
  escrowHeld: number
  expiresIn?: string
  rating?: number
  bookingsCount?: number
  location?: string
  status: 'new' | 'accepted' | 'declined'
}

export type ChatMsg = { id: string; from: 'me' | 'them'; text: string; time: string; kind?: 'text' | 'voice' }

export type RFQ = {
  id: string
  title: string
  description: string
  quantity: string
  budgetMax: number
  deadline: string
  status: 'open' | 'quoted' | 'closed'
  postedAt: string
}

export type ClassifiedAd = {
  id: string
  title: string
  price: number
  category: 'Rentals' | 'Used goods'
  location: string
  description: string
  postedAt: string
}

export type Dispute = {
  id: string
  refId: string
  refType: 'order' | 'booking'
  reason: string
  status: 'open' | 'resolved'
  openedAt: string
}

let seq = 1000
const nextId = (prefix: string) => `${prefix}-${(seq++).toString(36).toUpperCase()}`

interface AppState {
  profile: Profile
  cart: { productId: string; qty: number }[]
  wallet: { balance: number; escrowHeld: number }
  transactions: Transaction[]
  bookings: Booking[]
  draftBooking: DraftBooking | null
  orders: Order[]
  jobsPosted: JobPost[]
  sentQuotes: SentQuote[]
  providerRequests: ProviderRequest[]
  serviceStatus: Record<string, 'live' | 'paused'>
  availability: { taking: boolean; days: Record<string, boolean> }
  chat: Record<string, ChatMsg[]>
  unread: Record<string, number>
  lastBookingId: string | null
  lastOrderId: string | null
  lastJobId: string | null
  rfqs: RFQ[]
  classifieds: ClassifiedAd[]
  enrollments: Record<string, { progress: number; enrolledAt: string }>
  disputes: Dispute[]
  subscription: { plan: 'free' | 'pro' | 'business'; since: string }

  updateProfile: (p: Partial<Profile>) => void
  addToCart: (productId: string, qty?: number) => void
  setCartQty: (productId: string, qty: number) => void
  removeFromCart: (productId: string) => void
  clearCart: () => void
  addMoney: (amount: number) => void
  setDraftBooking: (draft: DraftBooking) => void
  payBooking: () => string | null
  completeBooking: (id: string) => void
  placeOrder: (deliverySpeed: 'same-day' | 'standard') => string | null
  postJob: (input: { title: string; description: string; budget: number; neededBy: string }) => string
  sendQuote: (input: { jobId: string; jobTitle: string; price: number; days: number; startDay: string; message: string }) => void
  respondToRequest: (id: string, accept: boolean) => void
  toggleServiceStatus: (id: string, defaultStatus: 'live' | 'paused') => void
  setTaking: (on: boolean) => void
  toggleDay: (day: string) => void
  sendMessage: (contactId: string, text: string) => void
  markRead: (contactId: string) => void
  postRFQ: (input: { title: string; description: string; quantity: string; budgetMax: number; deadline: string }) => string
  postClassified: (input: { title: string; price: number; category: 'Rentals' | 'Used goods'; location: string; description: string }) => string
  enrollInCourse: (courseId: string) => void
  advanceProgress: (courseId: string, lessonCount: number) => void
  openDispute: (input: { refId: string; refType: 'order' | 'booking'; reason: string }) => string
  subscribe: (plan: 'free' | 'pro' | 'business') => boolean
}

const seedChat: Record<string, ChatMsg[]> = {}
const seedUnread: Record<string, number> = {}
for (const c of contacts) {
  seedChat[c.id] = [{ id: 'seed-0', from: 'them', text: c.seedMessage, time: c.seedTime }]
  seedUnread[c.id] = c.seedUnread ?? 0
}
seedChat['ada-tailoring'] = [
  { id: 'seed-0', from: 'me', text: 'Good morning. I need three aso-ebi dresses before the 28th. Can you do it?', time: '9:12' },
  { id: 'seed-1', from: 'them', text: 'Yes, that is fine. Is the fabric already bought?', time: '9:14' },
  { id: 'seed-2', from: 'me', text: '', time: '9:15', kind: 'voice' },
]

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      profile: { fullName: 'Adaeze Okoro', phone: '+234 803 412 9087', email: 'ada@findwork.africa', location: 'Yaba, Lagos' },
      cart: [],
      wallet: { balance: 48200, escrowHeld: 21100 },
      transactions: [
        { id: 't1', label: "Escrow · Ada's Tailoring", time: 'Today, 9:12', amount: -12600, kind: 'escrow' },
        { id: 't2', label: 'Payout · Kunle Adeyemi', time: 'Yesterday, 17:40', amount: 34000, kind: 'release' },
        { id: 't3', label: 'Order FW-90311', time: '11 March, 8:58', amount: -36900, kind: 'order' },
      ],
      bookings: [
        { id: 'FW-48213', providerId: 'ada-tailoring', providerName: "Ada's Tailoring", service: 'Ready-to-wear, single piece', price: 12000, fee: 600, date: 'Thu 12 Mar', time: '11:30', status: 'active', escrowHeld: 12600 },
        { id: 'FW-33190', providerId: 'chidi-plumbing', providerName: 'Chidi Plumbing Works', service: 'Kitchen sink repair', price: 8500, fee: 0, date: 'Sat 14 Mar', time: '09:00', status: 'active', escrowHeld: 8500 },
        { id: 'FW-51002', providerId: 'kemi-cleaning', providerName: 'Kemi Cleaning Crew', service: 'Deep clean, 3 bedrooms', price: 22000, fee: 0, date: 'Mon 16 Mar', time: '15:00', status: 'pending', escrowHeld: 0 },
      ],
      draftBooking: null,
      orders: [
        {
          id: 'FW-90311',
          items: [
            { productId: 'ankara-wax-print', name: 'Ankara wax print, 6 yards', price: 9800, qty: 1 },
            { productId: 'lace-cream', name: 'Lace, 5 yards, cream', price: 18000, qty: 1 },
          ],
          total: 36900,
          deliverySpeed: 'same-day',
          placedAt: '11 March, 8:58',
        },
      ],
      jobsPosted: [],
      sentQuotes: [],
      providerRequests: [
        { id: 'chinedu', customer: 'Chinedu Obi', service: 'Ready-to-wear, single piece', when: 'Thursday 12 March, 11:30', price: 12000, escrowHeld: 12600, expiresIn: '3h', rating: 4.8, bookingsCount: 23, location: 'Yaba', status: 'new' },
        { id: 'funke', customer: 'Funke Adebayo', service: 'Aso-ebi set, 6 people', when: 'Sat 14 Mar · 14:00', price: 28500, escrowHeld: 0, status: 'new' },
      ],
      serviceStatus: {},
      availability: {
        taking: true,
        days: { Monday: true, Tuesday: true, Wednesday: true, Thursday: true, Friday: true, Saturday: true, Sunday: false },
      },
      chat: seedChat,
      unread: seedUnread,
      lastBookingId: null,
      lastOrderId: null,
      lastJobId: null,
      rfqs: [],
      classifieds: [],
      enrollments: {},
      disputes: [],
      subscription: { plan: 'free', since: 'Just now' },

      updateProfile: (p) => set((s) => ({ profile: { ...s.profile, ...p } })),

      addToCart: (productId, qty = 1) =>
        set((s) => {
          const existing = s.cart.find((i) => i.productId === productId)
          if (existing) {
            return { cart: s.cart.map((i) => (i.productId === productId ? { ...i, qty: i.qty + qty } : i)) }
          }
          return { cart: [...s.cart, { productId, qty }] }
        }),

      setCartQty: (productId, qty) =>
        set((s) => ({ cart: s.cart.map((i) => (i.productId === productId ? { ...i, qty: Math.max(1, qty) } : i)) })),

      removeFromCart: (productId) => set((s) => ({ cart: s.cart.filter((i) => i.productId !== productId) })),

      clearCart: () => set({ cart: [] }),

      addMoney: (amount) =>
        set((s) => ({
          wallet: { ...s.wallet, balance: s.wallet.balance + amount },
          transactions: [{ id: nextId('t'), label: 'Top-up · Providus transfer', time: 'Just now', amount, kind: 'topup' }, ...s.transactions],
        })),

      setDraftBooking: (draft) => set({ draftBooking: draft }),

      payBooking: () => {
        const draft = get().draftBooking
        if (!draft) return null
        const fee = Math.round(draft.price * 0.05)
        const total = draft.price + fee
        if (get().wallet.balance < total) return null
        const id = nextId('FW')
        const booking: Booking = {
          id,
          providerId: draft.providerId,
          providerName: draft.providerName,
          service: draft.service,
          price: draft.price,
          fee,
          date: draft.date,
          time: draft.time,
          status: 'active',
          escrowHeld: total,
        }
        set((s) => ({
          wallet: { balance: s.wallet.balance - total, escrowHeld: s.wallet.escrowHeld + total },
          bookings: [booking, ...s.bookings],
          transactions: [{ id: nextId('t'), label: `Escrow · ${draft.providerName}`, time: 'Just now', amount: -total, kind: 'escrow' }, ...s.transactions],
          draftBooking: null,
          lastBookingId: id,
        }))
        return id
      },

      completeBooking: (id) =>
        set((s) => {
          const booking = s.bookings.find((b) => b.id === id)
          if (!booking || booking.status === 'done') return s
          return {
            bookings: s.bookings.map((b) => (b.id === id ? { ...b, status: 'done' } : b)),
            wallet: { ...s.wallet, escrowHeld: Math.max(0, s.wallet.escrowHeld - booking.escrowHeld) },
            transactions: [
              { id: nextId('t'), label: `Released to ${booking.providerName}`, time: 'Just now', amount: -booking.escrowHeld, kind: 'release' },
              ...s.transactions,
            ],
          }
        }),

      placeOrder: (deliverySpeed) => {
        const { cart, wallet } = get()
        if (cart.length === 0) return null
        const items: OrderItem[] = cart.map((line) => {
          const product = products.find((p) => p.id === line.productId)
          return { productId: line.productId, name: product?.name ?? line.productId, price: product?.price ?? 0, qty: line.qty }
        })
        const itemsTotal = items.reduce((sum, it) => sum + it.price * it.qty, 0)
        const total = itemsTotal + DELIVERY_FEE[deliverySpeed]
        if (wallet.balance < total) return null
        const id = nextId('FW')
        const order: Order = { id, items, total, deliverySpeed, placedAt: 'Just now' }
        set((s) => ({
          wallet: { ...s.wallet, balance: s.wallet.balance - total },
          orders: [order, ...s.orders],
          transactions: [{ id: nextId('t'), label: `Order ${id}`, time: 'Just now', amount: -total, kind: 'order' }, ...s.transactions],
          cart: [],
          lastOrderId: id,
        }))
        return id
      },

      postJob: (input) => {
        const id = nextId('job')
        const job: JobPost = { id, ...input, postedAt: 'Just now' }
        set((s) => ({ jobsPosted: [job, ...s.jobsPosted], lastJobId: id }))
        return id
      },

      sendQuote: (input) => {
        const id = nextId('quote')
        set((s) => ({ sentQuotes: [{ id, ...input }, ...s.sentQuotes] }))
      },

      respondToRequest: (id, accept) =>
        set((s) => ({
          providerRequests: s.providerRequests.map((r) => (r.id === id ? { ...r, status: accept ? 'accepted' : 'declined' } : r)),
        })),

      toggleServiceStatus: (id, defaultStatus) =>
        set((s) => {
          const current = s.serviceStatus[id] ?? defaultStatus
          return { serviceStatus: { ...s.serviceStatus, [id]: current === 'live' ? 'paused' : 'live' } }
        }),

      setTaking: (on) => set((s) => ({ availability: { ...s.availability, taking: on } })),

      toggleDay: (day) =>
        set((s) => ({ availability: { ...s.availability, days: { ...s.availability.days, [day]: !s.availability.days[day] } } })),

      sendMessage: (contactId, text) =>
        set((s) => ({
          chat: {
            ...s.chat,
            [contactId]: [...(s.chat[contactId] ?? []), { id: nextId('msg'), from: 'me', text, time: 'now' }],
          },
        })),

      markRead: (contactId) => set((s) => ({ unread: { ...s.unread, [contactId]: 0 } })),

      postRFQ: (input) => {
        const id = nextId('rfq')
        set((s) => ({
          rfqs: [{ id, ...input, status: 'quoted', postedAt: 'Just now' }, ...s.rfqs],
        }))
        return id
      },

      postClassified: (input) => {
        const id = nextId('ad')
        set((s) => ({ classifieds: [{ id, ...input, postedAt: 'Just now' }, ...s.classifieds] }))
        return id
      },

      enrollInCourse: (courseId) =>
        set((s) => ({
          enrollments: { ...s.enrollments, [courseId]: s.enrollments[courseId] ?? { progress: 0, enrolledAt: 'Just now' } },
        })),

      advanceProgress: (courseId, lessonCount) =>
        set((s) => {
          const current = s.enrollments[courseId]
          if (!current) return s
          const step = Math.ceil(100 / Math.max(1, lessonCount))
          return {
            enrollments: {
              ...s.enrollments,
              [courseId]: { ...current, progress: Math.min(100, current.progress + step) },
            },
          }
        }),

      openDispute: (input) => {
        const id = nextId('dsp')
        set((s) => ({
          disputes: [{ id, ...input, status: 'open', openedAt: 'Just now' }, ...s.disputes],
        }))
        return id
      },

      subscribe: (plan) => {
        const target = plans.find((p) => p.id === plan)
        if (!target) return false
        if (target.price > 0 && get().wallet.balance < target.price) return false
        set((s) => ({
          wallet: { ...s.wallet, balance: s.wallet.balance - target.price },
          subscription: { plan, since: 'Just now' },
          transactions:
            target.price > 0
              ? [{ id: nextId('t'), label: `${target.name} plan subscription`, time: 'Just now', amount: -target.price, kind: 'subscription' }, ...get().transactions]
              : get().transactions,
        }))
        return true
      },
    }),
    { name: 'findwork-store' },
  ),
)
