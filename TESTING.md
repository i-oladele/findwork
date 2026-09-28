# Testing FindWork

Written for whoever is running the first round of testing — you, and anyone
you hand a phone to.

## Before you start

1. A Supabase project, set up as in the [README](README.md#setting-up-the-backend).
2. Seeded (`supabase db push --include-seed`), which creates the demo catalog
   and the accounts below.
3. The auth settings from the README, above all a real email sender: testers
   signing up with their own address get no code without one.
4. Paystack **test** keys set (`sk_test_…`), with the webhook URL pointing at
   your deployed `paystack-webhook` function.
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
| `hello@mamankechi.ng` | Provider — not verified, no services yet |
| `admin@findwork.africa` | Operations console at `/admin` |

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

## Things that are meant to look unfinished

Not bugs; they are listed in the README under "Before real money":

- Identity verification is done by an admin, not an automated NIN check.
- Withdrawals are sent by hand from `/admin`.
- Orders have no rider tracking, only a status.
- Course lessons have no written material yet.
- Terms and privacy pages are placeholders.

## Before each round

```bash
npm run lint && npm run typecheck && npm test
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/checks/business_rules.sql
```

The SQL suite signs in as the seeded users and exercises every money rule —
escrow, refunds, disputes, commission, top-up idempotency, withdrawals,
seller orders and returns, and what blocks account deletion. It
runs in a transaction and rolls back, so it leaves nothing behind, but point
it at staging rather than production.

## Reporting what you find

In the app: Settings → Help and support → "Something is broken". Those land
in `/admin` → Support, tied to the account that sent them, which saves asking
"who were you signed in as?". For anything involving money, include the
reference shown on the transaction or booking.
