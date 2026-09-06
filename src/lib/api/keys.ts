/**
 * Central query-key factory. Every hook derives its key from here so that
 * invalidation after a mutation stays correct as the app grows — a mutation
 * can invalidate `keys.wallet.all` without knowing which screens are mounted.
 */
export const keys = {
  profile: {
    me: () => ['profile', 'me'] as const,
    byId: (id: string) => ['profile', id] as const,
  },
  providers: {
    all: ['providers'] as const,
    list: (filters?: unknown) => ['providers', 'list', filters ?? null] as const,
    detail: (id: string) => ['providers', id] as const,
    packages: (id: string) => ['providers', id, 'packages'] as const,
    availability: (id: string) => ['providers', id, 'availability'] as const,
    reviews: (id: string) => ['providers', id, 'reviews'] as const,
  },
  bookings: {
    all: ['bookings'] as const,
    mine: () => ['bookings', 'mine'] as const,
    detail: (id: string) => ['bookings', id] as const,
  },
  wallet: {
    all: ['wallet'] as const,
    summary: () => ['wallet', 'summary'] as const,
    transactions: () => ['wallet', 'transactions'] as const,
  },
  commerce: {
    products: () => ['products'] as const,
    product: (id: string) => ['products', id] as const,
    orders: () => ['orders'] as const,
    order: (id: string) => ['orders', id] as const,
  },
  chat: {
    all: ['chat'] as const,
    threads: () => ['chat', 'threads'] as const,
    messages: (threadId: string) => ['chat', 'messages', threadId] as const,
  },
  marketplace: {
    jobs: () => ['jobs'] as const,
    job: (id: string) => ['jobs', id] as const,
    quotes: () => ['quotes'] as const,
    quotesForJob: (jobId: string) => ['quotes', 'job', jobId] as const,
    requests: () => ['provider-requests'] as const,
  },
  rfqs: {
    all: ['rfqs'] as const,
    list: () => ['rfqs', 'list'] as const,
    detail: (id: string) => ['rfqs', id] as const,
    quotes: (rfqId: string) => ['rfqs', rfqId, 'quotes'] as const,
  },
  classifieds: {
    all: ['classifieds'] as const,
    list: (category?: string) => ['classifieds', 'list', category ?? null] as const,
    detail: (id: string) => ['classifieds', id] as const,
  },
  learning: {
    courses: () => ['courses'] as const,
    course: (id: string) => ['courses', id] as const,
    lessons: (id: string) => ['courses', id, 'lessons'] as const,
    enrollments: () => ['enrollments'] as const,
  },
  disputes: {
    all: ['disputes'] as const,
    list: () => ['disputes', 'list'] as const,
  },
  billing: {
    plans: () => ['plans'] as const,
    subscription: () => ['subscription'] as const,
  },
  notifications: {
    all: ['notifications'] as const,
    list: () => ['notifications', 'list'] as const,
  },
} as const
