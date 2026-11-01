# Testing FindWork

Written for whoever is running the first round of testing — you, and anyone
you hand a phone to.

## Before you start

1. A Supabase project, set up as in the [README](README.md#setting-up-the-backend).
2. Seeded (`supabase db push --include-seed`), which creates the demo catalog
   and the seed accounts below; then `npm run demo:accounts` for the staff,
   rider, business-buyer and seller accounts and some test money.
3. The auth settings from the README, above all a real email sender: testers
   signing up with their own address get no code without one.
4. Outside services are optional. Without their keys, card payments, ID
   checks, live video, road routing, text-message codes and push to the phone
   apps are off, and the app says so; everything else can be tested. To add
   them, follow [Adding the keys](docs/operations/adding-the-keys.md).
5. The app running: `npm run dev`, or deployed somewhere your testers can open.

Use a **staging project**, not one holding real data: the check suite and the
seed both assume they can be reset.

## Test accounts

All seeded accounts share the password `findwork-demo-2026`.

| Email | Who they are |
| --- | --- |
| `ada@findwork.africa` | Customer, starts with ₦48,200 |
| `hello@adastailoring.ng` | Provider — tailoring, verified, two services |
| `hello@chidiplumbing.ng` | Provider — plumbing, verified |
| `hello@mamankechi.ng` | Provider — not verified, no services yet; sells three goods (fabric, a headtie, a made-to-measure kaftan) |
| `admin@findwork.africa` | Operations console at `/admin`, everything |
| `tunde.a@example.ng` | Customer; a buyer in Okoro Foods who needs approval above ₦50,000 |

From `npm run demo:accounts`, same password:

| Email | Who they are |
| --- | --- |
| `moderator@findwork.africa` | Staff: disputes, reports, verification, users, risk, SOS, courses |
| `finance@findwork.africa` | Staff: payouts, wallets, reports |
| `support@findwork.africa` | Staff: help requests, orders, deliveries |
| `rider@findwork.africa` | Rider, approved, motorcycle, Yaba |
| `buyer@findwork.africa` | Business buyer, owner of Okoro Foods Ltd (test) |

It also credits test money as staff adjustments: ₦200,000 to Adaeze,
₦500,000 to the business buyer and ₦100,000 to Tunde. Delete all of these
accounts before launch.

Sign up as yourself too: a brand-new account is the most honest test, and it
starts with an empty wallet, which is the state most testers will be in.

## Giving testers money

Two ways, both real:

- **Paystack test mode.** Wallet → Add money → pay with test card
  `4084 0840 8408 4081`, any future expiry, CVV `408`, OTP `123456`. The
  money lands when Paystack confirms it.
- **Admin credit.** Sign in as the admin, go to `/admin` → Wallets, search
  for the person, and credit them. It appears in their ledger as an
  adjustment naming the admin, which is deliberate — it is auditable.

## What to walk through

Each of these crosses the boundary between two people, which is where
marketplaces break. Use two devices, or two browsers.

### 1. Booking, the happy path
Customer books a service → provider accepts → customer marks it done.
Watch: the customer's balance drops by price + 5% at booking, escrow shows
the amount held, and on release the provider's balance rises by the price
less their plan's commission (6% on Free).

### 2. The money coming back
- Provider **declines** a booking → customer refunded in full.
- Customer **cancels** before the start time → refunded in full.
- Try to cancel a booking that has already started → refused, with a
  pointer to reporting a problem instead.

### 3. Disputes
Customer books, provider accepts, customer reports a problem with a photo.
Check the customer can no longer release or cancel, then settle it in
`/admin` three ways on three different bookings: pay the provider, refund the
customer, dismiss. Both sides should get a notification each time.

### 4. Double-booking
Two customers try the same provider at the same time. The second one is
refused: the slot is greyed out in the picker, and the server refuses it even
if you get past the UI.

### 5. Jobs and quotes
Customer posts a job → provider quotes → customer accepts and picks a start
time. The job closes, other quotes are marked declined, and the booking is
already paid into escrow.

### 6. Shop
Add to cart, check out with a delivery address, then cancel for a refund.
With goods from two sellers in the cart, checkout shows two deliveries, and
the total on the pay button is exactly what leaves the wallet.
Place another, mark it dispatched in `/admin`, and confirm the customer can
no longer cancel but can report a problem.

### 7. Selling goods
Sign in as `hello@adastailoring.ng`, go to Dashboard → My products and add
one with a photo and a stock of 2. It appears in the Shop under the business
name. From the customer's device, buy it. Ada sees it under Orders → To send
with the address and phone; she marks it sent. The customer taps "I have
received it" on the order: Ada's balance rises by the price less 6%. Buy it
again and have Ada cancel instead: the customer is refunded and told why, and
the stock goes back up.

### 8. Withdrawals
Provider adds a bank account and withdraws. The balance drops immediately.
In `/admin` → Payouts, reject it once (money returns to their wallet) and
mark another as sent.

### 9. Plans
Provider upgrades to Pro from their wallet, then completes a job: commission
should be 4%, not 6%. On Free, adding a fourth live service is refused.
Tapping Upgrade twice in quick succession charges one month, not two.

### 10. Chat and moderation
Message a provider from their profile, reply from the other device (messages
arrive live), then report a message and remove it from `/admin` → Reports.
Every conversation stays in the inbox, however busy another one gets.

### 11. Verification
A brand-new account sees "Complete verification to access all services" on
Home. Tap it, choose NIN, enter 11 digits, add a photo of an ID and a
selfie, and send: Home now says the ID is being checked. In `/admin` →
Verification, reject it with a reason, and check the account sees the
reason and can send again. Approve the second one: the notice disappears,
and a provider gets the Verified badge.

### 12. Your location
On Home, tap "Add your area". Tap "Use my current location" (on the laptop,
or the https site; phones on the plain local address can only search), or
search for a street or landmark and pick a suggestion. The pin lands there;
drag it, or tap the map, to fine-tune. Save: Home shows the address, and
checkout offers it as the delivery address.

### 13. The boring but important ones
- Password reset by email.
- Sign out and back in on a shared phone: the previous person's wallet,
  bookings and cart must be gone.
- Delete an account from Settings while money is in escrow, or as a
  provider with an accepted job — it should refuse and say why.

### 14. Built in early October

Everything below passed its database checks and unit tests. A first browser
walk on 21 October covered sign-in, Home and the staff console; the rest has
not been walked by a person yet.

- **Staff roles.** In `/admin` → Users, give a second account the moderator,
  finance or support role. Each should see only its own tabs. Suspend an
  account and confirm it is signed out of everything and told why.
- **Second sign-in step.** Settings → Security: add an authenticator app, save
  the recovery codes, sign out and back in. Then use a recovery code instead.
- **Limits and trust.** A new unverified account should be refused a
  withdrawal and a transfer, and told what to verify. Profiles show a trust
  score with its reasons.
- **Transfers.** Wallet → Send money, to another account's phone or email.
- **Milestones.** As a provider, send a quote split into stages; as the
  customer, accept it and release one stage at a time.
- **Options and coupons.** Give a product sizes or colours with their own stock
  and price; create a coupon in the provider dashboard; use it at checkout and
  check the total matches what the wallet is charged.
- **Riders.** Apply at `/rider`, approve in `/admin` → Deliveries, go online,
  accept a delivery, and complete it with the customer's code. Watch
  `/track/:orderId` as the customer on another device.
- **Meetups and SOS.** From a classified, propose a meetup, share location,
  and raise an SOS; it should reach `/admin` → Risk at once.
- **Wholesale.** Post an RFQ with line items, accept a quote, fund the
  purchase order, mark it delivered and confirm; open its invoice.
- **Learning.** Write a lesson and a quiz in `/admin/courses`, pass it as a
  learner, and open the certificate's public link while signed out.
- **Internships, feed and live.** Post and apply to an internship; publish a
  post to `/feed`; schedule a stream at `/live` and pin a product.
- **Push.** With the keys set, switch push on in Preferences and trigger a
  notification from another account with the app closed.

### 15. Built 18–21 October

Each needs its provider's test keys set first (README, "Setting up the
backend"); without them the app hides the feature or says it is off.

- **Card at checkout** (Paystack test keys). Choose "Card or bank transfer",
  pay with the test card below, and you should land on "Order placed". Change
  the cart in another tab while paying: the money should be kept in your
  wallet with the reason.
- **Plans by card.** Upgrade to Pro by card with "keep the card" ticked; Plan
  and billing should show the card. Set `renews_at` to the past in the SQL
  editor and run `select private.renew_subscriptions()`: the card is charged.
  Remove the card and repeat: the wallet is charged.
- **Bank accounts and automatic payouts.** Withdraw shows a bank list; the
  bank's name for the account appears before saving. In `/admin` → Payouts
  switch automatic payouts on, then withdraw: it should go to "Sending" and
  then "Sent" (Paystack test transfers). Withdraw above the limit: it waits
  for staff.
- **Identity checks** (Dojah sandbox). Get verified with NIN `70123456789` or
  BVN `22222222222` and any clear selfie; with a matching name the account is
  verified at once. Use a different name: it waits in `/admin` → Verification
  with the register's answers and a risk alert. Business: RC `1261103`.
- **Live video** (LiveKit keys). Schedule a stream "From this phone's camera",
  start the camera, go live, and watch from a second account.
- **Stock records.** As a business buyer, receive a delivered purchase order
  into stock, record use until an item runs low, and follow "Request quotes".
- **Calendar matching.** Post a job with a "Needed by" date; providers whose
  calendars are full before then score lower, and each says why.
- **Rider rounds** (Google Maps key). With two deliveries, the suggested order
  shows minutes to each stop by road.
- **Languages.** Choose Yoruba, Igbo, Hausa or Pidgin on Welcome or in
  Preferences and walk the main screens. Note anything that reads wrongly.
- **The analyst.** `/admin/analytics` → "Summarise this period".
- **The phone apps.** `npm run cap:sync`, then run from Xcode or Android
  Studio on a phone: camera, microphone, location, a Paystack payment and the
  return to the app.

Paystack test card: `4084 0840 8408 4081`, any future expiry, CVV `408`,
PIN `0000`, OTP `123456`. Dojah sandbox values:
https://docs.dojah.io/api-reference/get-started/sandbox-test-data

### 16. Built 1 November

- **SOS on-call rota.** As the admin, `/admin` → SOS on-call rota: add a
  primary shift for the moderator starting now. As Adaeze, press SOS on a
  meet-up. The moderator is told it is theirs; the Risk tab shows Adaeze's
  phone number, her position, who she was meeting, and "I'm on it". Leave it
  untaken: after 2 minutes the admin is alerted, after 5 every admin and
  moderator, then every 5 minutes. Press "I'm on it": Adaeze is told someone
  is calling. End the shift afterwards. With nobody on the rota, an SOS goes
  to every admin and moderator at once.
- **Trust badges.** The verification level and trust score show on a seller's
  product (one of Mama Nkechi's), in the chat header with anyone, and on each
  quote when comparing quotes for a job. Switch to Yoruba: the badge is
  translated.

## Things that are meant to look unfinished

Not bugs; they are listed in the README under "Before real money":

- Without each provider's keys: IDs are checked by an admin, withdrawals are
  sent by hand, cards are not offered, live video comes from a pasted link,
  arrival times are estimates, phone sign-up moves to the email form, and the
  phone apps get no push.
- Nobody is on the SOS rota yet, so every SOS goes to every admin and
  moderator.
- The staff console is in English whatever language is chosen.
- Terms and privacy pages are marked as drafts for legal review.
- The iPhone app does not sell plans or paid courses.

## Before each round

```bash
npm run lint && npm run typecheck && npm test
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/checks/business_rules.sql
```

The SQL suite signs in as the seeded users and exercises every money rule —
escrow, refunds, disputes, commission, top-up idempotency, withdrawals,
seller orders and returns, milestones, coupons, transfers, purchase orders,
rider payouts, limits, and what blocks account deletion. It
runs in a transaction and rolls back, so it leaves nothing behind, but point
it at staging rather than production.

## Reporting what you find

In the app: Settings → Help and support → "Something is broken". Those land
in `/admin` → Support, tied to the account that sent them, which saves asking
"who were you signed in as?". For anything involving money, include the
reference shown on the transaction or booking.
