// Maps the original design's screen ids (s01–s36) to concrete app routes.
// The source prototype links every card/button to a fixed screen regardless
// of which item was clicked (e.g. every product card -> the same product
// detail screen) — we mirror that here with fixed "demo" ids so every link
// in the app is immediately clickable without wiring real dynamic data.
export const screenRoutes = {
  s01: '/welcome',
  s02: '/signup',
  s03: '/verify',
  s04: '/role',
  s05: '/work-profile',
  s06: '/get-verified',
  s07: '/home',
  s08: '/search',
  s09: '/categories',
  s10: '/provider/ada-tailoring',
  s11: '/book/ada-tailoring/time',
  s12: '/book/ada-tailoring/pay',
  s13: '/book/ada-tailoring/confirmed',
  s14: '/bookings',
  s15: '/post-job',
  s16: '/quotes',
  s17: '/shop',
  s18: '/product/ankara-wax-print',
  s19: '/cart',
  s20: '/checkout',
  s21: '/track/FW-90311',
  s22: '/order/FW-90311',
  s23: '/wallet',
  s24: '/wallet/add',
  s25: '/escrow',
  s26: '/transactions',
  s27: '/messages',
  s28: '/chat/ada-tailoring',
  s29: '/trust',
  s30: '/provider',
  s31: '/provider/jobs',
  s32: '/provider/jobs/aso-ebi-dresses/quote',
  s33: '/provider/requests',
  s34: '/provider/availability',
  s35: '/provider/services',
  s36: '/provider/earnings',
} as const

export type ScreenId = keyof typeof screenRoutes

export function routeFor(id: ScreenId): string {
  return screenRoutes[id]
}
