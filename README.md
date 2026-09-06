# FindWork

A mobile marketplace for Nigeria: hire trusted local providers, buy and sell
goods, move money through escrow, and settle disputes — in one app.

> **Status: pre-launch.** The screens are complete and the database schema is
> written, but most screens still read mock data, no payment provider is
> connected, and there is no native app yet. See [What is not done](#what-is-not-done).

## Stack

| Layer | Choice |
| --- | --- |
| UI | React 19, TypeScript, Vite 8, Tailwind v4 |
| Routing | React Router 7, lazy-loaded per route |
| Server state | TanStack Query over `@supabase/supabase-js` |
| Local UI state | Zustand |
| Backend | Supabase — Postgres, Auth, Storage, Realtime, Edge Functions |
| Tests | Vitest |

## Getting started

```bash
npm install
cp .env.example .env.local     # fill in from your Supabase project
npm run dev
```

Without `.env.local` the app builds and renders, but every query fails and the
console warns you why.

### Setting up the backend

```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase db push                        # applies supabase/migrations/
supabase functions deploy delete-account
```

Then regenerate types whenever the schema changes:

```bash
supabase gen types typescript --linked > src/lib/database.types.ts
```

`database.types.ts` is currently hand-written to match the migrations. Replace
it with generated output as soon as a project is linked.

## Layout

```
src/
  lib/
    api/          One module per domain — the only place screens touch data
    auth.tsx      AuthProvider; authContext.ts holds the hook
    supabase.ts   Typed client + Postgres error to user-facing copy
    database.types.ts
  components/
    chrome/       Screen shell, status bar, bottom nav
    system/       Route guards, error boundary, loading/empty/error states
    ui/           Buttons, inputs, cards, badges
  routes/         One folder per feature area, one file per screen
  data/mock.ts    Placeholder catalog data — being replaced by lib/api
supabase/
  migrations/     Schema, RLS policies, and business-logic RPCs
  functions/      Edge Functions (Deno)
```

### How data flows

Screens never call Supabase directly. They use a hook from `src/lib/api/`,
which owns caching, invalidation and error shape:

```tsx
const { data: providers, isLoading, isError } = useProviders({ verifiedOnly: true })
```

Anything involving money, atomicity, or derived state goes through a
`SECURITY DEFINER` RPC rather than a table write, so it cannot be forged from
devtools. Balances are never stored — they are the sum of an append-only
ledger. Bookings carry a Postgres exclusion constraint that makes
double-booking a provider impossible rather than merely unlikely.

## The 11 feature areas

Identity and onboarding · hiring and bookings · commerce · wallet and escrow ·
chat and trust · provider tools · B2B wholesale RFQs · local classifieds ·
learning and certification · dispute resolution · subscription billing.

## Commands

```bash
npm run dev         # dev server
npm run build       # typecheck + production build
npm run typecheck   # types only
npm run lint        # oxlint
npm test            # vitest
npm run test:watch
```

## What is not done

Honest list of what stands between this and a live app.

**Wiring.** Auth, settings, and notifications read real data. The other ~47
screens still read `src/data/mock.ts`. The hooks they need already exist in
`src/lib/api/`.

**Money.** `add_money` credits the wallet with no payment behind it — anyone
signed in can top themselves up. It needs a Paystack or Flutterwave charge
plus a signature-verified webhook. Provider payouts need bank details and a
transfer integration. Disputes are recorded but do not freeze escrow, and
there is no admin surface for a human to adjudicate one.

**Compliance.** Holding customer funds in Nigeria means partnering with a
licensed PSP rather than touching float directly, plus KYC/AML tiers (the
verification screen is UI only) and NDPR registration.

**Native.** There is no mobile app yet — this is a mobile-shaped web app. It
needs Capacitor, real safe-area handling in place of the mocked status bar,
push notifications, camera access for KYC and listings, biometric sign-in, an
app icon and splash screens.

**Store review.** Privacy policy and terms are placeholders. Selling the
subscription plans on iOS outside Apple's in-app purchase is the most common
cause of marketplace-app rejection and needs a decision before that flow is
built.

**Product gaps.** No password reset, no booking or order cancellation, no
write-a-review screen (the table and hooks exist), no help or support surface,
no moderation or reporting for classifieds and chat.
