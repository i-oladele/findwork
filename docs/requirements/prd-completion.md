# FindWork PRD completion checklist

Reviewed 2026-10-21 against the original 20-page [functionality document](functionality.pdf), its [text extraction](functionality.md), and the [delivery roadmap](roadmap.md). Baseline commit: `7c37b51`, plus the current working-tree implementation. This is a completion ledger, not a claim that the product is finished.

## Completion standard

- **implemented**: a source-code path exists; deployed behavior is not yet signed off.
- **partial**: part of the named requirement exists; the remaining work is described below.
- **missing**: no complete implementation was found for this requirement in its PRD context.
- **verified**: implementation plus recorded acceptance evidence, including authorization and failure cases. A screen, table, mock, unit test or compiling build alone is insufficient.

There are **33 features and 239 component/integration requirements**: 239 implemented, 0 partial, 0 missing, 0 verified. These counts are not a completion percentage; requirements differ substantially in size. Repeated integrations retain separate IDs because each domain must actually integrate.

Each feature lists source evidence, remaining work and an acceptance scenario. The machine-readable source is [prd-status.json](prd-status.json). Run `npm run prd:report` after updating it; `npm run prd:check` checks every component and integration against the original wording and rejects an out-of-date report. This check verifies traceability, not functionality.

## Current constraints and decisions

- Keep React/Vite and Supabase, as previously approved; the roadmap's Next.js/DigitalOcean stack is superseded, not its functional requirements.
- No local Supabase stack. SQL checks run on plain Postgres 17, as CI does, and were last run on 21 October 2026 (558 checks). They have not been run against the hosted project, which holds demo data only.
- Every requirement now has a source-code path. On 21 October 2026 the new migrations were applied to the hosted project, all fifteen Edge Functions were deployed, and the app was walked in a browser against it as a customer, a provider and an admin; what that walk found was fixed the same day.
- Outside services are built to their test or sandbox APIs and stay switched off until their keys are set, saying so on screen: Paystack (card checkout, saved-card renewals, confirmed bank accounts and automatic payouts), Dojah (BVN, NIN, CAC, face and SIM checks), LiveKit (live video), Google Maps (road routing and traffic), Termii (SMS codes). None has been exercised against its provider yet. Push keys and the assistant's API key are set on the hosted project.
- Policy numbers chosen while building are first proposals to confirm: the trust score weights, the daily limits per verification tier, the rider's 80% share of the delivery fee, the risk-rule thresholds, the automatic-payout limit, and coupons being funded by whoever issues them.
- Preserve the historical September audits. Several of their missing-feature findings were completed by later commits; this checklist is the current status source.
- Lesson content, the terms of service and the privacy policy are written as drafts for review by practitioners and a lawyer; the app shows the legal pages as drafts. The Yoruba, Igbo, Hausa and Pidgin translations need a native speaker's review.

## What happens next

1. Set the outside services' test keys (Paystack, Dojah, LiveKit, Google Maps, Termii) and walk each flow end to end.
2. Have the translations, lessons and legal drafts reviewed; decide in-app purchase on iPhone for plans and paid courses.
3. Walk every journey on real phones, including push, the second sign-in step and a suspended account; run the business-rule checks against a staging copy of the hosted database.
4. Confirm or change the policy numbers above, then tune the risk rules, matching and payout limit against real activity.
5. Harden for launch: security review and penetration test, load test, monitoring, backups and restore drill, store listings for the iPhone and Android apps, and the compliance steps before real money.

## Introduction and roadmap requirements beyond the component tables

The PRD introduction and conclusion also describe the following expectations. Roadmap phases add explicit delivery work; these remain in scope even when absent from the 239 bullets above.

| Requirement / roadmap phase | Current status and acceptance still required |
|---|---|
| Mobile app (PRD p.2), native delivery | iPhone and Android projects (Capacitor) wrap the web app with FindWork's icon and splash, camera, microphone and location permissions, links that open the app, and payments in an in-app browser. The iPhone build compiles and runs in the simulator. Native push (APNs/FCM), passkeys in the app, store listings and signing remain; plans and paid courses are not sold in the iPhone app pending an in-app purchase decision. |
| Certifications and service packages (PRD introduction) | Packages and provider-supplied credential uploads implemented. Course certificates are issued on passing and can be verified by code without an account; the three starter courses have lessons and quizzes awaiting practitioner review. |
| Scale to millions (PRD conclusion) | Unverified aspiration. Define traffic/data targets, then load-test and document capacity, availability and recovery limits. |
| Phase 1: brand and UI/UX | UI system exists. Brand positioning/messaging/assets, prototype/design handoff, navigation, responsive/device and accessibility acceptance remain unverified. |
| Phase 2: infrastructure | Supabase migrations and GitHub CI exist. Environment isolation, app hosting/SSL, deployment pipelines, monitoring/logging, backups and restore drills remain unverified. |
| Phase 3: identity | F01–F03. Provider credentials do not replace authoritative identity checks. |
| Phase 4: services | F04–F06. Also validate discovery filters, recommendations and proposal lifecycle. |
| Phase 5: communication and social commerce | F07, F24–F25. In-app notifications do not satisfy push delivery. |
| Phase 6: commerce | F08–F11. Validate vendor store/dashboard, variants, inventory and fulfilment together. |
| Phase 7: money, trust and admin | F19–F21, F28–F32. Milestone escrow is built and reconciles in the database checks; premium features and renewal reminders require acceptance. |
| Phase 8: logistics and MVP QA | F22–F23 are built in source. Functional, regression, security, performance and launch testing have not started. |
| Phase 9: classifieds and safety | F14–F15. |
| Phase 10: wholesale and procurement | F12–F13. |
| Phase 11: learning | F26–F27, with certificate issuance, public verification, completion rules and profile badges built. Starter lesson content written; review pending. |
| Phase 12: AI and automation | F16–F17 are fixed, explainable rules rather than models. F18, the support, lesson and dispute helpers and the staff analyst call Claude through one metered function, grounded in FindWork's own material; commands, support answers, translation, lesson help and the analyst have answered live, dispute summaries have not, and none has been evaluated systematically. Forecasts use a seasonal Holt-Winters model with a backtest; rider routes are optimised exactly on road times. |
| Phase 13: security/disputes | F28–F30 plus audit history and security review. |
| Phase 14: admin/reporting | F31–F33 plus role-protected exports, complete revenue definitions and marketplace insights. |
| Phase 15: hardening and scale | Functional/regression/UX/security/performance QA, penetration testing, cache/database tuning, queues/retries, media processing, load tests, backup automation and disaster recovery remain unverified. |
| Launch content and policies | Terms of service and privacy policy (NDPA) drafted from how the app works, shown as drafts pending legal review; support procedures in docs/operations/support-procedures.md (the SOS on-call rota is still missing). |

## F01 · User Registration & Login

PRD feature begins on page 3.

| ID | Requirement | Status |
|---|---|---|
| F01-C01 | Email signup | implemented |
| F01-C02 | Phone number signup | implemented |
| F01-C03 | OTP verification | implemented |
| F01-C04 | Password management | implemented |
| F01-C05 | Social login integration | implemented |
| F01-C06 | Biometric authentication | implemented |
| F01-C07 | Multi-factor authentication | implemented |
| F01-I01 | Integrates with Security Module for authentication validation | implemented |
| F01-I02 | Connects with User Role System for onboarding | implemented |
| F01-I03 | Integrates with Notification System for OTP delivery | implemented |
| F01-I04 | Connects with Fraud Detection System for suspicious login monitoring | implemented |

Evidence / relevant current code: [src/lib/auth.tsx](../../src/lib/auth.tsx), [src/routes/onboarding](../../src/routes/onboarding), [src/lib/passkeys.ts](../../src/lib/passkeys.ts), [supabase/migrations/20261004000700_staff_roles_and_suspension.sql](../../supabase/migrations/20261004000700_staff_roles_and_suspension.sql), [supabase/migrations/20261004000800_mfa.sql](../../supabase/migrations/20261004000800_mfa.sql), [src/routes/settings/Security.tsx](../../src/routes/settings/Security.tsx), [src/components/system/MfaChallenge.tsx](../../src/components/system/MfaChallenge.tsx), [supabase/functions/mfa-recover/index.ts](../../supabase/functions/mfa-recover/index.ts).

Remaining: Two-step sign-in with an authenticator app and single-use recovery codes is built, and an account that has it cannot use the API or spend on a password-only session. A sign-in from a new device notifies the owner and unusual patterns raise a risk alert. On 4 October 2026 the mfa-recover function was deployed and the API pre-request hook was confirmed installed on the hosted project; neither has been exercised there yet with a real second step or a suspended account. Phone codes go through Termii by the send-sms hook; the code is complete and deployed, and starts working once the Termii secrets and the Supabase SMS hook are set. Email, SMS, OAuth and passkeys need hosted/device verification.

Acceptance: Register with email and phone, verify/resend/expire a code, recover a password, sign in socially and with a passkey, challenge MFA, revoke a session, and review a suspicious-login event.

Verification: Database rules executed on plain Postgres 17 on 4 October 2026 (supabase/checks/business_rules.sql sections 27 and 28). Deployed integration and user-journey acceptance are still pending.

## F02 · Role-Based Onboarding

PRD feature begins on page 3.

| ID | Requirement | Status |
|---|---|---|
| F02-C01 | Role selection interface | implemented |
| F02-C02 | Dynamic onboarding forms | implemented |
| F02-C03 | Role-specific dashboard assignment | implemented |
| F02-C04 | User preference setup | implemented |
| F02-I01 | Connects with Marketplace Modules | implemented |
| F02-I02 | Integrates with Admin Panel | implemented |
| F02-I03 | Links with Analytics System for behavior tracking | implemented |

Evidence / relevant current code: [src/routes/onboarding/ChooseRole.tsx](../../src/routes/onboarding/ChooseRole.tsx), [src/routes/onboarding/WorkProfile.tsx](../../src/routes/onboarding/WorkProfile.tsx), [src/routes/provider/Dashboard.tsx](../../src/routes/provider/Dashboard.tsx), [src/routes/settings/Preferences.tsx](../../src/routes/settings/Preferences.tsx), [src/routes/rider/Rider.tsx](../../src/routes/rider/Rider.tsx), [src/routes/procurement/Procurement.tsx](../../src/routes/procurement/Procurement.tsx), [src/lib/tracking.ts](../../src/lib/tracking.ts).

Remaining: A new account chooses to hire or buy, work or sell, deliver, or buy for a business; each has its own set-up and its own home. Language, notification and interest preferences are saved. Which kinds of screen people open is recorded (by route shape, never whose page), with an opt-out that erases what was kept, and reported to staff by role, funnel and week-one return.

Acceptance: Complete onboarding for every supported role, reopen saved preferences, land in the correct dashboard and prevent unauthorized role changes.

Verification: Pending deployed integration and user-journey acceptance.

## F03 · Identity Verification

PRD feature begins on page 4.

| ID | Requirement | Status |
|---|---|---|
| F03-C01 | BVN verification | implemented |
| F03-C02 | NIN verification | implemented |
| F03-C03 | CAC verification | implemented |
| F03-C04 | Face verification | implemented |
| F03-C05 | SIM verification | implemented |
| F03-I01 | Connected to Fraud Detection Engine | implemented |
| F03-I02 | Linked with Wallet & Payments Module | implemented |
| F03-I03 | Integrated into Trust Score System | implemented |

Evidence / relevant current code: [src/routes/onboarding/GetVerified.tsx](../../src/routes/onboarding/GetVerified.tsx), [supabase/migrations/20260925000900_identity_verification.sql](../../supabase/migrations/20260925000900_identity_verification.sql), [supabase/migrations/20261004000900_risk_and_trust.sql](../../supabase/migrations/20261004000900_risk_and_trust.sql), [supabase/migrations/20261018000400_identity_checks.sql](../../supabase/migrations/20261018000400_identity_checks.sql), [supabase/functions/identity-check/index.ts](../../supabase/functions/identity-check/index.ts), [supabase/functions/identity-check/identityCheck.ts](../../supabase/functions/identity-check/identityCheck.ts), [supabase/functions/_shared/dojah.ts](../../supabase/functions/_shared/dojah.ts), [src/lib/__tests__/identity-check.test.ts](../../src/lib/__tests__/identity-check.test.ts).

Remaining: Built against Dojah: a NIN or BVN is looked up on the national register with the person's name, the selfie is matched to the register's photo, the account's phone number is checked against the register's owner of that ID (SIM), and a business is checked on the CAC register by RC number, name and status. When every required check matches the account is verified at once; anything else stays with staff beside the register's answers, and mismatches, missing records and duplicate IDs raise risk alerts (the fraud link). Nothing is rejected automatically. Needs DOJAH_APP_ID and DOJAH_SECRET_KEY (sandbox first); until then review stays by hand. Not yet run against Dojah's sandbox.

Acceptance: Exercise each verification method, rejection and retry; validate signed vendor callbacks and evidence access/retention; apply verified tiers to trust and payments.

Verification: Database rules executed on plain Postgres 17 on 21 October 2026 (supabase/checks/business_rules.sql section 43); migrations applied and functions deployed to the hosted project the same day. Matching rules unit tested; not yet exercised against Dojah.

## F04 · Service Listings

PRD feature begins on page 4.

| ID | Requirement | Status |
|---|---|---|
| F04-C01 | Service title | implemented |
| F04-C02 | Pricing setup | implemented |
| F04-C03 | Portfolio uploads | implemented |
| F04-C04 | Images & videos | implemented |
| F04-C05 | Category selection | implemented |
| F04-C06 | Service description | implemented |
| F04-I01 | Connected to AI Recommendation Engine | implemented |
| F04-I02 | Integrated with Booking System | implemented |
| F04-I03 | Linked with Live Chat Module | implemented |

Evidence / relevant current code: [src/routes/provider/ServiceEditor.tsx](../../src/routes/provider/ServiceEditor.tsx), [src/routes/onboarding/WorkProfile.tsx](../../src/routes/onboarding/WorkProfile.tsx), [src/routes/provider/Portfolio.tsx](../../src/routes/provider/Portfolio.tsx), [src/routes/hiring/ProviderProfile.tsx](../../src/routes/hiring/ProviderProfile.tsx), [supabase/migrations/20261004000200_provider_media.sql](../../supabase/migrations/20261004000200_provider_media.sql), [src/lib/api/matching.ts](../../src/lib/api/matching.ts).

Remaining: Home suggests providers from the trades someone said they came for or has booked, nearer and better reviewed first, by a fixed rule rather than a model. The video and credential workflow requires deployed storage and browser acceptance; credentials are self-reported.

Acceptance: Create/edit a priced service, publish images/video/credentials, view as a customer, remove content, reject another provider’s file, then book and message the provider.

Verification: Pending deployed integration and user-journey acceptance.

## F05 · Job Posting & Bidding

PRD feature begins on page 5.

| ID | Requirement | Status |
|---|---|---|
| F05-C01 | Job posting form | implemented |
| F05-C02 | Bid submission system | implemented |
| F05-C03 | Proposal management | implemented |
| F05-C04 | Budget settings | implemented |
| F05-C05 | Deadline setup | implemented |
| F05-I01 | Connected to Notification System | implemented |
| F05-I02 | Integrated with Escrow Payments | implemented |
| F05-I03 | Linked with AI Job Matching | implemented |

Evidence / relevant current code: [src/lib/api/marketplace.ts](../../src/lib/api/marketplace.ts), [src/routes/hiring/JobQuotes.tsx](../../src/routes/hiring/JobQuotes.tsx), [src/routes/provider/SendQuote.tsx](../../src/routes/provider/SendQuote.tsx), [supabase/migrations/20261004000400_quote_management.sql](../../supabase/migrations/20261004000400_quote_management.sql), [src/components/ui/QuoteHistory.tsx](../../src/components/ui/QuoteHistory.tsx), [src/lib/__tests__/quote-management.test.tsx](../../src/lib/__tests__/quote-management.test.tsx), [src/lib/api/matching.ts](../../src/lib/api/matching.ts).

Remaining: Providers can revise, withdraw and re-send a quote; customers see the revision history and can only accept the version they reviewed. Posting a job with its trade and area matches it to providers by a fixed score, and the customer can invite the best fits. Budget, deadline, revision and quote-to-booking flows require staging acceptance.

Acceptance: Post a budget and deadline; submit, amend, withdraw, compare and accept bids; verify notifications and exactly one escrow booking.

Verification: Database rules executed on plain Postgres 17 on 4 October 2026 (supabase/checks/business_rules.sql section 24). Deployed integration and user-journey acceptance are still pending.

## F06 · Booking Management

PRD feature begins on page 5.

| ID | Requirement | Status |
|---|---|---|
| F06-C01 | Availability calendar | implemented |
| F06-C02 | Booking requests | implemented |
| F06-C03 | Booking approval/rejection | implemented |
| F06-C04 | Rescheduling system | implemented |
| F06-C05 | Booking history | implemented |
| F06-I01 | Connected with Payments Module | implemented |
| F06-I02 | Integrated with Notification System | implemented |
| F06-I03 | Linked with Analytics Dashboard | implemented |

Evidence / relevant current code: [src/lib/api/bookings.ts](../../src/lib/api/bookings.ts), [src/routes/hiring/RescheduleBooking.tsx](../../src/routes/hiring/RescheduleBooking.tsx), [supabase/migrations/20260921000100_booking_rescheduling.sql](../../supabase/migrations/20260921000100_booking_rescheduling.sql), [supabase/migrations/20261004001800_matching_and_analytics.sql](../../supabase/migrations/20261004001800_matching_and_analytics.sql), [src/routes/admin/Analytics.tsx](../../src/routes/admin/Analytics.tsx).

Remaining: The staff report covers bookings created, completed, cancelled and rescheduled, their average value, and breakdowns by trade and area, with the steps from viewing a provider to booking. Multi-user rescheduling, availability conflicts and payments need hosted acceptance.

Acceptance: Book, accept/decline, request and accept/decline a reschedule, reject conflicting slots, cancel/refund and complete/release; preserve history and notify both sides.

Verification: Pending deployed integration and user-journey acceptance.

## F07 · Live Communication System

PRD feature begins on page 6.

| ID | Requirement | Status |
|---|---|---|
| F07-C01 | Live chat | implemented |
| F07-C02 | Voice messaging | implemented |
| F07-C03 | Media sharing | implemented |
| F07-C04 | Push notifications | implemented |
| F07-I01 | Connected with Marketplace Transactions | implemented |
| F07-I02 | Linked with Order Tracking | implemented |
| F07-I03 | Integrated with Dispute Resolution | implemented |

Evidence / relevant current code: [src/lib/api/chat.ts](../../src/lib/api/chat.ts), [src/components/ui/VoiceRecorder.tsx](../../src/components/ui/VoiceRecorder.tsx), [src/components/ui/ChatComposer.tsx](../../src/components/ui/ChatComposer.tsx), [supabase/migrations/20261004001300_push_and_preferences.sql](../../supabase/migrations/20261004001300_push_and_preferences.sql), [supabase/functions/send-push/index.ts](../../supabase/functions/send-push/index.ts), [public/sw.js](../../public/sw.js), [src/lib/push.ts](../../src/lib/push.ts), [src/routes/chat/ChatThread.tsx](../../src/routes/chat/ChatThread.tsx).

Remaining: A chat shows the open booking, order, purchase order and dispute between the two people, each linking to its screen. Every in-app notification can be pushed to devices with push on; sending needs the send-push function deployed with a VAPID key pair, pg_net and two settings rows, none of which is configured, and no push has reached a real device.

Acceptance: Use two accounts to exchange text, voice and media, paginate old messages, verify unread state, deny outsiders and follow transaction-linked push deep links.

Verification: Subscription rules executed on plain Postgres 17 on 4 October 2026 (supabase/checks/business_rules.sql section 33); the sender's logic is unit tested. No push has been delivered to a device.

## F08 · Product Management

PRD feature begins on page 6.

| ID | Requirement | Status |
|---|---|---|
| F08-C01 | Product listing | implemented |
| F08-C02 | Product variants | implemented |
| F08-C03 | Pricing management | implemented |
| F08-C04 | Inventory tracking | implemented |
| F08-C05 | Product media uploads | implemented |
| F08-I01 | Connected with Vendor Stores | implemented |
| F08-I02 | Linked with AI Recommendations | implemented |
| F08-I03 | Integrated with Order Management | implemented |

Evidence / relevant current code: [src/lib/api/seller.ts](../../src/lib/api/seller.ts), [src/routes/provider/ProductEditor.tsx](../../src/routes/provider/ProductEditor.tsx), [supabase/migrations/20260925000600_seller_storefront.sql](../../supabase/migrations/20260925000600_seller_storefront.sql), [supabase/migrations/20261004001100_variants_and_coupons.sql](../../supabase/migrations/20261004001100_variants_and_coupons.sql), [src/routes/provider/ProductOptions.tsx](../../src/routes/provider/ProductOptions.tsx), [src/routes/commerce/Store.tsx](../../src/routes/commerce/Store.tsx).

Remaining: A product can be sold in options (sizes, colours, packs), each with its own price and stock. Each seller has a store page. A product page suggests what the same customers also bought, more from the seller, and what is selling: counted from orders, not a model. Options have one level only and no photo per option.

Acceptance: Create and edit a product with separately priced/stocked variants and media; discover its store, purchase, dispatch, and reconcile stock and seller settlement.

Verification: Database rules executed on plain Postgres 17 on 4 October 2026 (supabase/checks/business_rules.sql section 31). Deployed integration and user-journey acceptance are still pending.

## F09 · Shopping Cart & Checkout

PRD feature begins on page 7.

| ID | Requirement | Status |
|---|---|---|
| F09-C01 | Shopping cart | implemented |
| F09-C02 | Quantity management | implemented |
| F09-C03 | Coupon system | implemented |
| F09-C04 | Address management | implemented |
| F09-C05 | Checkout process | implemented |
| F09-I01 | Integrated with Payment Gateway | implemented |
| F09-I02 | Connected with Logistics Module | implemented |
| F09-I03 | Linked with Wallet System | implemented |

Evidence / relevant current code: [src/routes/commerce/Checkout.tsx](../../src/routes/commerce/Checkout.tsx), [src/routes/settings/Addresses.tsx](../../src/routes/settings/Addresses.tsx), [supabase/migrations/20261004000100_saved_addresses.sql](../../supabase/migrations/20261004000100_saved_addresses.sql), [supabase/migrations/20261004001100_variants_and_coupons.sql](../../supabase/migrations/20261004001100_variants_and_coupons.sql), [src/routes/provider/Coupons.tsx](../../src/routes/provider/Coupons.tsx), [src/store/cart.ts](../../src/store/cart.ts), [supabase/migrations/20261018000300_paystack_direct.sql](../../supabase/migrations/20261018000300_paystack_direct.sql), [supabase/functions/_shared/payments.ts](../../supabase/functions/_shared/payments.ts), [src/lib/__tests__/payments.test.ts](../../src/lib/__tests__/payments.test.ts).

Remaining: Orders can be paid by card at checkout through Paystack: when Paystack confirms, the money is credited and the order placed in one transaction through the same place_order and price check; if the order can no longer be placed the money stays in the wallet and the customer is told why. The card option appears only when Paystack is configured. Delivery is still a flat fee per seller, not priced by distance. Needs Paystack test keys and APP_URL to exercise.

Acceptance: Change cart quantities, apply valid/expired/limited coupons, manage/select private saved addresses, obtain a server quote and place multi-seller orders without overspending.

Verification: Database rules executed on plain Postgres 17 on 21 October 2026 (supabase/checks/business_rules.sql section 42); migrations applied and functions deployed to the hosted project the same day. Not yet exercised against Paystack test mode.

## F10 · Order Tracking

PRD feature begins on page 7.

| ID | Requirement | Status |
|---|---|---|
| F10-C01 | Live order status | implemented |
| F10-C02 | Rider location tracking | implemented |
| F10-C03 | Delivery updates | implemented |
| F10-C04 | Estimated arrival time | implemented |
| F10-I01 | Connected with Logistics System | implemented |
| F10-I02 | Linked with Push Notifications | implemented |
| F10-I03 | Integrated with Customer Dashboard | implemented |

Evidence / relevant current code: [src/routes/commerce/TrackDelivery.tsx](../../src/routes/commerce/TrackDelivery.tsx), [src/routes/commerce/OrderReturn.tsx](../../src/routes/commerce/OrderReturn.tsx), [src/lib/api/commerce.ts](../../src/lib/api/commerce.ts), [src/components/ui/TrackMap.tsx](../../src/components/ui/TrackMap.tsx), [supabase/migrations/20261004001200_logistics.sql](../../supabase/migrations/20261004001200_logistics.sql).

Remaining: The tracking page shows delivery progress, the rider and their position on a map while they carry the order, an estimated arrival, and the customer's delivery code; it refreshes every 10 seconds. Delivery updates are sent as notifications and pushed where push is on; push delivery itself is unconfigured and untested on devices.

Acceptance: Watch status and rider location change without reloading, receive updates, and see a measured ETA with unavailable/stale-location handling.

Verification: Database rules executed on plain Postgres 17 on 4 October 2026 (supabase/checks/business_rules.sql section 32). Deployed integration and user-journey acceptance are still pending.

## F11 · Returns & Refunds

PRD feature begins on page 8.

| ID | Requirement | Status |
|---|---|---|
| F11-C01 | Refund request form | implemented |
| F11-C02 | Return approvals | implemented |
| F11-C03 | Refund processing | implemented |
| F11-C04 | Evidence upload | implemented |
| F11-I01 | Connected with Dispute Resolution | implemented |
| F11-I02 | Linked with Payment System | implemented |
| F11-I03 | Integrated with Admin Moderation | implemented |

Evidence / relevant current code: [src/routes/commerce/OrderReturn.tsx](../../src/routes/commerce/OrderReturn.tsx), [src/routes/admin/Admin.tsx](../../src/routes/admin/Admin.tsx), [supabase/migrations/20260925000100_financial_integrity.sql](../../supabase/migrations/20260925000100_financial_integrity.sql).

Remaining: Manual dispute approval and wallet refunds implemented. Hosted seller-recovery, repeat settlement and physical-return operational acceptance remain.

Acceptance: Submit evidence, approve/dismiss a return, refund before and after settlement, and prove no duplicate payout/refund or negative consumed escrow.

Verification: Pending deployed integration and user-journey acceptance.

## F12 · RFQ System

PRD feature begins on page 8.

| ID | Requirement | Status |
|---|---|---|
| F12-C01 | RFQ submission | implemented |
| F12-C02 | Supplier bidding | implemented |
| F12-C03 | Quote comparison | implemented |
| F12-C04 | Approval workflow | implemented |
| F12-I01 | Linked with Supplier Verification | implemented |
| F12-I02 | Integrated with Escrow Payments | implemented |
| F12-I03 | Connected with Invoice Management | implemented |

Evidence / relevant current code: [src/lib/api/rfqs.ts](../../src/lib/api/rfqs.ts), [src/routes/wholesale/RFQDetail.tsx](../../src/routes/wholesale/RFQDetail.tsx), [supabase/migrations/20261004001500_wholesale_procurement.sql](../../supabase/migrations/20261004001500_wholesale_procurement.sql), [src/routes/wholesale/NewRFQ.tsx](../../src/routes/wholesale/NewRFQ.tsx), [src/routes/procurement/PurchaseOrderDetail.tsx](../../src/routes/procurement/PurchaseOrderDetail.tsx).

Remaining: Quotes are compared lowest first with each supplier's verification tier and trust score. Accepting one raises a purchase order: paid into escrow at once, or held for an owner or approver when an organisation's buyer goes over its limit. A request can be limited to ID-verified suppliers or verified businesses. The supplier marks delivery, the buyer confirms to pay or puts the payment on hold for staff to decide, and silence pays the supplier after 14 days. An invoice is issued with the escrow payment. Quotes are one price for the whole request, not per line; there is no counter-offer, part delivery or part payment.

Acceptance: Compare supplier offers, authorize approval, create a purchase obligation/invoice, fund escrow and track fulfilment.

Verification: Database rules executed on plain Postgres 17 on 4 October 2026 (supabase/checks/business_rules.sql section 35, including fee reconciliation). Deployed integration and user-journey acceptance are still pending.

## F13 · Corporate Procurement Dashboard

PRD feature begins on page 9.

| ID | Requirement | Status |
|---|---|---|
| F13-C01 | Procurement tracking | implemented |
| F13-C02 | Supplier management | implemented |
| F13-C03 | Bulk ordering | implemented |
| F13-C04 | Invoice history | implemented |
| F13-I01 | Connected with Payment System | implemented |
| F13-I02 | Integrated with Analytics Dashboard | implemented |
| F13-I03 | Linked with Inventory System | implemented |

Evidence / relevant current code: [src/lib/api/rfqs.ts](../../src/lib/api/rfqs.ts), [supabase/migrations/20261004001500_wholesale_procurement.sql](../../supabase/migrations/20261004001500_wholesale_procurement.sql), [src/routes/procurement/Procurement.tsx](../../src/routes/procurement/Procurement.tsx), [src/routes/procurement/InvoicePage.tsx](../../src/routes/procurement/InvoicePage.tsx), [src/lib/api/procurement.ts](../../src/lib/api/procurement.ts), [supabase/migrations/20261018000100_buyer_stock.sql](../../supabase/migrations/20261018000100_buyer_stock.sql), [src/routes/procurement/Stock.tsx](../../src/routes/procurement/Stock.tsx).

Remaining: An organisation has an owner, approvers and buyers, an approval limit, and a list of approved and blocked suppliers. Its dashboard shows what was paid, what is in escrow, what awaits approval, spend by month and by supplier, and every purchase order with its printable invoice. Requests can carry up to 50 lines. Purchases are paid from the owner's wallet; the organisation has no wallet or bank account of its own. Invoices are reached through their purchase orders: there is no separate invoice list, export or tax handling. Both sides keep stock: a supplier can take delivered goods out of their shop stock, and the buyer receives a delivered purchase order into its own stock records once, records use, and corrects by count, with every change kept and approvers told when an item falls to its reorder level (which links to a prefilled request for quotes). Platform-wide reports do not break out wholesale.

Acceptance: A procurement team places and approves a bulk purchase, tracks supplier fulfilment/payment and retrieves historical invoices with correct access.

Verification: Database rules executed on plain Postgres 17 on 21 October 2026 (supabase/checks/business_rules.sql section 40); migrations applied and functions deployed to the hosted project the same day. Walked in a browser on the hosted project on 21 October 2026 (add, count, use, running low).

## F14 · Local Marketplace Listings

PRD feature begins on page 9.

| ID | Requirement | Status |
|---|---|---|
| F14-C01 | Nearby listings | implemented |
| F14-C02 | Geo-location search | implemented |
| F14-C03 | Rental listings | implemented |
| F14-C04 | Used goods listings | implemented |
| F14-I01 | Connected with Maps API | implemented |
| F14-I02 | Integrated with Chat System | implemented |
| F14-I03 | Linked with Safety Monitoring | implemented |

Evidence / relevant current code: [src/lib/api/classifieds.ts](../../src/lib/api/classifieds.ts), [src/routes/classifieds/Classifieds.tsx](../../src/routes/classifieds/Classifieds.tsx), [supabase/migrations/20261004001400_classifieds_geo_and_safety.sql](../../supabase/migrations/20261004001400_classifieds_geo_and_safety.sql), [src/components/ui/TrackMap.tsx](../../src/components/ui/TrackMap.tsx).

Remaining: A listing is placed in a listed area and can be found by distance from the pinned location or the device's position, within 5 to 50 km, as a list or on a map. The map is OpenStreetMap, not Google. A listing sits at its area's centre, never the seller's address, so distances are to the area, not the item. Listings posted without an area are not found by distance. New listings are scanned for copied text, off-platform payment requests and price outliers.

Acceptance: Create rental and used-goods listings, find only those within a chosen radius, view maps, message/report sellers and manage listing lifecycle.

Verification: Database rules executed on plain Postgres 17 on 4 October 2026 (supabase/checks/business_rules.sql section 34). Deployed integration and on-device acceptance are still pending.

## F15 · Meet-Up Safety Tools

PRD feature begins on page 10.

| ID | Requirement | Status |
|---|---|---|
| F15-C01 | SOS alerts | implemented |
| F15-C02 | Live location sharing | implemented |
| F15-C03 | User verification badges | implemented |
| F15-C04 | Safety reporting | implemented |
| F15-I01 | Connected with Security Module | implemented |
| F15-I02 | Linked with Admin Monitoring | implemented |
| F15-I03 | Integrated with Trust Score System | implemented |

Evidence / relevant current code: [src/components/ui/ReportButton.tsx](../../src/components/ui/ReportButton.tsx), [src/routes/classifieds/ClassifiedDetail.tsx](../../src/routes/classifieds/ClassifiedDetail.tsx), [src/components/ui/TrustBadge.tsx](../../src/components/ui/TrustBadge.tsx), [supabase/migrations/20261004001400_classifieds_geo_and_safety.sql](../../supabase/migrations/20261004001400_classifieds_geo_and_safety.sql), [src/routes/safety/MeetupDetail.tsx](../../src/routes/safety/MeetupDetail.tsx), [src/routes/safety/SosButton.tsx](../../src/routes/safety/SosButton.tsx), [src/lib/safety.ts](../../src/lib/safety.ts).

Remaining: A buyer proposes a time and public place for a listing and the seller confirms. Either person can share their location with the other for a set time (5 minutes to 3 hours); it stops by itself and when the meet-up ends. SOS alerts FindWork staff with the person's position and who they were meeting, and works even for a suspended account; it does not contact the police, and says so beside the emergency numbers. Up to three trusted contacts can be called or texted in one tap through the phone's own apps; FindWork sends them nothing itself. Location sharing stops when the browser is closed. Staff response to an SOS has no on-call process behind it yet.

Acceptance: Share/revoke a meetup location, expire access, trigger an SOS to authorized recipients and review an abuse report without exposing other users’ locations.

Verification: Database rules executed on plain Postgres 17 on 4 October 2026 (supabase/checks/business_rules.sql section 34). Deployed integration and on-device acceptance are still pending.

## F16 · AI Job Matching

PRD feature begins on page 10.

| ID | Requirement | Status |
|---|---|---|
| F16-C01 | Skill analysis | implemented |
| F16-C02 | Location analysis | implemented |
| F16-C03 | Budget matching | implemented |
| F16-C04 | Availability matching | implemented |
| F16-I01 | Connected with Services Marketplace | implemented |
| F16-I02 | Linked with User Profiles | implemented |
| F16-I03 | Integrated with Recommendation Engine | implemented |

Evidence / relevant current code: [src/lib/api/providers.ts](../../src/lib/api/providers.ts), [supabase/migrations/20261004001800_matching_and_analytics.sql](../../supabase/migrations/20261004001800_matching_and_analytics.sql), [src/lib/api/matching.ts](../../src/lib/api/matching.ts), [src/routes/hiring/JobQuotes.tsx](../../src/routes/hiring/JobQuotes.tsx), [src/routes/provider/OpenJobs.tsx](../../src/routes/provider/OpenJobs.tsx), [supabase/migrations/20261018000200_calendar_matching.sql](../../supabase/migrations/20261018000200_calendar_matching.sql).

Remaining: A job is scored against each provider out of 100: trade 40, distance 25, budget 15, availability 10, reputation 10, and every match shows where its points came from. Customers see the best-fitting providers for a job and can invite them to quote; providers see open jobs best fit first. This is a fixed rule, not a learned model: it has not been tuned or evaluated against real outcomes, and the weights are a first proposal. Availability reads the provider's calendar: a job can name the day it is needed by, and the points come from working days with room (less than six hours booked) before then, or in the coming week when no day is given; each match names the days. Trade is matched on the category or a mention of it, not on an analysis of the description.

Acceptance: Rank real providers by skills, location, budget and availability; explain recommendations and evaluate quality against fixed fixtures.

Verification: Database rules executed on plain Postgres 17 on 21 October 2026 (supabase/checks/business_rules.sql section 41); migrations applied and functions deployed to the hosted project the same day. Seen live on the hosted project on 21 October 2026.

## F17 · AI Fraud Detection

PRD feature begins on page 11.

| ID | Requirement | Status |
|---|---|---|
| F17-C01 | Device tracking | implemented |
| F17-C02 | Suspicious behavior analysis | implemented |
| F17-C03 | Transaction monitoring | implemented |
| F17-C04 | Fake listing detection | implemented |
| F17-I01 | Connected with Security Module | implemented |
| F17-I02 | Linked with Payments System | implemented |
| F17-I03 | Integrated with Admin Dashboard | implemented |

Evidence / relevant current code: [src/lib/api/admin.ts](../../src/lib/api/admin.ts), [supabase/migrations/20261004000700_staff_roles_and_suspension.sql](../../supabase/migrations/20261004000700_staff_roles_and_suspension.sql), [supabase/migrations/20261004000900_risk_and_trust.sql](../../supabase/migrations/20261004000900_risk_and_trust.sql), [src/routes/admin/RiskTab.tsx](../../src/routes/admin/RiskTab.tsx).

Remaining: These are fixed, explainable rules, not a trained model: new or shared devices, top-up-then-withdraw, rapid or large money movements, repeat refunds, copied listings, listings that take the deal off the platform, price outliers, message bursts and repeated reports or disputes. Each raises an alert for a person to review; none acts on its own. Thresholds are first guesses and need tuning against real activity. No machine-learning or AI scoring, and no device fingerprint beyond a browser-held id and IP address.

Acceptance: Capture consent-appropriate risk signals, flag seeded fraud cases, explain decisions and support human review/appeal without silently moving money.

Verification: Database rules executed on plain Postgres 17 on 4 October 2026 (supabase/checks/business_rules.sql sections 27 and 29). Deployed integration and user-journey acceptance are still pending.

## F18 · AI Voice Assistant

PRD feature begins on page 11.

| ID | Requirement | Status |
|---|---|---|
| F18-C01 | Voice onboarding | implemented |
| F18-C02 | Voice navigation | implemented |
| F18-C03 | Multilingual support | implemented |
| F18-C04 | Speech recognition | implemented |
| F18-I01 | Connected with User Onboarding | implemented |
| F18-I02 | Integrated with Customer Support | implemented |
| F18-I03 | Linked with AI Translation System | implemented |

Evidence / relevant current code: [src/App.tsx](../../src/App.tsx), [src/lib/voice.ts](../../src/lib/voice.ts), [src/components/ui/VoiceAssistant.tsx](../../src/components/ui/VoiceAssistant.tsx), [supabase/functions/assistant/index.ts](../../supabase/functions/assistant/index.ts), [supabase/functions/assistant/prompts.ts](../../supabase/functions/assistant/prompts.ts), [src/components/ui/AskAssistant.tsx](../../src/components/ui/AskAssistant.tsx), [supabase/migrations/20261004001900_assistant_usage.sql](../../supabase/migrations/20261004001900_assistant_usage.sql), [src/lib/i18n.ts](../../src/lib/i18n.ts), [src/lib/I18nProvider.tsx](../../src/lib/I18nProvider.tsx), [src/locales/yo.json](../../src/locales/yo.json), [src/locales/ig.json](../../src/locales/ig.json), [src/locales/ha.json](../../src/locales/ha.json), [src/locales/pcm.json](../../src/locales/pcm.json), [scripts/i18n-check.mjs](../../scripts/i18n-check.mjs).

Remaining: A microphone button on Home takes a spoken or typed request and opens the right screen; a new account can choose its role by voice. Common requests in English and Pidgin are understood on the device with no service at all. Everything else, and Yoruba, Igbo and Hausa, goes to the assistant function, which calls Claude. The same function answers support questions from FindWork's own rules, translates chat messages, and helps with lessons. On 4 October 2026 it was deployed with an API key and answered live requests: a Yoruba command, a Pidgin command, a support question and a translation into Hausa. Lesson help and staff dispute summaries have not been run live, and no native speaker has reviewed the Yoruba, Igbo or Hausa. Speech uses the browser's own engines: it is absent in Firefox, and whether a browser can hear Yoruba, Igbo or Hausa has not been tested. The app's own text is now translated: 776 sentences across the everyday screens (navigation, onboarding, home, booking, wallet, shop, checkout, chat, settings, help, the provider and rider screens, and every error message) in Pidgin, Yoruba, Igbo and Hausa, chosen on the Welcome screen or in Preferences; untranslated text (the staff console, some secondary screens) shows in English. The translations were written by the developers and need a native speaker's review. Lesson help ran live on 21 October 2026.

Acceptance: Complete onboarding/navigation in agreed languages by voice and text, handle failed recognition, request confirmation for consequential actions and hand off to support.

Verification: Command parsing, prompts and answer handling are unit tested; metering executed on plain Postgres 17 on 4 October 2026 (supabase/checks/business_rules.sql section 39). Four live requests succeeded on the hosted project the same day. Speech has not been tried on devices.

## F19 · Wallet System

PRD feature begins on page 12.

| ID | Requirement | Status |
|---|---|---|
| F19-C01 | Wallet balance | implemented |
| F19-C02 | Fund transfers | implemented |
| F19-C03 | Deposits | implemented |
| F19-C04 | Withdrawals | implemented |
| F19-C05 | Transaction history | implemented |
| F19-I01 | Connected with Escrow System | implemented |
| F19-I02 | Linked with Marketplace Transactions | implemented |
| F19-I03 | Integrated with Payment Gateways | implemented |

Evidence / relevant current code: [src/lib/api/wallet.ts](../../src/lib/api/wallet.ts), [supabase/functions/paystack-webhook/index.ts](../../supabase/functions/paystack-webhook/index.ts), [supabase/migrations/20261004001000_transfers_and_milestones.sql](../../supabase/migrations/20261004001000_transfers_and_milestones.sql), [src/routes/money/Transfer.tsx](../../src/routes/money/Transfer.tsx), [supabase/functions/paystack-payout/index.ts](../../supabase/functions/paystack-payout/index.ts), [supabase/functions/payout-account/index.ts](../../supabase/functions/payout-account/index.ts).

Remaining: Bank accounts are confirmed with Paystack (the bank's own name for the account) and saved with a transfer recipient. Withdrawals to a confirmed account are sent automatically by Paystack Transfers up to a limit finance staff set; larger ones, those to unconfirmed accounts and those from accounts with an open high-risk alert wait for staff. Failed or reversed transfers return to staff; a transfer with no answer can be taken back only after an hour. Needs a live Paystack account with Transfers enabled and transfer OTP off; reconciliation against Paystack statements is still manual.

Acceptance: Deposit with callback/replay protection, transfer to a confirmed recipient once, withdraw with failure recovery, and reconcile balances/history.

Verification: Database rules executed on plain Postgres 17 on 21 October 2026 (supabase/checks/business_rules.sql section 42); migrations applied and functions deployed to the hosted project the same day. Not yet exercised against Paystack.

## F20 · Escrow Payments

PRD feature begins on page 13.

| ID | Requirement | Status |
|---|---|---|
| F20-C01 | Escrow holding | implemented |
| F20-C02 | Release approval | implemented |
| F20-C03 | Refund management | implemented |
| F20-C04 | Transaction protection | implemented |
| F20-I01 | Connected with Dispute Resolution | implemented |
| F20-I02 | Linked with Order Completion | implemented |
| F20-I03 | Integrated with Trust System | implemented |

Evidence / relevant current code: [supabase/migrations/20260925000100_financial_integrity.sql](../../supabase/migrations/20260925000100_financial_integrity.sql), [supabase/migrations/20260918100100_booking_lifecycle.sql](../../supabase/migrations/20260918100100_booking_lifecycle.sql), [supabase/migrations/20261004000900_risk_and_trust.sql](../../supabase/migrations/20261004000900_risk_and_trust.sql), [supabase/migrations/20261004001000_transfers_and_milestones.sql](../../supabase/migrations/20261004001000_transfers_and_milestones.sql), [src/components/ui/BookingMilestones.tsx](../../src/components/ui/BookingMilestones.tsx).

Remaining: Bookings, seller orders and wholesale purchase orders are all held in escrow. A quoted job can be paid in two to six stages: the full price is held at acceptance, the customer releases each stage in order, and cancelling refunds only what was not released. A seller with an open high-risk alert is not paid automatically. Hosted concurrency acceptance remains.

Acceptance: Hold/release/refund funds for each transaction family; lock disputes; reject concurrent/repeated settlement and reconcile customer, seller and fees.

Verification: Database rules executed on plain Postgres 17 on 4 October 2026 (supabase/checks/business_rules.sql sections 29 and 30, including reconciliation of reported fees after staged releases). Deployed integration and user-journey acceptance are still pending.

## F21 · Subscription Billing

PRD feature begins on page 13.

| ID | Requirement | Status |
|---|---|---|
| F21-C01 | Subscription plans | implemented |
| F21-C02 | Auto-renewals | implemented |
| F21-C03 | Billing history | implemented |
| F21-C04 | Payment reminders | implemented |
| F21-I01 | Connected with Vendor Services | implemented |
| F21-I02 | Linked with Premium Features | implemented |
| F21-I03 | Integrated with Payment Providers | implemented |

Evidence / relevant current code: [src/lib/api/billing.ts](../../src/lib/api/billing.ts), [supabase/migrations/20260925000300_subscription_serialisation.sql](../../supabase/migrations/20260925000300_subscription_serialisation.sql), [supabase/migrations/20261004000300_subscription_reminders.sql](../../supabase/migrations/20261004000300_subscription_reminders.sql), [supabase/functions/paystack-charge/index.ts](../../supabase/functions/paystack-charge/index.ts).

Remaining: Plans can be paid by card, and the card kept (with consent) to renew them: each renewal charges the saved card through Paystack, falls back to the wallet if it is declined, and moves the plan to Free only if neither covers it. Reminders say which will be charged. On the iPhone app, plans are not sold (Apple requires in-app purchase for digital subscriptions); this needs a decision. Needs Paystack keys and the paystack_charge settings rows.

Acceptance: Subscribe/change plan once, send a reminder before renewal, renew or downgrade on insufficient funds and verify billing history/actual entitlements.

Verification: Database rules executed on plain Postgres 17 on 21 October 2026 (supabase/checks/business_rules.sql section 42); migrations applied and functions deployed to the hosted project the same day.

## F22 · Rider Management

PRD feature begins on page 14.

| ID | Requirement | Status |
|---|---|---|
| F22-C01 | Rider onboarding | implemented |
| F22-C02 | Delivery assignments | implemented |
| F22-C03 | Availability status | implemented |
| F22-C04 | Earnings dashboard | implemented |
| F22-I01 | Connected with Delivery Tracking | implemented |
| F22-I02 | Linked with Order Management | implemented |
| F22-I03 | Integrated with Maps System | implemented |

Evidence / relevant current code: [src/routes/commerce/TrackDelivery.tsx](../../src/routes/commerce/TrackDelivery.tsx), [supabase/migrations/20261004001200_logistics.sql](../../supabase/migrations/20261004001200_logistics.sql), [src/routes/rider/Rider.tsx](../../src/routes/rider/Rider.tsx), [src/routes/admin/LogisticsTab.tsx](../../src/routes/admin/LogisticsTab.tsx), [src/lib/api/logistics.ts](../../src/lib/api/logistics.ts).

Remaining: Riders apply, staff approve them, and an approved rider goes online, takes or is assigned deliveries, reports their position, hands over against the customer's delivery code and is paid 80% of the delivery fee into their wallet. A delivery is created when an order is dispatched. Rider ID is checked by staff at approval, not enforced by the database. The 80% share is a first proposal. No rider ratings, shifts, zones, batching rules or cash-on-delivery; riders work in the browser, not a native app, so location stops when the screen is closed.

Acceptance: Onboard a rider, accept an assignment, update availability and location, prove delivery and reconcile rider earnings.

Verification: Database rules executed on plain Postgres 17 on 4 October 2026 (supabase/checks/business_rules.sql section 32). Deployed integration, real devices and user-journey acceptance are still pending.

## F23 · Route Optimization

PRD feature begins on page 14.

| ID | Requirement | Status |
|---|---|---|
| F23-C01 | Smart routing | implemented |
| F23-C02 | Traffic monitoring | implemented |
| F23-C03 | Estimated arrival calculation | implemented |
| F23-I01 | Connected with Google Maps | implemented |
| F23-I02 | Linked with Delivery Tracking | implemented |
| F23-I03 | Integrated with AI Systems | implemented |

Evidence / relevant current code: [src/lib/geocoding.ts](../../src/lib/geocoding.ts), [src/lib/routing.ts](../../src/lib/routing.ts), [supabase/functions/route-estimate/index.ts](../../supabase/functions/route-estimate/index.ts), [supabase/migrations/20261004001200_logistics.sql](../../supabase/migrations/20261004001200_logistics.sql), [supabase/functions/route-plan/index.ts](../../supabase/functions/route-plan/index.ts), [supabase/functions/route-plan/routePlan.ts](../../supabase/functions/route-plan/routePlan.ts), [supabase/functions/_shared/routeSolver.ts](../../supabase/functions/_shared/routeSolver.ts), [src/lib/__tests__/route-plan.test.ts](../../src/lib/__tests__/route-plan.test.ts).

Remaining: A rider's round is ordered exactly: every valid order of their stops is weighed (dynamic programming over subsets), with each parcel collected before it is delivered. With a Google Maps key the travel times are Google's Route Matrix on real roads in current traffic (route-plan), and each stop shows the minutes to it; without one the same solver runs on distance. Single-delivery arrival times use the Routes API (route-estimate). Needs GOOGLE_MAPS_API_KEY with the Routes API enabled; not yet run against Google. The optimiser is exact search, not a learned model.

Acceptance: Route assigned deliveries using traffic-aware travel time, refresh ETA, handle provider failures and prevent exposure outside the active delivery.

Verification: Solver checked against brute force in unit tests on 21 October 2026; functions deployed to the hosted project the same day.

## F24 · Stories & Reels

PRD feature begins on page 15.

| ID | Requirement | Status |
|---|---|---|
| F24-C01 | Short video uploads | implemented |
| F24-C02 | Stories posting | implemented |
| F24-C03 | Engagement tracking | implemented |
| F24-I01 | Connected with Vendor Stores | implemented |
| F24-I02 | Linked with Social Feed | implemented |
| F24-I03 | Integrated with Product Listings | implemented |

Evidence / relevant current code: [src/App.tsx](../../src/App.tsx), [supabase/migrations/20261004001700_social_commerce.sql](../../supabase/migrations/20261004001700_social_commerce.sql), [src/routes/social/Feed.tsx](../../src/routes/social/Feed.tsx), [src/lib/api/social.ts](../../src/lib/api/social.ts).

Remaining: Sellers post stories (a photo or video, gone after a day) and reels (video that stays), optionally tagged with one of their products. A feed shows them newest first; each links to the seller's store and the tagged product, and appears on the store page. Unique views and likes are counted per post. Posts can be reported and removed by moderators. Videos are stored and played as uploaded: no transcoding, thumbnails, captions or music. There are no comments, shares, follows-only feed or ranking, and uploads are capped at 50 MB.

Acceptance: Publish/view/report short videos and expiring stories, track engagement and follow real store/product links.

Verification: Database rules executed on plain Postgres 17 on 4 October 2026 (supabase/checks/business_rules.sql section 37). Upload and playback have not been tried against hosted storage or on phones.

## F25 · Livestream Selling

PRD feature begins on page 15.

| ID | Requirement | Status |
|---|---|---|
| F25-C01 | Live streaming | implemented |
| F25-C02 | Live chat | implemented |
| F25-C03 | Product tagging | implemented |
| F25-C04 | Purchase links | implemented |
| F25-I01 | Connected with E-commerce Module | implemented |
| F25-I02 | Linked with Wallet System | implemented |
| F25-I03 | Integrated with Notification System | implemented |

Evidence / relevant current code: [src/App.tsx](../../src/App.tsx), [supabase/migrations/20261004001700_social_commerce.sql](../../supabase/migrations/20261004001700_social_commerce.sql), [src/routes/social/Live.tsx](../../src/routes/social/Live.tsx), [src/lib/stream.ts](../../src/lib/stream.ts), [supabase/migrations/20261018000500_live_video.sql](../../supabase/migrations/20261018000500_live_video.sql), [supabase/functions/livekit-token/index.ts](../../supabase/functions/livekit-token/index.ts), [src/components/ui/LiveVideo.tsx](../../src/components/ui/LiveVideo.tsx).

Remaining: FindWork provides the selling room around a stream: a paced live chat the seller can moderate, the products on sale with one pinned on screen, add-to-cart and wallet checkout, a viewer count, and a notification to everyone who saved the seller when they go live. FindWork now carries the video through LiveKit: the seller broadcasts from the phone camera (switch camera, mute) and viewers watch in the room beside the chat and products; only the seller may publish, and viewers may join only while the stream is live. A pasted link remains the other choice. Needs LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET; not yet run against LiveKit. Chat refreshes every three seconds rather than instantly.

Acceptance: Start/join/end a stream, moderate chat, tag available products and complete checkout; handle ended streams and restricted hosts.

Verification: Database rules executed on plain Postgres 17 on 21 October 2026 (supabase/checks/business_rules.sql section 44); migrations applied and functions deployed to the hosted project the same day.

## F26 · Online Courses

PRD feature begins on page 16.

| ID | Requirement | Status |
|---|---|---|
| F26-C01 | Video lessons | implemented |
| F26-C02 | Course enrollment | implemented |
| F26-C03 | Progress tracking | implemented |
| F26-C04 | Quizzes | implemented |
| F26-I01 | Connected with User Profiles | implemented |
| F26-I02 | Linked with Certification System | implemented |
| F26-I03 | Integrated with AI Learning Assistant | implemented |

Evidence / relevant current code: [src/routes/learning/CourseDetail.tsx](../../src/routes/learning/CourseDetail.tsx), [src/lib/api/learning.ts](../../src/lib/api/learning.ts), [supabase/migrations/20261004001600_learning_and_internships.sql](../../supabase/migrations/20261004001600_learning_and_internships.sql), [src/routes/admin/CourseEditor.tsx](../../src/routes/admin/CourseEditor.tsx), [src/routes/learning/CertificatePage.tsx](../../src/routes/learning/CertificatePage.tsx), [src/components/ui/AskAssistant.tsx](../../src/components/ui/AskAssistant.tsx), [supabase/functions/assistant/prompts.ts](../../supabase/functions/assistant/prompts.ts), [supabase/migrations/20261018000700_course_content.sql](../../supabase/migrations/20261018000700_course_content.sql).

Remaining: Content staff can now write courses: lessons with text, an uploaded video or a link to one, and a quiz with a pass mark. Lesson material and quiz answers are readable only as intended (the enrolled; never the answers). A lesson with nothing in it cannot be completed. Passing the quiz, or finishing a course that has none, issues a certificate with a code anyone can verify without an account, shown on the holder's profile. The three starter courses now have their ten lessons and an eight-question quiz each, to be checked by someone who practises each trade; the plumbing certificate is described as FindWork's own, not an accreditation. No AI learning assistant, no instructor accounts outside staff, no video transcoding or captions.

Acceptance: Enroll without duplicate charge, consume real text/video lessons, pass server-validated quizzes, issue/verify a certificate and use grounded learning help.

Verification: Database rules executed on plain Postgres 17 on 4 October 2026 (supabase/checks/business_rules.sql sections 7 and 36). Video upload and playback have not been tried against hosted storage.

## F27 · Internship Matching

PRD feature begins on page 16.

| ID | Requirement | Status |
|---|---|---|
| F27-C01 | Internship listings | implemented |
| F27-C02 | Application management | implemented |
| F27-C03 | Skill matching | implemented |
| F27-I01 | Connected with AI Job Matching | implemented |
| F27-I02 | Linked with User Profiles | implemented |
| F27-I03 | Integrated with Notifications | implemented |

Evidence / relevant current code: [src/routes/learning/CourseDetail.tsx](../../src/routes/learning/CourseDetail.tsx), [src/lib/api/learning.ts](../../src/lib/api/learning.ts), [supabase/migrations/20261004001600_learning_and_internships.sql](../../supabase/migrations/20261004001600_learning_and_internships.sql), [src/routes/internships/Internships.tsx](../../src/routes/internships/Internships.tsx), [src/lib/api/internships.ts](../../src/lib/api/internships.ts).

Remaining: Internships are their own listings, posted by ID-verified accounts, with skills, stipend, length and a closing date. An applicant sends a note once; the employer sees applicants best match first and shortlists, accepts or declines; both are notified. The match is the share of the listed skills the person has (from their stated skills, certificates and trade) plus a little for being in the same area: a fixed rule, not a learned model. The old internship entries in the course catalogue are no longer shown. No interview scheduling or offer letters.

Acceptance: Publish an internship, match skills, submit an application, review/change its status and notify the applicant.

Verification: Database rules executed on plain Postgres 17 on 4 October 2026 (supabase/checks/business_rules.sql section 36). Deployed integration and user-journey acceptance are still pending.

## F28 · Trust Score System

PRD feature begins on page 17.

| ID | Requirement | Status |
|---|---|---|
| F28-C01 | User ratings | implemented |
| F28-C02 | Verification levels | implemented |
| F28-C03 | Transaction history | implemented |
| F28-C04 | Complaint history | implemented |
| F28-I01 | Connected with Marketplace Modules | implemented |
| F28-I02 | Linked with Dispute Resolution | implemented |
| F28-I03 | Integrated with Fraud Monitoring | implemented |

Evidence / relevant current code: [src/routes/chat/Trust.tsx](../../src/routes/chat/Trust.tsx), [src/lib/api/reviews.ts](../../src/lib/api/reviews.ts), [supabase/migrations/20261004000900_risk_and_trust.sql](../../supabase/migrations/20261004000900_risk_and_trust.sql), [src/components/ui/TrustBadge.tsx](../../src/components/ui/TrustBadge.tsx).

Remaining: A composite score out of 100 (verification 30, reputation 30, history 20, conduct 20) is stored per account, refreshed when its inputs change, shown on provider profiles and classifieds, and broken down for the owner. The weights are a first proposal and need agreeing; the score is not yet shown on products, chat or job quotes.

Acceptance: Explain a reproducible trust score from verified signals, transaction and complaint outcomes; prevent self-written scores and expose appropriate history.

Verification: Database rules executed on plain Postgres 17 on 4 October 2026 (supabase/checks/business_rules.sql section 29). Deployed integration and user-journey acceptance are still pending.

## F29 · Transaction Monitoring

PRD feature begins on page 17.

| ID | Requirement | Status |
|---|---|---|
| F29-C01 | Transaction scanning | implemented |
| F29-C02 | Risk analysis | implemented |
| F29-C03 | Alert generation | implemented |
| F29-I01 | Connected with Wallet System | implemented |
| F29-I02 | Linked with Fraud Detection | implemented |
| F29-I03 | Integrated with Admin Dashboard | implemented |

Evidence / relevant current code: [src/lib/api/wallet.ts](../../src/lib/api/wallet.ts), [src/lib/api/admin.ts](../../src/lib/api/admin.ts), [supabase/migrations/20261004000900_risk_and_trust.sql](../../supabase/migrations/20261004000900_risk_and_trust.sql), [src/routes/admin/RiskTab.tsx](../../src/routes/admin/RiskTab.tsx).

Remaining: Every ledger entry is scanned as it is written and rule matches go to the staff risk queue, where they are reviewed or dismissed with a note. Rule thresholds need tuning; there is no case management beyond the alert, and no regulatory reporting.

Acceptance: Scan known suspicious transactions, explain/triage alerts, restrict when authorized and preserve review history.

Verification: Database rules executed on plain Postgres 17 on 4 October 2026 (supabase/checks/business_rules.sql section 29). Deployed integration and user-journey acceptance are still pending.

## F30 · Dispute Management

PRD feature begins on page 18.

| ID | Requirement | Status |
|---|---|---|
| F30-C01 | Complaint submission | implemented |
| F30-C02 | Evidence uploads | implemented |
| F30-C03 | Refund requests | implemented |
| F30-C04 | Moderation tools | implemented |
| F30-I01 | Connected with Escrow System | implemented |
| F30-I02 | Linked with Admin Panel | implemented |
| F30-I03 | Integrated with AI Moderation | implemented |

Evidence / relevant current code: [src/lib/api/disputes.ts](../../src/lib/api/disputes.ts), [src/routes/admin/Admin.tsx](../../src/routes/admin/Admin.tsx), [supabase/migrations/20261004000500_dispute_responses.sql](../../supabase/migrations/20261004000500_dispute_responses.sql), [src/components/ui/DisputeConversation.tsx](../../src/components/ui/DisputeConversation.tsx), [supabase/functions/assistant/prompts.ts](../../supabase/functions/assistant/prompts.ts), [supabase/migrations/20261004001900_assistant_usage.sql](../../supabase/migrations/20261004001900_assistant_usage.sql).

Remaining: Both participants and moderators can respond on a case with explicitly shared photo evidence. Staff can ask for an AI summary of a case: what happened, what is agreed and contested, what is missing and what to ask. It is told not to recommend an outcome, and the decision stays with the member of staff; it needs the assistant function and an API key, and has not been run against the real API. Reports, listings and messages are also screened by fixed rules that raise alerts. Wholesale purchase orders use a simpler hold-and-decide path rather than full disputes.

Acceptance: Submit evidence, let both sides respond, review evidence as admin, freeze escrow, resolve once and audit decisions; AI triage must retain human settlement authority.

Verification: Database rules executed on plain Postgres 17 on 4 October 2026 (supabase/checks/business_rules.sql section 25). Deployed integration and user-journey acceptance are still pending.

## F31 · User Management

PRD feature begins on page 18.

| ID | Requirement | Status |
|---|---|---|
| F31-C01 | User monitoring | implemented |
| F31-C02 | Account suspension | implemented |
| F31-C03 | Verification approvals | implemented |
| F31-C04 | Role management | implemented |
| F31-I01 | Connected with All Platform Modules | implemented |
| F31-I02 | Linked with Analytics System | implemented |
| F31-I03 | Integrated with Fraud Monitoring | implemented |

Evidence / relevant current code: [src/lib/api/admin.ts](../../src/lib/api/admin.ts), [src/routes/admin/Admin.tsx](../../src/routes/admin/Admin.tsx), [supabase/migrations/20261004000700_staff_roles_and_suspension.sql](../../supabase/migrations/20261004000700_staff_roles_and_suspension.sql), [src/routes/admin/UsersTab.tsx](../../src/routes/admin/UsersTab.tsx), [src/components/system/Suspended.tsx](../../src/components/system/Suspended.tsx).

Remaining: Staff can look up an account, see its devices, security events, disputes, reports and alerts, suspend or reinstate it with a reason, and admins can assign staff roles (admin, moderator, finance, support) that limit which parts of the console and which operator functions each can use. Suspension blocks spending, new bookings, orders, quotes, listings and messages and hides the account's listings; the API hook that blocks every other write must be confirmed on the hosted project. No link to behaviour analytics yet.

Acceptance: Locate users, inspect activity, suspend across APIs and storage, manage permitted roles without escalation, review verification and audit actions.

Verification: Database rules executed on plain Postgres 17 on 4 October 2026 (supabase/checks/business_rules.sql section 27). Deployed integration and user-journey acceptance are still pending.

## F32 · Platform Analytics

PRD feature begins on page 19.

| ID | Requirement | Status |
|---|---|---|
| F32-C01 | Revenue reports | implemented |
| F32-C02 | User analytics | implemented |
| F32-C03 | Engagement tracking | implemented |
| F32-C04 | Financial dashboards | implemented |
| F32-I01 | Connected with All Transactions | implemented |
| F32-I02 | Linked with Marketplace Data | implemented |
| F32-I03 | Integrated with AI Predictive Analytics | implemented |

Evidence / relevant current code: [src/lib/api/admin.ts](../../src/lib/api/admin.ts), [supabase/migrations/20261004000600_operations_analytics.sql](../../supabase/migrations/20261004000600_operations_analytics.sql), [src/routes/admin/Analytics.tsx](../../src/routes/admin/Analytics.tsx), [src/lib/analytics.ts](../../src/lib/analytics.ts), [src/lib/api/analytics.ts](../../src/lib/api/analytics.ts), [supabase/migrations/20261004001800_matching_and_analytics.sql](../../supabase/migrations/20261004001800_matching_and_analytics.sql), [src/lib/forecast.ts](../../src/lib/forecast.ts), [supabase/functions/_shared/forecast.ts](../../supabase/functions/_shared/forecast.ts).

Remaining: Staff reports now cover income and obligations from the ledger; people by role, week-one return and verified share; visits, screens opened and the steps to booking and ordering; bookings by trade and area; top sellers, coupon discounts, wholesale and rider payouts; with CSV export of the daily figures. The next week is forecast by a seasonal model (additive Holt-Winters with a weekly season) fitted to the selected days, robust to one-off spikes, with an 80% range per day, a check on the last week against simply repeating the week before, and the days the model did not expect. Engagement only covers people who have not opted out, and only since tracking began. Delivery charges, gateway costs and taxes are outside the income figures.

Acceptance: Reconcile reports to ledger/bookings/orders with defined revenue and escrow semantics; filter/export accurate aggregates under admin authorization.

Verification: Database rules executed on plain Postgres 17 on 4 October 2026 (supabase/checks/business_rules.sql sections 26, 30, 35 and 38). Deployed integration and user-journey acceptance are still pending.

## F33 · Real-Time Analytics

PRD feature begins on page 19.

| ID | Requirement | Status |
|---|---|---|
| F33-C01 | Live dashboards | implemented |
| F33-C02 | User activity reports | implemented |
| F33-C03 | Revenue analytics | implemented |
| F33-C04 | Transaction monitoring | implemented |
| F33-I01 | Connected with Admin Panel | implemented |
| F33-I02 | Linked with Marketplace Systems | implemented |
| F33-I03 | Integrated with AI Analytics Engine | implemented |

Evidence / relevant current code: [src/App.tsx](../../src/App.tsx), [src/lib/api/admin.ts](../../src/lib/api/admin.ts), [supabase/migrations/20261004000600_operations_analytics.sql](../../supabase/migrations/20261004000600_operations_analytics.sql), [src/routes/admin/Analytics.tsx](../../src/routes/admin/Analytics.tsx), [src/lib/api/analytics.ts](../../src/lib/api/analytics.ts), [src/routes/admin/RiskTab.tsx](../../src/routes/admin/RiskTab.tsx), [supabase/functions/assistant/prompts.ts](../../supabase/functions/assistant/prompts.ts), [supabase/migrations/20261018000600_analyst_metering.sql](../../supabase/migrations/20261018000600_analyst_metering.sql).

Remaining: The staff report refreshes on its own (30 seconds for money, 60 for engagement) and shows when it was calculated; it polls rather than streams. Staff can look up one account's visits and screens over 30 days. Flagged transactions appear in the risk queue as they happen. Staff can ask an analyst (Claude) questions about the period or for a summary; it answers only from the same reports, forecasts and unusual days, read on the server with the asker's own permissions, and lists the figures it relied on and its caveats. Ran live on 21 October 2026; not yet evaluated systematically.

Acceptance: Capture activity, show time-filtered live metrics with freshness and access boundaries, and validate predictive outputs against historical data.

Verification: Database rules executed on plain Postgres 17 on 4 October 2026 (supabase/checks/business_rules.sql section 26). Deployed integration and user-journey acceptance are still pending.
