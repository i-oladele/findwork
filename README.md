# FindWork

A mobile marketplace for Nigeria: hire trusted local providers, buy and sell
goods, move money through escrow, and settle disputes — in one app.

> **Status: every PRD requirement is built; ready for testing, not for real
> money.** Every screen reads and writes real data and escrow works end to end.
> Card payments, automatic payouts, identity checks, live video and road
> routing are built against Paystack, Dojah, LiveKit and Google and switch on
> when their keys are set. Before taking real payments it still needs a
> licensed payments partner, approved legal documents, store releases and the
> steps in [Before real money](#before-real-money).

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
# create .env.local with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
# from your Supabase project (Settings -> API)
npm run dev
```

Without `.env.local` the app builds and renders, but every query fails and the
console warns you why.

### Setting up the backend

```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase db push --include-seed         # migrations + demo catalog and accounts
supabase functions deploy delete-account paystack-initialize paystack-verify payout-account
supabase functions deploy mfa-recover route-estimate route-plan assistant identity-check livekit-token
supabase functions deploy paystack-webhook paystack-charge paystack-payout send-sms send-push --no-verify-jwt
```

Every outside service is optional. Without its keys the app says so on screen
and carries on without it; with them, the feature switches on. Server keys
live in the server section of `.env.local` and go up with
`npm run secrets:push`; [Adding the keys](docs/operations/adding-the-keys.md)
has the steps for each service:

| What | Without it | To switch it on |
| --- | --- | --- |
| Card payments: top-ups, paying for an order or a plan by card, saved cards for renewals | The card option is hidden; people pay from the wallet, topped up by staff | Paystack, below |
| Confirmed bank accounts and automatic payouts | People type their bank details; staff send every withdrawal | Paystack, below |
| Identity checks: NIN or BVN with face match, phone (SIM), CAC | Staff review every ID and business by hand | `supabase secrets set DOJAH_APP_ID=... DOJAH_SECRET_KEY=... DOJAH_BASE_URL=https://sandbox.dojah.io` (drop the base URL for live) |
| Live video for selling, from the phone camera | Sellers paste a link from another streaming app | `supabase secrets set LIVEKIT_URL=wss://<project>.livekit.cloud LIVEKIT_API_KEY=... LIVEKIT_API_SECRET=...` |
| Road routing in traffic: rider rounds and arrival times | Rounds are planned on distance; arrival times are estimates, labelled as such | `supabase secrets set GOOGLE_MAPS_API_KEY=...` with the Routes API enabled |
| Assistant: voice commands beyond the built-in phrases, support answers, chat translation, lesson help, dispute summaries, the staff analyst | Common English and Pidgin commands still work on the device; everything else shows a hint | `supabase secrets set ANTHROPIC_API_KEY=sk-ant-...` (`ASSISTANT_MODEL` optionally picks the model; a key that is not scoped to a workspace also needs `ANTHROPIC_WORKSPACE_ID=wrkspc_...`) |
| Push notifications | The in-app inbox only; in a browser the push switch is hidden | Browsers: see below. The iPhone and Android apps: Phone apps → Push in the apps |
| Second sign-in step (authenticator app) | Not offered | Authentication → Multi-Factor: enable TOTP |
| Text-message sign-up codes | Phone sign-up moves people to the email form | Termii, under the auth settings below |

**Paystack.** With test keys first (`sk_test_…`):

```bash
supabase secrets set PAYSTACK_SECRET_KEY=sk_test_... APP_URL=https://your-app-url \
  PAYSTACK_HOOK_SECRET=<a long random string>
```

In the Paystack dashboard set the webhook URL to
`https://<project-ref>.supabase.co/functions/v1/paystack-webhook`. For
automatic payouts, enable Transfers and turn off OTP for transfers
(Settings → Preferences), and keep money in the Paystack balance. Then tell the
database where the charge and payout functions are (SQL editor, once):

```sql
insert into private.settings values
  ('paystack_charge_url', 'https://<project-ref>.supabase.co/functions/v1/paystack-charge'),
  ('paystack_payout_url', 'https://<project-ref>.supabase.co/functions/v1/paystack-payout'),
  ('paystack_hook_secret', '<the same PAYSTACK_HOOK_SECRET>');
```

Finance staff then switch automatic payouts on, and set their limit, in
`/admin` → Payouts. Until they do, every withdrawal waits for staff.

Push takes three steps. Make a key pair with `npx web-push generate-vapid-keys`,
then:

```bash
supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... \
  VAPID_SUBJECT=mailto:you@your-domain PUSH_HOOK_SECRET=<a long random string>
```

Put the public key in `.env.local` as `VITE_VAPID_PUBLIC_KEY`, and tell the
database where the function is (SQL editor, once per project). The VAPID keys
are for browsers only; the apps are pushed through Firebase (Phone apps →
Push in the apps), and either works without the other:

```sql
insert into private.settings values
  ('push_url', 'https://<project-ref>.supabase.co/functions/v1/send-push'),
  ('push_secret', '<the same PUSH_HOOK_SECRET>');
```

Two things to confirm on the hosted project after the first push, because a
plain Postgres cannot prove either:

- **The API gate.** Suspended accounts, and accounts that have a second
  sign-in step but have not passed it, are refused by a PostgREST pre-request
  hook. The migration installs it; check with
  `select rolconfig from pg_roles where rolname = 'authenticator'`, which
  should list `pgrst.db_pre_request=public.check_request`. If it does not, run
  `alter role authenticator set pgrst.db_pre_request = 'public.check_request';`
  then `notify pgrst, 'reload config';`.
- **Scheduled jobs.** With `pg_cron` enabled (Database → Extensions),
  `select jobname from cron.job` should list renewals, renewal reminders,
  order and purchase-order auto-release, the activity purge, SOS escalation
  (every minute) and the SOS rota-gap reminder. Push needs
  `pg_net` enabled the same way.

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
  functions/      Edge Functions (Deno): account deletion, Paystack, SMS codes,
                  push, sign-in recovery, route estimates, the assistant
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

## Feature areas

Identity, onboarding and account security · hiring, bookings and milestone
payments · commerce with options, coupons and seller stores · wallet, escrow
and transfers · chat, trust score and safe meetups · provider tools · delivery
riders and tracking · wholesale RFQs, purchase orders and invoices · local
classifieds · courses, quizzes, certificates and internships · social feed and
live selling · disputes · subscription billing · staff console with roles,
risk alerts and analytics · the assistant.

[docs/requirements/prd-completion.md](docs/requirements/prd-completion.md)
tracks each PRD requirement against the code, and says plainly which ones stop
at an account that has not been opened yet.

## Translations

The app's own text is in English, Nigerian Pidgin, Yoruba, Igbo and Hausa,
chosen on the Welcome screen or in Settings → Preferences. The English
sentence is the key: wrap new text in `t('...')` from `useT()`
(`src/lib/i18n.ts`), or mark a label defined in a list with `msg('...')`, and
add the translation to each file in `src/locales/`. Anything untranslated shows
in English. `npm run i18n:check` (run by CI) fails if a wrapped sentence is
missing from a catalog or its placeholders differ. The translations were
written by the developers and need a native speaker's review.

## Phone apps

The iPhone and Android apps are the same web app in a Capacitor shell
(`capacitor.config.ts`, `ios/`, `android/`). Inside them,
`src/lib/native.ts` handles the status bar and splash screen, links to the
website that open the app (payment returns, sign-up and password emails),
Android's back button, payment pages in an in-app browser, and pushes that
are tapped (see Push in the apps).

```bash
npm run cap:sync      # build the web app and copy it into both projects
npx cap open ios      # Xcode
npx cap open android  # Android Studio
```

Before a store build:

- **iPhone:** Xcode must be the selected developer tool
  (`sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`). Set the
  signing team, add the Associated Domains capability with
  `applinks:findwork.africa` and `webcredentials:findwork.africa`, and put the
  team ID in place of `TEAMID` in `public/.well-known/apple-app-site-association`.
- **Android:** install Android Studio; put the Play app-signing key's SHA-256
  in `public/.well-known/assetlinks.json`. The app-link host is in
  `android/app/src/main/AndroidManifest.xml`.
- **Digital purchases on iPhone:** Apple requires its in-app purchase for
  digital goods, so the iPhone app does not sell plans or paid courses
  (`digitalPurchasesAllowed` in `src/lib/native.ts`). Bookings, goods and
  top-ups are not affected. Decide whether to add in-app purchase.
- **Passkeys in the apps** need the `webcredentials` association above.

### Push in the apps

Web push does not reach an app, so the apps are pushed through Firebase Cloud
Messaging: Android directly, the iPhone through FCM's bridge to Apple's push
service. The code is in place (`src/lib/nativePush.ts`, `fcm.ts` in
`supabase/functions/send-push`, the `push_devices` table); what is missing is
a Firebase project and its keys.

1. **Firebase project.** At [console.firebase.google.com](https://console.firebase.google.com),
   create a project (Analytics is not needed). Its project ID, under Project
   settings → General, is `FCM_PROJECT_ID` below.
2. **Android.** Add an Android app to the project with the package name
   `africa.findwork.app`, download `google-services.json` and put it in
   `android/app/`. The build applies the Google services plugin only when the
   file is there. It identifies the project rather than granting access, so it
   can be committed.
3. **iPhone.**
   - Add an iOS app with the bundle ID `africa.findwork.app`, download
     `GoogleService-Info.plist`, and drag it into the `App` group in Xcode,
     with the App target ticked. Without it the app runs as before, but turning
     push on says the phone could not be set up.
   - Make an APNs key: [developer.apple.com](https://developer.apple.com/account/resources/authkeys/list)
     → Keys → +, tick Apple Push Notifications service (APNs), and download the
     `.p8` file (Apple offers it once). In Firebase → Project settings → Cloud
     Messaging → Apple app configuration, upload it as the APNs authentication
     key with its Key ID and your Team ID. One key serves development and store
     builds.
   - The Push Notifications capability is already in the project
     (`ios/App/App/App.entitlements`), as is the Firebase Messaging package
     (firebase-ios-sdk 12.19.2, fetched by Xcode on first open). Check that
     Signing & Capabilities shows Push Notifications once the signing team is
     set; automatic signing turns push on for the App ID.
4. **The sender.** Firebase → Project settings → Service accounts → Generate
   new private key. That JSON file is a secret: keep it out of the repository.

   ```bash
   supabase db push      # the push_devices table, before the function that reads it
   supabase secrets set FCM_PROJECT_ID=<project id> \
     FCM_SERVICE_ACCOUNT_JSON="$(cat path/to/service-account.json)"
   supabase functions deploy send-push --no-verify-jwt
   ```

   send-push also needs `PUSH_HOOK_SECRET` and the two `private.settings` rows
   from Setting up the backend, and `pg_net` enabled.
5. **Check on a phone.** Settings → Preferences → Push notifications on this
   device: the phone asks for permission, and a row appears in `push_devices`.
   With the app in the background, message yourself from another account;
   tapping the alert opens the conversation. If nothing arrives, the
   function's logs give FCM's reason: `THIRD_PARTY_AUTH_ERROR` means the APNs
   key is missing or wrong in Firebase.

Push is on or off for the phone: whoever is signed in gets its pushes, and
signing out stops them for that person. While the app is open, alerts are not
shown over it, because the inbox updates by itself. When FCM reports a token
as unregistered (the app was uninstalled), send-push deletes it.

## Commands

```bash
npm run dev         # dev server
npm run build       # typecheck + production build
npm run typecheck   # types only
npm run lint        # oxlint
npm test            # vitest
npm run test:watch

npm run prd:report  # rebuild the PRD checklist from prd-status.json
npm run prd:check   # fail if the checklist is out of date (CI runs this)
npm run i18n:check  # fail if a translation is missing (CI runs this)
npm run cap:sync    # build and copy into the iPhone and Android projects
npm run secrets:push    # upload the filled server keys in .env.local (--dry-run to preview)
npm run demo:accounts   # staff, rider, buyer and seller test accounts on the hosted demo project

# Business rules, against any seeded database (never production):
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/checks/business_rules.sql
```

## Before real money

Honest list of what stands between this and taking real payments.

**Compliance.** Holding customer funds in Nigeria means partnering with a
licensed PSP rather than touching float directly, plus KYC/AML rules for each
verification tier and NDPC registration. Identity checks against the national
registers are built through Dojah and need its keys; until then an admin
checks every ID by hand.

**Payouts.** Withdrawals leave the balance immediately. To bank accounts
confirmed with Paystack they are sent automatically by Paystack Transfers, up
to a limit finance sets in `/admin` → Payouts; everything else is sent by
hand. Reconciliation against Paystack statements is manual. A top-up that
Paystack confirms after its account was deleted is never credited; it waits in
the Payouts queue to be refunded from the Paystack dashboard.

**Fulfilment.** The shop sells FindWork's own catalog, which an admin marks
dispatched and delivered in `/admin`, and goods listed by providers, who send
their own orders from the provider dashboard. A provider's money is held in
escrow until the customer confirms the order arrived, or for a week after
dispatch. Riders apply in the app, are approved by staff, and take deliveries
from a queue; the customer follows the rider on a map and hands over a code on
arrival. With a Google Maps key, rider rounds and arrival times use road times
in current traffic; without one, they are estimates.

**Maps.** Address search and the map on "Add your area" use free
OpenStreetMap services (Photon for search, openstreetmap.org for map tiles),
which ask for fair use and have no uptime promise. Past early traffic, move to
a paid provider: search lives in `src/lib/geocoding.ts`, tiles in
`src/components/ui/LocationMap.tsx`.

**Store review.** The terms of service and privacy policy
(`src/legal/documents.ts`) are drafts written from how the app works, shown as
drafts in the app; a lawyer must review them and fill in the bracketed
details. The iPhone in-app purchase decision above must be made before
submission.

**Rules and models.** Job matching, recommendations, the trust score and the
fraud alerts are fixed rules with weights and thresholds chosen while
building. They explain themselves on screen, and none of them has seen real
activity, so expect to tune them. Forecasts use a seasonal model with a
backtest, and rider rounds are optimised exactly. The assistant, translation,
lesson help, dispute summaries and the staff analyst call Claude.

**Operations.** Staff procedures for every console queue are in
`docs/operations/support-procedures.md`. SOS alerts go to whoever is on the
on-call rota (Operations → SOS on-call rota) and escalate when nobody takes
them; put people on the rota, and confirm `escalate-sos` is in `cron.job`,
before promoting the SOS button.

**Content.** The three starter courses have lessons and quizzes written by
the developers; have someone who practises each trade check them. Every plan
advertises only what it actually does: if you add a feature to the pricing,
add it to `subscription_plans.features` and make it real, because the fee test
checks the advertised percentage against the commission actually charged.
