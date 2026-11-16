# Publishing FindWork: start here

Status on November 16, 2026: engineering preparation is in progress. No public release, signed native build or store approval is claimed. The owner has not yet supplied publisher, account or legal details.

## Owner setup, in order

1. Decide who publishes FindWork: your own legal identity or an existing registered business. Use truthful details matching your account verification. Do not invent a company or registration number.
2. Choose and register the production domain. The code currently uses `findwork.africa` and `www.findwork.africa`; ownership has not been verified. If choosing another domain, update native associated domains, Android intent filters, native.ts, store URLs and backend redirects together.
3. Create a monitored support email and privacy contact. Have the actual operator and legal reviewer complete `src/legal/documents.ts`, including retention and payment custody decisions. Only then set `DRAFT = false`.
4. Enroll in Apple Developer and create/verify a Google Play developer account using the publisher identity. Supply account access through invitations. Complete any testing requirement shown in Play Console. Keep passwords and signing keys out of chat and git.
5. Confirm production hosting and Supabase ownership. Configure production redirects/email delivery and all services included in launch. Validate payments and identity with the relevant partners before accepting real money.
6. Create Firebase apps and configure APNs if native push is included. Otherwise explicitly leave push out of the advertised launch scope.
7. Install the required native toolchains, configure distribution signing, create native builds and complete TestFlight/Play testing on actual devices. Complete privacy forms, screenshots and reviewer access before submission.

## Developer commands

- `npm run release:verify`: lint, tests, requirements, translations and production build. Works for preview preparation; does not certify publishing readiness.
- `npm run release:web`: checks backend public configuration and legal readiness before verification. Fails while legal documents remain drafts.
- `npm run release:check`: checks local native configuration and toolchains. Missing owner credentials deliberately remain failures.
- `npm run release:hosted -- https://your-domain`: read-only HTTP checks for deployed app routes, manifest and valid app-link associations. It does not execute browser journeys or verify backend behavior.
- `npm run cap:sync`: copies the current production web build into both native projects.
- `npm run android:bundle`: builds an Android release bundle after SDK/JDK/signing setup.

Detailed acceptance journeys are in `launch-checklist.md`. Store text and screenshot plan are in `store-listing.md`. Do not mark a checklist complete without evidence from the actual production environment or submitted binary.

## Changes prepared November 16

- Added a separate web publishing gate so a preview build cannot stand in for approved legal documents and a configured backend.
- Added a read-only deployed-host check with bounded request timeouts and no credential output.
- Restored cold-launch app links, covering payment returns received before JavaScript listeners are ready.
- Added Android support for the www host; disabled cleartext HTTP and Android app backup to reduce unintended exposure of persisted sessions.
- Added basic web response security headers and search description metadata.

Native behavior and deployment headers still require verification on signed devices and the deployed host respectively. Neither can be confirmed from unit tests alone.

## Verification recorded November 16, 2026

- `npm run release:verify`: passed, including 499 tests across 39 files, lint, requirements/translation checks and production build.
- `npx tsc -p tsconfig.test.json --noEmit`: passed.
- `npm audit --omit=dev --audit-level=high`: completed against npm; zero reported production dependency vulnerabilities.
- `npx cap sync`: passed for Android and iOS with the latest build.
- `git diff --check`: passed.
- `npm run release:web`: correctly refused publishing because legal approval and completed legal details are missing. Public backend configuration checks passed; this does not prove backend production acceptance.
- Hosted checker syntax and invalid-URL rejection verified. It has not been run against an owner-confirmed production domain.
- Native SDK/signing configuration remains incomplete. No signed native binary, physical-device test or store submission was performed.
- Vite still reports two chunks above 500 kB; production build succeeds. Measure startup on target devices before launch.
