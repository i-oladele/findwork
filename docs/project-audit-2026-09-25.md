# Project audit — 25 September 2026

Reviewed commit `4b1ab6b` and the current workspace. The pre-existing untracked `.node-version` was preserved. This audit added only this report; it did not change application logic or deploy anything.

The application builds cleanly, but the current migrations contain financial integrity defects that must be fixed before real-money use. In particular, opening product writes to sellers introduced a path to create wallet credit through a negative product price.

Scope: source review of authentication, route/API integration, database permissions and business logic, payment functions, storage/chat, deployment configuration, and automated checks. Findings about database behavior are based on the final definitions across the migration history. They were **not executed against a deployed database**. No local database was created, consistent with the existing project decision in `docs/requirements/implementation-audit.md`.

## Validation performed

| Check | Result |
| --- | --- |
| `npm run lint` | Passed |
| `npm test` | 109 tests passed in 8 files |
| `npm run build` | TypeScript and production build passed |
| `npm audit --json` | 0 known vulnerabilities reported by the registry |
| Account deletion CORS | Reproduced header mismatch using the actual handler and installed Supabase SDK, with a local fetch stub |
| Account deletion on wallet-read failure | Reproduced: actual handler returned HTTP 200 and invoked anonymisation/deletion when the mocked wallet RPC failed |
| Database integration/concurrency | Not run; requires an appropriate Supabase test environment |
| Browser/device, deployed RLS, payment delivery | Not validated in this audit |

Passing unit tests does not validate these money paths. Most existing tests cover helpers and static schema-name contracts. The SQL suite covers first-party orders but has no seller-settlement, stock, rescheduling, or attachment scenarios. No known dependency advisories is also separate from application correctness.

## Findings

### F01 — Critical: a seller can create spendable balance with a negative product price

**Evidence:** `supabase/migrations/20260815130004_commerce.sql:6`; `20260921020000_vendor_accounts.sql:45`, `:138`, `:185`.

`products.price` is an unrestricted integer. The vendor migration grants sellers insert/update access to that column, while `place_order` checks quantities and product visibility but never requires a positive price or total. Buying one's own product is also allowed.

For example, a seller-owned live product priced at −₦10,000 produces a standard-delivery total of −₦8,800. A zero wallet passes the balance check, and the order ledger writes **+₦8,800 spendable balance**. There is no corresponding gateway payment. The withdrawal path checks balance rather than its provenance.

**Fix:** enforce positive product prices and valid order totals with database constraints and RPC validation. Audit existing negative values and related ledger activity before enabling payments. Rejecting self-purchases alone is insufficient because another account can purchase the negative-priced product.

**Acceptance:** direct API writes of non-positive prices fail; no permitted checkout can increase the buyer's spendable balance.

### F02 — High: order delivery can pay a seller repeatedly and bypass a dispute hold

**Evidence:** `supabase/migrations/20260921020000_vendor_accounts.sql:211`, `:385`.

`admin_set_order_status` rejects only cancelled/returned orders. Calling it with `delivered` twice runs `private.release_order` twice, adding two seller payouts and two customer escrow debits. The helper has no settlement guard and does not clear the order's `escrow_held`. The same RPC allows `delivered → dispatched`, which can make an already-paid order eligible for later automatic release. It also omits the open-dispute check used by customer confirmation.

This is an admin workflow/retry defect, not an authorization bypass: an authorized operator can accidentally duplicate money or release disputed funds.

**Fix:** define allowed forward transitions, make settlement idempotent under the order lock, record/clear the remaining hold, and enforce dispute checks in the shared settlement path. Back settlement with a unique ledger/event key.

**Acceptance:** repeated delivery, stale admin requests, redispatch after delivery, and delivery during a dispute never create an additional payout.

### F03 — High: returning a paid vendor order refunds money without recovering the seller payout

**Evidence:** `supabase/migrations/20260921020000_vendor_accounts.sql:422`, `:483`, `:543`; `src/routes/commerce/OrderReturn.tsx`.

Delivered orders remain eligible for disputes, and the UI explicitly offers a return after delivery. Resolving that dispute with `refund` credits the customer the entire total. It never reverses or otherwise funds recovery of the seller's already-released proceeds. Because the release path retained `escrow_held`, the refund also subtracts the same hold a second time, making the customer's aggregate escrow negative.

**Fix:** distinguish an escrow refund from a post-settlement return. Track the remaining hold and fund any return through an explicit seller recovery/reserve or platform-funded adjustment policy. Do not debit already-consumed escrow.

**Acceptance:** deliver a vendor order, then approve a return; reconcile customer, seller, platform fees, and escrow without duplicate credits or negative held funds.

### F04 — High: disputes race with cancellation/settlement and can be opened twice

**Evidence:** `supabase/migrations/20260921020000_vendor_accounts.sql:529`, `:539`, `:552`; `20260918100300_disputes_moderation_support.sql:20`.

`open_dispute` reads the booking/order without a row lock, checks for an existing dispute, then inserts. The open-dispute index is not unique. Two concurrent calls can both create open disputes. A cancellation or completion can also commit after the initial status check but before the dispute is inserted, leaving a dispute on already-settled money. `resolve_dispute` guards the dispute's status, but its refund branches do not independently reject an already-refunded reference.

**Fix:** lock the referenced booking/order before validating or opening a dispute, enforce one open dispute per reference with a partial unique index, and revalidate financial state during resolution. Use consistent lock ordering across all paths.

**Acceptance:** concurrent open/open, open/cancel, and open/complete tests result in one valid decision and exactly one settlement/refund.

### F05 — High: mutable product prices can bypass checkout's balance check

**Evidence:** `supabase/migrations/20260921020000_vendor_accounts.sql:138–179`.

Checkout computes `v_total_due`, waits for the wallet lock, and later rereads the product catalog to compute the actual orders and item snapshots. It never locks the product rows or preserves one authoritative price snapshot. A seller price change between these statements can increase the eventual debit after a lower amount passed the balance check; item snapshots can also disagree with the order total.

**Fix:** normalize the cart, lock its product rows in a stable order, and derive stock validation, balance validation, order totals, item snapshots, and debits from the same data. Establish consistent lock ordering with other wallet/catalog operations.

**Acceptance:** hold a customer's wallet lock, start checkout, change a seller's price, then release the lock. Checkout must either use one agreed snapshot or revalidate the full new amount; the wallet cannot go negative.

### F06 — Medium: duplicate cart entries bypass aggregate stock limits

**Evidence:** `supabase/migrations/20260921020000_vendor_accounts.sql:127`, `:170`, `:176`, `:371`.

The RPC accepts repeated product IDs. With stock 5, two entries of quantity 4 each independently pass the stock check and create 8 purchased units. The `UPDATE … FROM` subtracts just one matching entry from the product row, leaving stock 1. Cancellation has the same non-aggregated join problem.

This follows PostgreSQL's documented behavior: when a target row joins multiple source rows, only one source row is used for the update. See the [PostgreSQL 17 UPDATE documentation](https://www.postgresql.org/docs/17/sql-update.html).

**Fix:** aggregate or reject duplicate IDs before validating quantities and stock; update inventory once per product using the aggregate quantity.

**Acceptance:** repeated product IDs cannot purchase more than stock or evade the quantity cap; cancellations restore exactly the quantity reserved.

### F07 — High: checkout displays less than the wallet will be charged

**Evidence:** `src/routes/commerce/Checkout.tsx:39–44`; `supabase/migrations/20260921020000_vendor_accounts.sql:136–141`.

The checkout summary, payment button, and top-up shortfall add one delivery fee. The server charges one fee **per seller**, counting the first-party catalog as another seller. A two-seller standard cart therefore costs ₦1,200 more than shown. A sufficiently funded wallet is charged the larger amount; an exactly funded wallet repeatedly encounters insufficient funds despite the displayed total.

**Fix:** present a server-calculated checkout quote with each seller's delivery fee, and use it consistently for the summary, payment confirmation, and shortfall.

**Acceptance:** one-, two-, and mixed first-party/vendor carts display exactly the amount debited, including after a top-up.

### F08 — Medium: account deletion's CORS response blocks the browser SDK

**Evidence:** `supabase/functions/delete-account/index.ts:11–17`; `src/lib/api/account.ts:14`.

The function allows only `authorization, content-type`, whereas the installed Supabase SDK sends `apikey` and `x-client-info` too. A local reproduction captured those headers from `functions.invoke` and compared them with the actual handler's OPTIONS response; both are missing. The browser consequently rejects the cross-origin request before deletion runs.

**Fix:** reuse `_shared/http.ts` CORS headers. This matches [Supabase's browser invocation guidance](https://supabase.com/docs/guides/functions/cors).

**Acceptance:** a browser preflight with the SDK's headers succeeds, followed by the intended authenticated response.

### F09 — High: account deletion proceeds when it cannot establish that funds are clear

**Evidence:** `supabase/functions/delete-account/index.ts:57–84`; `supabase/migrations/20260918100400_payments_and_payouts.sql:279`.

The handler discards the wallet RPC error and interprets missing data as zero balance/escrow. Running the actual handler with a failed wallet read returned HTTP 200 and invoked both anonymisation and auth deletion.

Its successful-read path also checks only the caller's ledger: an unpaid provider's active jobs hold money on the customer's ledger, and pending withdrawals have already reduced the caller's balance. Those obligations can survive account deletion. Vendor products are not hidden by `anonymise_profile`, so a deleted seller's live listings can remain purchasable.

**Fix:** fail closed on query errors, validate outstanding obligations on both sides of bookings/orders and pending payments/withdrawals, and disable purchasing from deleted accounts. Perform database eligibility checks and the account-state transition atomically, with explicit recovery if auth deletion fails.

**Acceptance:** wallet lookup failures and unresolved financial obligations prevent deletion; successfully deleted sellers cannot receive new orders.

### F10 — Medium: simultaneous plan upgrades charge twice

**Evidence:** `supabase/migrations/20260918100100_booking_lifecycle.sql:584–600`.

`subscribe_plan` reads the current plan before acquiring the wallet lock. Two simultaneous Free → Pro requests both see Free. They serialize their debits, but the second never rechecks the plan, so both charge while the upsert leaves only one month's subscription. The balance lock prevents overspending but does not make the upgrade idempotent.

**Fix:** serialize the entire subscription decision before reading current state, then recheck it under the lock. Apply consistent ordering with renewal and downgrade operations.

**Acceptance:** two simultaneous requests for the same upgrade charge once and produce one subscription period.

### F11 — Medium: vendor commerce has database support but lacks its user workflow

**Evidence:** `src/App.tsx`; `src/lib/api/commerce.ts`; `src/routes/commerce/OrderReturn.tsx`; `src/lib/database.types.ts:252`, `:267`; vendor migration's `dispatch_order` and `confirm_order_received`.

There are no seller product-management or seller-order routes/hooks, and no application call to either dispatch or confirm-received RPC. The manually maintained Product/Order types also omit the new seller, stock, and escrow fields. Admin fulfilment is the only connected route for progressing these orders. The migration therefore does not constitute completed vendor commerce, despite implementing purchasing and settlement rules.

**Fix:** either explicitly defer vendor product availability or complete seller catalog/orders, buyer receipt confirmation, notification navigation, generated schema types, and the checkout integration as one feature.

**Acceptance:** a seller creates a product, receives and dispatches an order, and the buyer confirms receipt through the app; balances and statuses update correctly.

### F12 — Medium: older conversations disappear from the inbox

**Evidence:** `src/lib/api/chat.ts:44–68`.

The inbox loads the latest 500 messages across all threads, then removes threads with no message in that result. One busy thread can consume all 500 rows, hiding other conversations that have real message history. Unread counts are also computed from this truncated global window.

**Fix:** query one latest-message summary and an independent unread count per thread, with pagination. The per-thread message view also needs explicit pagination rather than relying on the API row cap.

**Acceptance:** after 500+ messages in one conversation, older conversations remain visible and unread counts stay accurate.

## Remediation order

1. Close F01 and repair the settlement/refund/dispute invariants in F02–F05. Add Supabase staging regression tests, including concurrent sessions and ledger reconciliation.
2. Fix inventory normalization and checkout totals (F06–F07), then complete or defer vendor UI exposure (F11).
3. Repair account deletion and subscription concurrency (F08–F10), including failure-path tests.
4. Fix chat summaries/pagination (F12) and add browser journeys for checkout, dispute resolution, deletion, and seller fulfilment.

## Remaining project-level gaps

- The earlier requirements audit still applies to substantial missing areas: native delivery, logistics, verification integrations, push notifications, social commerce, platform analytics, and several wholesale/learning flows. This audit does not mark them complete.
- Some earlier findings are now outdated: rescheduling, provider portfolios, and private chat attachments have source implementations; the admin view now renders dispute evidence. They still need integration acceptance testing.
- README descriptions of first-party-only commerce no longer describe the database. Keep the product scope, migrations, generated types, UI, and testing guide in sync.
- Deployment state, scheduler installation, auth-provider configuration, backups, observability, and live payment reconciliation remain unverified. Repository configuration alone does not establish their deployed state.
- The SQL CI storage stub lacks the `metadata` field read by `send_chat_attachment`, and the SQL suite does not invoke that path. Extend the test fixture and exercise storage authorization/metadata before relying on CI for attachment coverage.

Use this report alongside the earlier requirements audit: this one prioritizes concrete correctness defects rather than repeating the full feature backlog.
