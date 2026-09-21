# FindWork requirements audit

Reviewed 21 September 2026 against [the functionality document](functionality.pdf)
(20 pages) and [the delivery roadmap](roadmap.pdf) (16 pages). Searchable,
page-numbered extractions are in `functionality.md` and `roadmap.md`.

**Approved architecture:** retain React/Vite and Supabase (user decision,
21 September 2026), replacing the roadmap's Next.js/DigitalOcean stack choice.
Functional requirements remain in scope. No native app is present yet.

**Database environment:** Supabase only (user decision, 21 September 2026).
Do not create or run a local database. Validate migrations against an appropriate
Supabase test environment before applying them to live data.

This is a source-code and local-test audit, not certification of deployed
services. “Implemented” means a screen/API/database path exists; production
credentials, external providers, usability and device checks still need validation.
The working tree already contained substantial uncommitted implementation before
this audit; it has been preserved. Baseline: 94 Vitest tests, lint and build pass.

## 1. Identity and authentication

| ID | Requirement | State and evidence | Remaining work |
|---|---|---|---|
| ID-01 | Email/phone signup, OTP, passwords, sessions | Implemented in `src/routes/onboarding`, `src/lib/auth.tsx`; Supabase Auth | Verify actual SMS/email delivery, recovery links, rate limits and session revocation on staging |
| ID-02 | Social sign-in | Partial: `SocialSignIn.tsx`, `src/lib/oauth.ts` | Verify configured providers, credentials, redirect allowlists and callbacks |
| ID-03 | Biometrics and MFA | Missing | MFA enrollment/challenge/recovery and route enforcement; native biometric session unlock |
| ID-04 | Role selection, dynamic forms, dashboards, preferences | Partial: customer/provider onboarding and settings | Vendor, rider, supplier/enterprise roles and dashboards; persistent role-specific preferences |
| ID-05 | BVN, NIN, CAC, face and SIM verification | Missing integrations: `GetVerified.tsx` submits a support request; admin toggles badge | Verification provider, evidence lifecycle, callback validation, distinct verification levels, wallet/trust integration |
| ID-06 | Suspicious-login monitoring | Missing | Security events, device/session history, anomaly signals and admin review |

## 2. Services marketplace

| ID | Requirement | State and evidence | Remaining work |
|---|---|---|---|
| SV-01 | Titles, descriptions, categories, pricing, packages, availability | Implemented in provider profile/service editor, `api/providers.ts`, provider tables | Validate full CRUD and plan limits under concurrent writes |
| SV-02 | Portfolio, images, videos, certifications | Missing for services; avatar/classified photo upload does not satisfy this | Provider/service media storage, upload/edit/display, certification evidence |
| SV-03 | Discovery, search, filters, recommendations | Partial: category/name/price/verified/rating filters and paid-priority ranking | Location/skill/availability matching and recommendation engine; ranking is not AI |
| SV-04 | Job posting, bids, proposals, budgets, deadlines | Implemented in `PostJob`, `SendQuote`, `JobQuotes`, job/quote tables | Staging acceptance of quote-to-escrow flow; proposal editing/withdrawal UX |
| SV-05 | Calendar, requests, approval/rejection, booking history | Implemented in availability, slot picker and both booking lists | Live multi-user validation, consistent hours/notice policy server-side |
| SV-06 | Rescheduling | Missing at audit baseline; first implementation batch | Mutual approval, conflict checks, history, notification and unchanged escrow; track validation below |
| SV-07 | Live chat | Implemented: threads, text messages, realtime, unread state | End-to-end realtime verification; pagination and inbox updates at scale |
| SV-08 | Voice messages and media sharing | Missing: sender API only accepts text | Private attachments, participant access, recording/playback, moderation |
| SV-09 | Push notifications | Missing: existing notifications are an in-app inbox | Device subscriptions/tokens, delivery worker, permissions/preferences and deep links |

## 3. E-commerce

| ID | Requirement | State and evidence | Remaining work |
|---|---|---|---|
| EC-01 | Vendor stores, listings, variants, pricing, inventory, media | Partial: read-only first-party product catalog (`products.vendor` is text; `variant` is a label) | Vendor ownership/onboarding/dashboard; product CRUD, variant stock/SKUs, media and inventory reservations |
| EC-02 | Cart, quantities, checkout | Implemented: Zustand cart and server-priced `place_order` | Multi-vendor fulfilment/payment allocation and stock enforcement |
| EC-03 | Coupons | Missing | Scoped, expiring coupons with server validation and atomic redemption limits |
| EC-04 | Address management | Partial: profile address and checkout snapshot | Saved-address book/defaults, edit/delete and delivery validation |
| EC-05 | Live status, rider tracking, delivery updates, ETA | Partial: admin changes placed/dispatched/delivered status | Rider assignment, live location, ETA/maps and delivery notifications |
| EC-06 | Returns, approvals, refunds, evidence | Partial: cancellation/refund and order disputes with evidence | Dedicated return workflow, return collection/inspection, vendor participation and refund outcomes |

## 4. Wholesale and procurement

| ID | Requirement | State and evidence | Remaining work |
|---|---|---|---|
| B2B-01 | RFQ submission, supplier bidding, quote comparison, approval | Partial: RFQ CRUD, sorted quotes, acceptance closes RFQ (`api/rfqs.ts`) | Supplier verification/discovery and procurement approval roles |
| B2B-02 | RFQ escrow and invoices | Missing | Acceptance must produce a purchase order, escrow/payment obligation, invoice and fulfilment state |
| B2B-03 | Procurement tracking, supplier management, bulk ordering, invoice history | Missing | Enterprise dashboard, organizations/teams, supplier directory, purchase orders, inventory/payment/analytics links |

## 5. Local classifieds and safety

| ID | Requirement | State and evidence | Remaining work |
|---|---|---|---|
| CL-01 | Nearby listings, geo-search, rentals, used goods | Partial: category-filtered listings, photos, textual location and seller chat | Coordinates, radius/distance search, maps, listing lifecycle and editing |
| CL-02 | SOS, live location, verification badges, safety reporting | Partial: reporting/moderation exists | Emergency contact/SOS flow, consent-based expiring location sharing, verified seller signals and monitoring |

## 6. AI infrastructure

| ID | Requirement | State and evidence | Remaining work |
|---|---|---|---|
| AI-01 | Skill, location, budget and availability matching | Missing | Matching data model, retrieval/ranking, evaluation and marketplace integration |
| AI-02 | Device tracking, suspicious behavior, transaction monitoring, fake listing detection | Missing | Event capture, explainable risk rules/model, alerts, review and appeals |
| AI-03 | Voice onboarding/navigation, multilingual speech, translation, low-literacy access | Missing | Language priorities, speech provider, accessible voice UI, transcription/translation and text fallback |
| AI-04 | Support/workflow automation, learning assistant, predictive insights | Missing | Tool permissions, source-grounded answers, human handoff, quality evaluation and cost controls |

## 7. Payments and fintech

| ID | Requirement | State and evidence | Remaining work |
|---|---|---|---|
| PAY-01 | Wallet balance, deposits, withdrawals, history | Partial: append-only ledger, Paystack initialize/verify/webhook, withdrawal queue | Confirm live integration configuration; bank validation and automated transfer/reconciliation; currently manual payouts |
| PAY-02 | Wallet transfers | Missing | Recipient confirmation, idempotent debit/credit, limits, notifications and reconciliation |
| PAY-03 | Escrow holding, release, refunds, transaction protection | Implemented for service bookings; order/RFQ parity absent | Extend to vendors/procurement; licensed partner settlement integration |
| PAY-04 | Milestone escrow (roadmap) | Missing | Milestone schedule, partial release/refund, acceptance and disputes |
| PAY-05 | Plans, auto-renewal, billing history, reminders | Partial: wallet plan purchase, monthly renewal SQL, ledger history | Verify pg_cron scheduling (best-effort migration); upcoming-renewal reminders; subscription concurrency/expiry checks; advertised team accounts |
| PAY-06 | Gateway processing, verification, transaction logs, commissions | Implemented for Paystack top-ups and service commissions | Staging webhook/replay verification, live settlement reconciliation, vendor/rider/supplier commissions |

## 8. Logistics and delivery

| ID | Requirement | State and evidence | Remaining work |
|---|---|---|---|
| LG-01 | Rider onboarding, assignments, availability, earnings | Missing | Rider role, dispatch queue, assignment lifecycle, earnings and order linkage |
| LG-02 | Delivery requests, tracking, location, ETA | Missing | Delivery model, location updates, customer tracking and delivery completion proof |
| LG-03 | Smart routing, traffic, route optimization, maps | Missing | Maps/routing provider, server-side routing adapter, ETA refresh and operational fallback |

## 9. Social commerce

| ID | Requirement | State and evidence | Remaining work |
|---|---|---|---|
| SC-01 | Stories, reels/short video, engagement, social feed | Missing | Feed/posts, uploads/transcoding, expiry, engagement events, product/store tags and moderation |
| SC-02 | Livestreams, live chat, product tags, purchase links | Missing | Streaming provider, host/viewer flows, stream moderation, catalog and checkout integration |

## 10. Learning and certification

| ID | Requirement | State and evidence | Remaining work |
|---|---|---|---|
| LE-01 | Video lessons, enrollment, progress, quizzes | Partial: paid/free enrollment, text lesson body, completion and percentage | Video delivery, authored content, quizzes and assessment validation; empty lessons can currently be marked done |
| LE-02 | Certificates, badges, completion logic | Partial: percentage completion only | Completion criteria, certificate issuance/verification/revocation, profile badges |
| LE-03 | Internships, applications, skill matching | Partial: `courses.kind = internship`; “Apply now” calls enrollment | Dedicated postings, applications, employer review/status and matching |

## 11. Trust and security

| ID | Requirement | State and evidence | Remaining work |
|---|---|---|---|
| TR-01 | Ratings, verification levels, transactions, complaints, trust score | Partial: verified flag, reviews, completed jobs and disputes; `Trust.tsx` explicitly has no composite score | Defined score policy, levels, complaint outcomes/history, recomputation and explanation |
| TR-02 | Transaction scanning, risk analysis, alerts, fraud/admin links | Missing beyond transaction authorization/ledger controls | Risk events/rules, monitoring queue, alerting, restrictions and review |

## 12. Disputes

| ID | Requirement | State and evidence | Remaining work |
|---|---|---|---|
| DS-01 | Complaints, evidence, refunds, moderation | Implemented for bookings/orders: disputes API, SQL locks/freezes and admin resolution | Admin currently shows evidence count without review links; audit trail and counterparty evidence/response workflow |
| DS-02 | AI moderation and cross-module integration | Missing | Moderation triage, explanations, human decision boundary; vendor/RFQ/milestone integration |

## 13. Administration

| ID | Requirement | State and evidence | Remaining work |
|---|---|---|---|
| AD-01 | User monitoring, suspension, verification, roles | Partial: operations queue, manual provider verification and wallet lookup | User directory, server-enforced suspension, role management, security/verification case view and audit logs |
| AD-02 | Moderation, platform controls, operational tools | Partial: disputes, orders, payouts, reports, support (`Admin.tsx`) | Catalog/course management, configurable rules, complete evidence review; explicit query error/loading states |
| AD-03 | Revenue, users, engagement, financial dashboards | Missing platform analytics; provider earnings screen is narrower | Aggregate metrics with defined revenue/escrow semantics, filters, export and access controls |

## 14. Analytics and reporting

| ID | Requirement | State and evidence | Remaining work |
|---|---|---|---|
| AN-01 | Live dashboards, user activity, revenue, transactions | Missing platform-wide reporting | Event collection, aggregation, drilldowns/exports, live refresh and retention policy |
| AN-02 | Marketplace insights and predictive analytics | Missing | Marketplace metric definitions, quality/volume checks, forecasting and validation |

## Cross-cutting roadmap requirements

| ID | Requirement | State and evidence | Remaining work |
|---|---|---|---|
| X-01 | Brand, UI system, mobile UX and accessibility | Partial: local fonts/icons, reusable UI, mobile layout | Compare against brand assets; keyboard/screen reader, contrast, real-device and responsive QA |
| X-02 | Mobile app delivery | Missing native shell/build | Native runtime choice, push/camera/biometrics, deep links, store assets and release pipelines; PWA install/offline support also absent |
| X-03 | Environments, deploy pipelines, SSL, monitoring, logging, backups | Partial: Supabase config/migrations and GitHub CI | Verify deployed environment isolation; app deployment, observability, backup/restore drills and alert ownership |
| X-04 | Schema, API, storage, auth, realtime and security | Implemented foundation | Repeat authorization/concurrency checks for every new domain; generate schema types from migrations |
| X-05 | Functional/regression/UX/security/performance QA | Partial: Vitest and Postgres business-rule CI | Browser journeys, device tests, accessibility, concurrency/load tests and security review |
| X-06 | Optimization, caching, database tuning, queues, recovery | Partial: query cache, lazy routes, SQL indexes | Job queues/retries, media pipeline, load measurements, database tuning and recovery verification |
| X-07 | Launch content and policies | Missing: legal pages are placeholders and lessons lack content | Approved terms/privacy, real learning material and operational support content |

## Implementation order

1. Close existing workflow gaps: rescheduling, dispute evidence review, service
   portfolios, saved addresses, private chat media, notifications and admin user tools.
2. Build vendor commerce with inventory/variants/coupons and settlement, then
   rider logistics and delivery tracking. These are roadmap MVP requirements.
3. Complete authentication/verification, payment transfers/renewal/payouts,
   social commerce and MVP analytics. Integrations need actual service accounts.
4. Add local safety/geosearch, enterprise procurement and complete learning,
   certificates and internship applications.
5. Add AI/multilingual features, advanced trust/reporting, native delivery and
   measured production hardening.

Every item needs UI, authorized API/storage, server-side invariants, notifications
where required, and acceptance checks. A table or placeholder screen alone does
not complete a requirement. External integration choices should be resolved when
their implementation batch is ready; no production purchases/deployments have
been made by this audit.

## First batch acceptance: booking rescheduling

- Either booking participant can propose a new future time before the original
  booking starts; only the other participant can accept or decline.
- The original slot remains booked until acceptance. A proposed slot is not
  reserved and must be checked again at acceptance.
- The same booking, agreed price, duration and escrow survive a schedule change.
- Closed, disputed, unauthorized, past, unavailable and conflicting changes fail.
- Requests can be withdrawn; previous decisions remain visible in the history.
- Cancellation/completion invalidates outstanding requests; both sides receive
  appropriate in-app notifications.
- Verify against a Supabase test environment and with component tests before marking done.

## Validation log

- Baseline: 94 tests passed; lint and production build passed.
- Local source review covers all 14 functionality sections and roadmap additions.
- Deployed integration and browser/device acceptance remain outstanding.
- The temporary local PostgreSQL instance created during this audit was stopped
  and removed at the user's request. Database validation remains outstanding.
