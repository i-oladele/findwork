# FindWork release checklist

New publisher? Begin with [start-here.md](start-here.md). Use `npm run release:web` for the web publishing gate and `npm run release:hosted -- https://your-domain` for deployed HTTP checks.

Prepared November 13, 2026. Source changes are not proof of hosted deployment or store approval. Do not mark these checks complete without actual evidence.

## Local verification and build

```sh
npm run release:verify
npm run release:check
npm run cap:sync
```

`release:verify` runs lint, unit tests, requirements/translation checks and the web production build. `release:check` intentionally exits unsuccessfully while local release configuration is incomplete. It is not a substitute for signed-device acceptance.

### Android

Install Android Studio/Android SDK and use a Gradle-compatible JDK (JDK 21 is the recommended build choice for this project). The current wrapper is Gradle 8.14.3; the installed Java 26 should not be used for this wrapper.

Create an upload keystore through Android Studio's Generate Signed Bundle flow. Store it outside the repository, back it up securely and export these environment variables in your local shell or secret build environment:

- `FINDWORK_UPLOAD_STORE_FILE`: absolute path to the keystore
- `FINDWORK_UPLOAD_STORE_PASSWORD`: keystore password
- `FINDWORK_UPLOAD_KEY_ALIAS`: key alias
- `FINDWORK_UPLOAD_KEY_PASSWORD`: key password

```sh
npm run android:bundle
```

Expected output: `android/app/build/outputs/bundle/release/app-release.aab`. The build refuses an unsigned release. Upload it to Play testing, enable Play App Signing and put the **Play app-signing** certificate SHA-256 (not merely the upload certificate) into `public/.well-known/assetlinks.json`; redeploy the website. Verify links on an installed Play build.

### iOS

Install Xcode 26+ and select its developer directory. The current Mac has Xcode 16.4 and Command Line Tools selected. Resolve packages with the upgraded toolchain.

```sh
npm run cap:sync
npx cap open ios
```

Select the active Apple Developer team, configure automatic distribution signing, Push Notifications if offered, and Associated Domains (`applinks:findwork.africa`, `applinks:www.findwork.africa`, `webcredentials:findwork.africa`). Replace TEAMID in the website association file and deploy it. Add Firebase's `GoogleService-Info.plist` to the App target if push is offered. Check release entitlements, privacy manifests/required-reason APIs and upload validation. Archive for a generic iOS device, distribute to App Store Connect and test through TestFlight. Confirm version/build numbers before each upload.

## Database and production environment

- For another environment, apply `20261113000100_user_blocking.sql` after the preceding migrations; regenerate schema types if appropriate. Run `supabase/checks/business_rules.sql` and `supabase/checks/user_blocking.sql` on a seeded staging database, never production. Do not run production seed/demo scripts.
- Deploy the tested migration to production before shipping the new client. Blocking UI depends on the new table/RPC/trigger. Both the blocking migration and its preceding live-video allowance migration were applied to the linked hosted project on November 13, 2026. Confirm the intended production project is that same project before shipping.
- Verify the API suspension/MFA pre-request hook, RLS, private storage access, scheduled renewals/releases/purges/SOS/live-video jobs, pg_net and callback settings.
- Set public production APP_URL, Supabase auth site/redirect URLs, email SMTP and optional Termii OTP. Confirm actual delivery, recovery and deep links.
- Validate payment initialization, confirmation, signed webhooks, duplicate/delayed callbacks, refunds, withdrawals, limits and settlement reconciliation with the live partner.
- Verify Firebase/APNs delivery and notification taps, Dojah identity checks, LiveKit camera streaming and Maps routing for whichever features launch. Missing optional features must have an honest fallback and must not be advertised as active.
- Separate staging and production; remove demo staff credentials and artificial balances from production. Provision least-privilege staff accounts.
- Enable alerts for app/function/payment failures, review backups, perform a restore check and document rollback steps.

## Device acceptance

Record device/OS, build number, result and any issue for each journey:

- Fresh signup, OTP/email delivery, sign-in/out, restart, recovery, MFA/recovery and suspended-user refusal.
- Provider onboarding/listing, customer discovery/quote/booking, acceptance, completion, cancellation, escrow and dispute/refund.
- Seller inventory/order, multi-seller checkout, delivery/rider workflow and payout.
- Text/voice/photo messaging, report, block in both directions, unblock, social filtering and moderator response. Confirm existing transactions remain accessible after blocking.
- Courses remain browsable; free enrollment works; existing paid lessons/quizzes/certificates work. New paid enrollment/plan purchases are unavailable in both phone apps. Website purchases remain available.
- Permissions allowed/denied, interrupted network, duplicate taps, payment browser dismissal/return, push foreground/background/tap, camera/microphone/location and app links.
- Account deletion with an eligible account; refusal explanations for unresolved obligations; public `/delete-account` page and privacy/terms URLs reachable signed out.
- Small/large phones, keyboard, safe areas, Android back behavior, accessibility, uploads and a realistic startup/performance check.

## Store and operational sign-off

- Owner items in `owner-handoff.md` complete; legal documents approved, draft flag removed only after approval.
- App Store/Play listing screenshots and descriptions, public support/privacy/deletion URLs, content/age ratings, Apple privacy/export answers, Google Data safety/financial/permissions declarations complete.
- Reviewer accounts without real customer data and instructions for each role; no unavailable OTP or MFA dependency for reviewers.
- Review SDK privacy reports and permissions; enable Sign in with Apple if required by the chosen social login offering.
- Support, moderation, disputes, refunds, payouts, verification and SOS coverage staffed and tested.
- Complete TestFlight/Play acceptance and any required Google closed testing; submit signed builds and address review feedback.

Known external blockers: Apple subscription inactive, legal company details unavailable to developer, Google production eligibility unconfirmed. Do not represent these as completed engineering work.

## Verification recorded November 13, 2026

- `npm run release:verify`: passed; 496 tests across 38 test files, lint, requirements traceability, translation completeness and production web build.
- `npx tsc -p tsconfig.test.json --noEmit`: passed.
- All migrations, seeded business-rule suite and user-blocking suite: passed against an isolated Postgres 17 instance using the repository's Supabase stand-in. This does not verify hosted Auth, Storage, Realtime or provider delivery.
- `supabase db push --yes`: applied `20261101000300_live_video_allowance.sql` and `20261113000100_user_blocking.sql` to the linked project successfully.
- `npx cap sync`: completed for Android and iOS.
- Hosted secret metadata checked without reading values: payment, identity, SMS, live-video, Maps and native Firebase credentials are absent. Browser push and assistant keys are present.
- No signed native binary was produced and no physical-device acceptance was performed.
- Build-machine blockers: Xcode 16.4, Java 26 only, no Android Studio/SDK or JDK 21, and approximately 7.5 GiB disk space available at inspection. Free space before installing the required toolchains; do not remove user files automatically.
- Existing Vite warnings about chunks larger than 500 kB remain; the build succeeds.
