# Adding the keys

Everything else is in place on the hosted FindWork project
(`yletjxnmsytdmhtsyezd`). Each service below switches on as soon as its keys
are uploaded; until then the app says it is off and carries on without it.
Do them in any order, one at a time if you like. Use **test or sandbox** keys
first.

For each service:

1. Do the dashboard steps listed for it.
2. Paste its keys into the server section of `.env.local` (never with a
   `VITE_` prefix).
3. Run `npm run secrets:push`. It uploads only the filled server lines, never
   prints a value, and refuses anything that looks misplaced. Add `--dry-run`
   to see what it would send.
4. Try the check listed for it, then tell Claude which service is on.

Already filled in for you: `APP_URL` (the app on your Mac), the shared
Paystack secret, Dojah's sandbox address, the Termii sender ID and the SMS
countries. They go up with the first `npm run secrets:push`, and with them
the database is told where the Paystack functions are.

## Paystack (card payments and payouts)

- [dashboard.paystack.com](https://dashboard.paystack.com), in **Test mode**:
  Settings → API Keys & Webhooks.
  - Copy the **test secret key** (`sk_test_…`) into `PAYSTACK_SECRET_KEY`.
  - Set the **test webhook URL** to
    `https://yletjxnmsytdmhtsyezd.supabase.co/functions/v1/paystack-webhook`.
- For automatic payouts: enable Transfers, and turn off OTP for transfers
  (Settings → Preferences). Then a finance account switches automatic payouts
  on, with a limit, in `/admin` → Payouts.
- **Check:** Wallet → Add money with test card `4084 0840 8408 4081`, any
  future expiry, CVV `408`, OTP `123456`. The card option also appears at
  checkout.
- Paying by card on a phone needs the app at a public web address: Paystack
  sends people back to `APP_URL`, and `localhost` only works on your Mac.

## Dojah (BVN, NIN, CAC, face and SIM checks)

- [app.dojah.io](https://app.dojah.io): create a sandbox app; copy its App ID
  and secret key into `DOJAH_APP_ID` and `DOJAH_SECRET_KEY`.
- `DOJAH_BASE_URL` already points at the sandbox. Delete that line, and run
  `npm run secrets:push` again, only when you switch to live keys.
- **Check:** Get verified (`/get-verified`) with one of Dojah's sandbox test
  identities (TESTING.md, section 15, lists them); the result appears for
  staff under `/admin` → Verification.

## LiveKit (video inside live selling)

- [cloud.livekit.io](https://cloud.livekit.io): create a project; under
  Settings → Keys, copy the WebSocket URL (`wss://…livekit.cloud`), API key
  and secret into the three `LIVEKIT_` lines.
- **Check:** as the test seller, go live (`/live/new`) from the phone camera;
  watch it from another account.

## Google Maps (road routing and traffic for riders)

- [console.cloud.google.com](https://console.cloud.google.com): a project with
  billing on, the **Routes API** enabled, and an API key restricted to it.
  Copy the key into `GOOGLE_MAPS_API_KEY`.
- **Check:** as the test rider, take two deliveries. The round says "The
  quickest order on the roads in current traffic" and shows minutes to each
  stop, instead of a distance "in a straight line".

## Termii (text-message sign-up codes)

- [accounts.termii.com](https://accounts.termii.com): an approved sender ID
  `FindWork`, the DND route switched on, and credit in the wallet. Copy the API
  key and your account's base URL into `TERMII_API_KEY` and `TERMII_BASE_URL`.
- Supabase dashboard → Authentication → Hooks → add a **Send SMS** hook,
  HTTPS, pointing at
  `https://yletjxnmsytdmhtsyezd.supabase.co/functions/v1/send-sms`; generate its
  secret and copy it (it starts `v1,whsec_`) into `SEND_SMS_HOOK_SECRET`.
- Run `npm run secrets:push` **before** the next step, or phone sign-up breaks.
- Authentication → Sign In / Providers → Phone: switch it on, SMS OTP expiry
  600 seconds.
- **Check:** sign up with a Nigerian phone number; the code arrives by text.

## Firebase (push to the iPhone and Android apps)

The browser push is already on; this is for the phone apps. Full steps are in
the README under Phone apps → Push in the apps. In short:

- [console.firebase.google.com](https://console.firebase.google.com): create a
  project. Copy its project ID into `FCM_PROJECT_ID`.
- Add an Android app (`africa.findwork.app`) and put `google-services.json` in
  `android/app/`. Add an iOS app with the same ID and drag
  `GoogleService-Info.plist` into the `App` group in Xcode.
- Upload an Apple push key (`.p8`, from developer.apple.com → Keys) under
  Cloud Messaging. This needs an Apple Developer account.
- Service accounts → Generate new private key. Paste the whole file on one
  line, inside single quotes, into `FCM_SERVICE_ACCOUNT_JSON`.
- **Check:** in the app on a phone, Preferences (`/preferences`) → push on;
  then trigger any notification, such as a chat message from another account.

## Optional

- **Google and Apple sign-in buttons:** switch the provider on in Supabase
  (Authentication → Sign In / Providers), then set `VITE_OAUTH_PROVIDERS=google`
  (or `google,apple`) in `.env.local` and restart `npm run dev`.
