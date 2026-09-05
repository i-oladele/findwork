// Read-only catalog data — the things a real backend's database would own
// (provider directory, product directory, contact list). Anything the demo
// user can actually change (wallet, cart, bookings, orders, chat messages,
// provider request status...) lives in the store instead: src/store/appStore.ts

export type ProviderPackage = { name: string; price: number; detail: string }

export type Provider = {
  id: string
  name: string
  category: string
  location: string
  distanceKm: number
  rating: number
  reviews: number
  price: number
  priceUnit: string
  verified: boolean
  repliesIn?: string
  bio?: string
  jobsDone?: number
  trustScore?: number
  topRated?: boolean
  packages?: ProviderPackage[]
}

export const providers: Provider[] = [
  {
    id: 'ada-tailoring',
    name: "Ada's Tailoring",
    category: 'Tailoring',
    location: 'Yaba',
    distanceKm: 1.2,
    rating: 4.9,
    reviews: 212,
    price: 12000,
    priceUnit: 'job',
    verified: true,
    repliesIn: '~10 min',
    bio: 'Eight years making aso-ebi, agbada and ready-to-wear for weddings and offices across Lagos. Home measurement available within Yaba and Surulere.',
    jobsDone: 486,
    trustScore: 92,
    topRated: true,
    packages: [
      { name: 'Ready-to-wear, single piece', price: 12000, detail: 'Fabric not included · 4–6 days' },
      { name: 'Aso-ebi set, per person', price: 28500, detail: 'Minimum six people · 2 weeks' },
    ],
  },
  {
    id: 'chidi-plumbing',
    name: 'Chidi Plumbing Works',
    category: 'Plumbing',
    location: 'Surulere',
    distanceKm: 2.8,
    rating: 4.7,
    reviews: 96,
    price: 8500,
    priceUnit: 'visit',
    verified: true,
    repliesIn: '~25 min',
    bio: 'Licensed plumber covering Surulere and Yaba — sink and pipe repair, installations and full inspections, parts sourced same day where possible.',
    jobsDone: 214,
    trustScore: 78,
    packages: [
      { name: 'Kitchen sink repair', price: 8500, detail: 'Parts not included · same day' },
      { name: 'Full plumbing inspection', price: 15000, detail: 'Up to 3 bathrooms · ~2 hours' },
    ],
  },
  {
    id: 'bisi-couture',
    name: 'Bisi Couture',
    category: 'Tailoring',
    location: 'Ikeja',
    distanceKm: 2.1,
    rating: 4.8,
    reviews: 96,
    price: 14000,
    priceUnit: 'job',
    verified: true,
    bio: 'Verified provider on FindWork, taking bookings across Lagos.',
    jobsDone: 140,
    trustScore: 80,
    packages: [{ name: 'Ready-to-wear, single piece', price: 14000, detail: '2 weeks' }],
  },
  {
    id: 'mama-nkechi-styles',
    name: 'Mama Nkechi Styles',
    category: 'Tailoring',
    location: 'Surulere',
    distanceKm: 3.4,
    rating: 4.6,
    reviews: 48,
    price: 9500,
    priceUnit: 'job',
    verified: false,
    bio: 'New on FindWork, taking bookings across Lagos.',
    jobsDone: 22,
  },
]

export type Product = {
  id: string
  name: string
  price: number
  vendor: string
  variant?: string
}

export const products: Product[] = [
  { id: 'ankara-wax-print', name: 'Ankara wax print, 6 yards', price: 9800, vendor: 'Balogun Fabrics', variant: 'Red' },
  { id: 'palm-oil', name: 'Palm oil, 5 litres', price: 11200, vendor: 'Mile 12 Foods' },
  { id: 'screen-protector', name: 'Phone screen protector', price: 2500, vendor: 'Computer Village' },
  { id: 'lace-cream', name: 'Lace, 5 yards, cream', price: 18000, vendor: 'Balogun Fabrics', variant: 'Cream' },
]

export type OpenJob = {
  id: string
  title: string
  price: number
  description: string
  distanceKm: number
  dueBy?: string
  quotes: number
  verifiedBuyer?: boolean
  business?: boolean
  postedAgo?: string
}

export const openJobs: OpenJob[] = [
  {
    id: 'aso-ebi-dresses',
    title: 'Sew three aso-ebi dresses',
    price: 60000,
    description: 'Ankara already bought. Needed before a wedding on the 28th, measurements in Yaba.',
    distanceKm: 1.2,
    dueBy: 'By 26 Mar',
    quotes: 7,
    verifiedBuyer: true,
    postedAgo: '40 minutes ago',
  },
  {
    id: 'office-shirts',
    title: 'Alter 6 office shirts',
    price: 18000,
    description: 'Taking in the waist and shortening sleeves. Pickup from Surulere.',
    distanceKm: 2.8,
    dueBy: 'By 20 Mar',
    quotes: 2,
  },
  {
    id: 'school-uniforms',
    title: 'Uniforms for a small school',
    price: 340000,
    description: '40 sets, two sizes. Sample first, then bulk. Payment in two stages.',
    distanceKm: 5.4,
    quotes: 0,
    business: true,
  },
]

export type Contact = {
  id: string
  name: string
  online?: boolean
  isSupport?: boolean
  seedMessage: string
  seedTime: string
  seedUnread?: number
}

export const contacts: Contact[] = [
  { id: 'ada-tailoring', name: "Ada's Tailoring", online: true, seedMessage: 'I have sent the quote — ₦54,000 for all three.', seedTime: '9:36', seedUnread: 2 },
  { id: 'emeka-rider', name: 'Emeka · rider', seedMessage: 'I am at the gate now.', seedTime: '9:29' },
  { id: 'balogun-fabrics', name: 'Balogun Fabrics', seedMessage: 'The cream lace is back in stock.', seedTime: 'Yesterday' },
  { id: 'support', name: 'FindWork support', isSupport: true, seedMessage: 'Your refund of ₦4,200 has been paid.', seedTime: '2 days' },
  { id: 'chidi-plumbing', name: 'Chidi Plumbing Works', seedMessage: 'I can come by Saturday morning.', seedTime: '3 days' },
  { id: 'bisi-couture', name: 'Bisi Couture', seedMessage: 'Thanks for reaching out — happy to quote.', seedTime: '5 days' },
  { id: 'mama-nkechi-styles', name: 'Mama Nkechi Styles', seedMessage: 'Let me know your measurements.', seedTime: '1 week' },
]

export type MyService = {
  id: string
  name: string
  price: number
  detail: string
  defaultStatus: 'live' | 'paused'
  bookings: number
}

export const myServices: MyService[] = [
  { id: 'rtw', name: 'Ready-to-wear, single piece', price: 12000, detail: '4–6 days · fabric not included', defaultStatus: 'live', bookings: 186 },
  { id: 'aso-ebi', name: 'Aso-ebi set, per person', price: 28500, detail: '2 weeks · minimum six people', defaultStatus: 'live', bookings: 64 },
  { id: 'bridal', name: 'Bridal gown, made to measure', price: 180000, detail: '6 weeks · consultation first', defaultStatus: 'paused', bookings: 0 },
]

export type ClassifiedListing = {
  id: string
  title: string
  price: number
  category: 'Rentals' | 'Used goods'
  location: string
  distanceKm: number
  description: string
  seller: string
  verified?: boolean
}

export const classifiedsCatalog: ClassifiedListing[] = [
  {
    id: 'self-contain-yaba',
    title: 'Self-contain apartment, Yaba',
    price: 450000,
    category: 'Rentals',
    location: 'Yaba',
    distanceKm: 0.8,
    description: 'Newly renovated self-contain, prepaid meter, water included. Annual rent, one year minimum.',
    seller: 'Tunde A.',
    verified: true,
  },
  {
    id: 'ac-1.5hp',
    title: '1.5HP split AC, barely used',
    price: 145000,
    category: 'Used goods',
    location: 'Surulere',
    distanceKm: 2.6,
    description: 'Used for one dry season, works perfectly. Buyer arranges pickup and installation.',
    seller: 'Ngozi E.',
    verified: true,
  },
  {
    id: 'shop-space-yaba',
    title: 'Shop space along Herbert Macaulay',
    price: 900000,
    category: 'Rentals',
    location: 'Yaba',
    distanceKm: 1.4,
    description: '18 sqm open-plan shop, roadside frontage, previously a phone accessories store.',
    seller: 'Herbert Macaulay Properties',
  },
  {
    id: 'generator-3.5kva',
    title: '3.5KVA generator, tank included',
    price: 210000,
    category: 'Used goods',
    location: 'Ikeja',
    distanceKm: 4.1,
    description: 'Two years old, serviced last month. Selling because we moved to solar.',
    seller: 'Femi O.',
  },
]

export type CourseLesson = { title: string; minutes: number }
export type Course = {
  id: string
  title: string
  category: string
  kind: 'course' | 'internship'
  price: number
  lessons: CourseLesson[]
  instructor: string
  rating: number
  enrolled: number
  description: string
}

export const courses: Course[] = [
  {
    id: 'pattern-cutting-basics',
    title: 'Pattern cutting for ready-to-wear',
    category: 'Tailoring',
    kind: 'course',
    price: 8000,
    instructor: 'FindWork Learning',
    rating: 4.8,
    enrolled: 1240,
    description: 'Learn to draft and cut patterns for ready-to-wear pieces, from measurement to a finished block.',
    lessons: [
      { title: 'Tools and measurements', minutes: 18 },
      { title: 'Drafting the bodice block', minutes: 32 },
      { title: 'Cutting without waste', minutes: 24 },
      { title: 'Finishing and quality checks', minutes: 20 },
    ],
  },
  {
    id: 'small-business-bookkeeping',
    title: 'Bookkeeping for small businesses',
    category: 'Business',
    kind: 'course',
    price: 5000,
    instructor: 'FindWork Learning',
    rating: 4.6,
    enrolled: 860,
    description: 'Track income, expenses and profit without needing an accountant, using tools you already have.',
    lessons: [
      { title: 'Separating business and personal money', minutes: 15 },
      { title: 'Recording daily sales', minutes: 20 },
      { title: 'Simple profit and loss', minutes: 25 },
    ],
  },
  {
    id: 'plumbing-safety-cert',
    title: 'Plumbing safety certification',
    category: 'Plumbing',
    kind: 'course',
    price: 12000,
    instructor: 'FindWork Learning',
    rating: 4.9,
    enrolled: 410,
    description: 'A recognised safety certificate that raises your trust score and unlocks larger jobs.',
    lessons: [
      { title: 'Site safety basics', minutes: 22 },
      { title: 'Handling gas and water lines', minutes: 28 },
      { title: 'Certification assessment', minutes: 15 },
    ],
  },
  {
    id: 'internship-fashion-house',
    title: 'Junior tailor internship — Lagos fashion house',
    category: 'Tailoring',
    kind: 'internship',
    price: 0,
    instructor: 'Adire & Co.',
    rating: 4.7,
    enrolled: 34,
    description: 'Three-month paid internship assisting senior tailors on bridal and aso-ebi orders.',
    lessons: [
      { title: 'Studio orientation', minutes: 30 },
      { title: 'Shadowing senior tailors', minutes: 0 },
    ],
  },
  {
    id: 'internship-logistics',
    title: 'Logistics coordinator internship',
    category: 'Business',
    kind: 'internship',
    price: 0,
    instructor: 'Yaba Logistics Hub',
    rating: 4.5,
    enrolled: 19,
    description: 'Six-week internship coordinating same-day delivery riders across Lagos mainland.',
    lessons: [{ title: 'Dispatch systems walkthrough', minutes: 25 }],
  },
]

export type Plan = {
  id: 'free' | 'pro' | 'business'
  name: string
  price: number
  period: 'month'
  features: string[]
}

export const plans: Plan[] = [
  { id: 'free', name: 'Free', price: 0, period: 'month', features: ['3 active listings', 'Standard search placement', '6% platform fee'] },
  {
    id: 'pro',
    name: 'Pro',
    price: 4500,
    period: 'month',
    features: ['Unlimited listings', 'Priority search placement', '4% platform fee', 'Verified Pro badge'],
  },
  {
    id: 'business',
    name: 'Business',
    price: 15000,
    period: 'month',
    features: ['Everything in Pro', 'Team accounts (up to 5)', '2% platform fee', 'Dedicated support line'],
  },
]

export function formatNaira(amount: number): string {
  const sign = amount < 0 ? '−' : ''
  return `${sign}₦${Math.abs(amount).toLocaleString('en-NG')}`
}
