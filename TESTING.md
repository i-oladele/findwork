# Testing FindWork

Written for whoever is running the first round of testing — you, and anyone
you hand a phone to.

## Before you start

1. A Supabase project, set up as in the [README](README.md#setting-up-the-backend).
2. Seeded (`supabase db push --include-seed`, or `supabase db reset` locally),
   which creates the demo catalog and the accounts below.
3. Paystack **test** keys set (`sk_test_…`), with the webhook URL pointing at
   your deployed `paystack-webhook` function.
4. The app running: `npm run dev`, or deployed somewhere your testers can open.

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
Place another, mark it dispatched in `/admin`, and confirm the customer can
no longer cancel but can report a problem.

### 7. Withdrawals
Provider adds a bank account and withdraws. The balance drops immediately.
In `/admin` → Payouts, reject it once (money returns to their wallet) and
mark another as sent.

### 8. Plans
Provider upgrades to Pro from their wallet, then completes a job: commission
should be 4%, not 6%. On Free, adding a fourth live service is refused.

### 9. Chat and moderation
Message a provider from their profile, reply from the other device (messages
arrive live), then report a message and remove it from `/admin` → Reports.

### 10. The boring but important ones
- Password reset by email.
- Sign out and back in on a shared phone: the previous person's wallet,
  bookings and cart must be gone.
- Delete an account from Settings while money is in escrow — it should
  refuse and say why.

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
escrow, refunds, disputes, commission, top-up idempotency, withdrawals. It
runs in a transaction and rolls back, so it leaves nothing behind, but point
it at staging rather than production.

## Reporting what you find

In the app: Settings → Help and support → "Something is broken". Those land
in `/admin` → Support, tied to the account that sent them, which saves asking
"who were you signed in as?". For anything involving money, include the
reference shown on the transaction or booking.
