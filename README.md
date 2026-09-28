# FindWork

A mobile marketplace for Nigeria: hire trusted local providers, buy and sell
goods, move money through escrow, and settle disputes — in one app.

> **Status: ready for testing, not for real money.** Every screen reads and
> writes real data, escrow works end to end, and top-ups run through Paystack.
> Before taking real payments it still needs a licensed payments partner, KYC,
> written legal documents and a native build. See
> [Before real money](#before-real-money).

## Stack

| Layer | Choice |
| --- | --- |
| UI | React 19, TypeScript, Vite 8, Tailwind v4 |
| Routing | React Router 7, lazy-loaded per route |
| Server state | TanStack Query over `@supabase/supabase-js` |
| Local UI state | Zustand (the cart only) |
| Backend | Supabase — Postgres, Auth, Storage, Realtime, Edge Functions |
| Payments | Paystack (test mode) |
| Tests | Vitest, plus a SQL check suite |

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
supabase db push --include-seed         # migrations + demo catalog and accounts
supabase functions deploy delete-account paystack-initialize paystack-verify
supabase functions deploy paystack-webhook send-sms --no-verify-jwt
supabase secrets set PAYSTACK_SECRET_KEY=sk_test_... APP_URL=https://your-app-url
```

In the Paystack dashboard, set the webhook URL to
`https://<project-ref>.supabase.co/functions/v1/paystack-webhook`.

Then regenerate types whenever the schema changes:

```bash
supabase gen types typescript --linked > src/lib/database.types.ts
```

`database.types.ts` is currently hand-written to match the migrations. Replace
it with generated output as soon as a project is linked.

For strangers to be able to sign up, four auth settings in the Supabase
dashboard (Authentication) have to be right:

1. **A real email sender** (Emails → SMTP settings): Resend, Postmark,
   Amazon SES, Brevo or similar. Supabase's built-in mailer only writes to
   the project's own team, a couple of times an hour, so with it nobody else
   ever receives a sign-up code.
2. **The confirmation email** (Emails → Confirm signup): paste
   `supabase/templates/confirmation.html`, with the subject from its header.
   It carries the 6-digit code the app's `/verify` screen asks for, and a
   one-tap link. The default template has only the link.
3. **Where links land** (URL Configuration): the Site URL is the app's
   address, and Redirect URLs include it followed by `/**`. Otherwise the
   confirmation link and password reset take people somewhere else.
4. **Phone sign-up**, the app's default, texts codes through Termii, a
   Nigerian provider whose DND route reaches every Nigerian number. Supabase
   makes each code and hands it to the `send-sms` function to deliver:
   - In Termii: an approved sender ID (FindWork) and the DND route switched
     on for the account, with credit in the wallet.
   - In Supabase, Authentication → Hooks: add a **Send SMS** hook of type
     HTTPS, pointing at `https://<project-ref>.supabase.co/functions/v1/send-sms`,
     and generate its secret.
   - `supabase secrets set SEND_SMS_HOOK_SECRET='v1,whsec_…'
     TERMII_API_KEY=… TERMII_BASE_URL=https://… TERMII_SENDER_ID=FindWork`
   - Sign In / Providers → Phone: switch it on, with SMS OTP expiry at
     600 seconds. The text says the code lasts 10 minutes, and it must match
     the template registered with Termii word for word (see `smsText` in
     `supabase/functions/send-sms/deliverCode.ts`).

   Codes go only to Nigerian numbers; set `SMS_COUNTRIES` (calling codes,
   comma separated) to add countries Termii can reach. Anyone else, and
   everyone while Phone is off, is told why and moved to the email form.

With email confirmation switched off, sign-up goes straight into the app and
no code is sent.

[TESTING.md](TESTING.md) covers test accounts, Paystack test cards, and what
to walk through.

## Layout

```
src/
  lib/
    api/          One module per domain — the only place screens touch data
    auth.tsx      AuthProvider; authContext.ts holds the hook
    supabase.ts   Typed client + Postgres error to user-facing copy
    format.ts     Naira, and dates rendered in Lagos time
    slots.ts      Which booking slots are offered, and why
    database.types.ts
  components/
    chrome/       Screen shell, safe-area spacer, bottom nav, page header
    system/       Route guards, error boundary, loading/empty/error states
    ui/           Buttons, inputs, cards, badges, photo picker, slot picker
  routes/         One folder per feature area, one file per screen
  store/cart.ts   The cart — the only state kept on the device
supabase/
  migrations/     Schema, RLS policies, and business-logic RPCs
  functions/      Edge Functions (Deno): account deletion, Paystack
  checks/         SQL suite that exercises every money rule as real users
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

Three rules the database enforces, whatever the client sends:

- **Prices come from the server.** `pay_booking` takes a package id, not an
  amount; `place_order` reads prices from the catalog.
- **Columns, not just rows, are protected.** Column-level grants mean a user
  cannot set `is_admin` on themselves, and a provider cannot set `verified`
  or their own rating.
- **Money moves under a lock.** Every debit takes a per-wallet advisory lock
  first, so two requests in flight cannot spend the same balance twice.

### Money, end to end

```
top up (Paystack) → wallet → book (escrow) → provider accepts
        → customer confirms → provider paid, less their plan's commission
        → provider withdraws to a bank account
```

Escrow is refunded in full when a provider declines, when either side cancels
before the start time, or when an admin resolves a dispute that way. Opening a
dispute freezes the money until a human settles it in `/admin`.

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

# Business rules, against any seeded database (never production):
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/checks/business_rules.sql
```

## Before real money

Honest list of what stands between this and taking real payments.

**Compliance.** Holding customer funds in Nigeria means partnering with a
licensed PSP rather than touching float directly, plus KYC/AML tiers and NDPR
registration. Identity verification is a human step today: a provider asks,
an admin checks them and switches on the badge. Wiring up a KYC vendor
(Smile ID, Dojah, Prembly) replaces that.

**Payouts.** Withdrawals leave the provider's balance immediately and queue in
`/admin` for the team to send by bank transfer. Automating them through
Paystack Transfers is the next step, and needs a live Paystack account. A
top-up that Paystack confirms after its account was deleted is never
credited; it waits in the same queue to be refunded from the Paystack
dashboard.

**Fulfilment.** The shop sells FindWork's own catalog, which an admin marks
dispatched and delivered in `/admin`, and goods listed by providers, who send
their own orders from the provider dashboard. A provider's money is held in
escrow until the customer confirms the order arrived, or for a week after
dispatch. There is no rider tracking, so the order screen shows status rather
than a map.

**Maps.** Address search and the map on "Add your area" use free
OpenStreetMap services (Photon for search, openstreetmap.org for map tiles),
which ask for fair use and have no uptime promise. Past early traffic, move to
a paid provider: search lives in `src/lib/geocoding.ts`, tiles in
`src/components/ui/LocationMap.tsx`.

**Native.** There is no mobile app yet — this is a mobile-shaped web app that
handles phone safe areas, so it behaves correctly in a phone browser. A store
build needs Capacitor, push notifications, camera access for KYC, biometric
sign-in, an app icon and splash screens, and a web manifest if you want
"add to home screen" to work properly first.

**Store review.** Privacy policy and terms are still placeholders and must be
written before submission. Selling subscription plans on iOS outside Apple's
in-app purchase is the most common cause of marketplace-app rejection and
needs a decision before an iOS build.

**Product gaps.** Course lessons have no written content yet. There is no
trust score formula, so profiles show the underlying signals instead of a
number. Every plan now advertises only what it actually does — if you add a
feature to the pricing, add it to `subscription_plans.features` and make it
real, because the fee test checks the advertised percentage against the
commission actually charged.
