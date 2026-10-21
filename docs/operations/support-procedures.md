# FindWork support procedures

How FindWork staff handle each queue in the operations console (`/admin`). Draft
of 21 October 2026, written from how the app works today; the operations lead
should adjust the response times and escalation contacts to the team that
actually runs it, then review this document every quarter.

Every action in the console is recorded against the member of staff who took
it (`admin_actions`), and every money movement is a ledger entry naming its
reason. Write notes as if the customer, a regulator or a court will read them.

## Roles

Each staff account has one role. The console shows only that role's tabs.

| Role | Tabs | Typical work |
| --- | --- | --- |
| Admin | All | Staff roles, anything escalated |
| Moderator | Disputes, Verification, Reports, Users, Risk | Disputes, ID checks, content, suspensions |
| Finance | Payouts, Wallets, Risk, reports | Withdrawals, refunds, payout policy, adjustments |
| Support | Support, Orders | Customer questions, FindWork's own catalogue orders |

Give each person the least role they need. Only admins assign roles, and nobody
can change their own.

## Response times

| Queue | First response | Resolution target |
| --- | --- | --- |
| SOS alerts | Immediately, 24 hours a day | Until the person is safe |
| High-risk alerts | 1 hour in working hours | Same day |
| Disputes | 1 working day | 3 working days |
| Payouts waiting for staff | Same working day | Same working day |
| Failed automatic payouts | 4 working hours | Same working day |
| Verification referred to staff | 1 working day | 1 working day |
| Support requests | 1 working day | 2 working days |
| Reports (content) | 1 working day | 1 working day |
| Data protection requests | 5 working days to acknowledge | 30 days |

**Gap to close before launch:** there is no on-call rota for SOS alerts. Until
there is one, the SOS screen must not be promoted.

## SOS alerts (Risk tab)

An SOS arrives with the person's position, the meet-up they were on and who they
were meeting. FindWork does not contact the police on its own.

1. Call the person on the phone number on their account at once.
2. If they answer and are safe, note it and close the alert.
3. If they need help, or do not answer within two tries: call the emergency
   number for their location (112 nationally, 767 in Lagos), give the position
   from the alert, and stay on the line if you can.
4. If they have trusted contacts saved, they will have chosen whether to alert
   them themselves; do not share their location with anyone else.
5. Suspend the other party's account if there is any sign of threat, and record
   why.
6. Write a full note: times, calls made, outcome. Tell the admin on duty.

## Disputes (Disputes tab)

A dispute freezes the money for a booking, an order or a wholesale purchase
order until a member of staff decides.

1. Read the claim, both sides' responses and every photo. "Summarise this case"
   gives an AI summary of what is agreed, contested and missing. It is a reading
   aid: it does not recommend an outcome, and neither should you lean on it.
2. If something the decision turns on is missing, ask for it through the
   dispute conversation and give a deadline (usually 48 hours).
3. Decide on the evidence:
   - **Release** to the provider or seller when the work or goods were delivered
     as agreed.
   - **Refund** the customer when they were not, or not at all.
   - **Dismiss** when the claim is not about the transaction (the money then
     follows its normal course).
4. Write the reason in plain words. Both sides see it.
5. A refund after a seller has already been paid takes the money back from the
   seller's wallet. If their wallet cannot cover it the refund is refused: leave
   the dispute open, contact the seller, and escalate to finance.

Never decide a dispute you are involved in, or one involving someone you know.

## Verification (Verification tab)

A NIN or BVN is checked with the national register through Dojah as soon as it
is sent. When the number, name and face all match (and the phone does not belong
to someone else), the account is verified automatically. Everything else waits
here, with the register's answers beside the documents.

1. Compare the ID photo, the selfie and the name on the account.
2. Read the register panel: a face mismatch or "not on the register" also raised
   a risk alert. "Could not check" means the service failed; press
   "Check again" before deciding.
3. Approve when the documents are clear, current and match each other and the
   register.
4. Reject with a reason the person can act on: "The photo of your ID is blurred;
   send a clear photo of the whole card."
5. A duplicate ID (the same number verified on another account) is a high-risk
   alert: do not approve; investigate under Risk.

Businesses: the CAC register's name for the RC number must match the business
name given, and the company must be active. Approve, or reject saying what to
correct.

## Payouts (Payouts tab)

Withdrawals to a bank account the bank has confirmed through Paystack are sent
automatically, up to the limit set at the top of the tab. Everything else waits
here.

- **Manual withdrawals:** send the transfer from the company account, then
  "Mark sent" with the bank's reference. If the account name does not match the
  FindWork account, reject it; the money returns to the person's wallet.
- **Failed automatic payouts** show Paystack's reason. If it was temporary (for
  example, the Paystack balance was low and has been topped up), press
  "Try Paystack again". Otherwise send by hand or reject.
- **Stuck payouts** (asked of Paystack more than an hour ago with no answer):
  check the transfer in the Paystack dashboard first. Only if it did not go out,
  "Take back" and settle by hand. Never take back one that Paystack sent: the
  person would be paid twice.
- **Payout limit:** finance sets it. Lower it, or turn automatic payouts off,
  if the risk queue shows a pattern of fraud.
- **Top-ups to refund:** a payment that landed after its account was deleted.
  Refund it from the Paystack dashboard, then mark it refunded with the reference.

## Risk alerts (Risk tab)

Alerts come from fixed rules: new or shared devices, top-up then withdraw, rapid
or large money movements, repeated refunds, copied listings, off-platform payment
requests, register mismatches, duplicate IDs and more. Each says which rule fired.

1. Open the account (Users tab) and look at its devices, sign-ins, transactions,
   disputes and reports.
2. **Dismiss** an alert with a note when it is explained (a business with
   genuinely large orders, a family sharing a phone).
3. **Mark reviewed** and act when it is not: limit by leaving a withdrawal with
   staff, suspend, or escalate to an admin.
4. Never tell the person which rule fired or how it works.

## Suspension (Users tab)

Suspend when an account puts others at risk or clearly breaks the terms: fraud,
threats, a confirmed fake identity, repeated off-platform payment requests.

- Write the reason; the person sees it and can contact support from the
  suspension screen.
- Suspension blocks spending, bookings, orders, quotes, listings and messages.
  Money stays where it is. Open escrow continues through disputes.
- Reinstate with a note when the matter is resolved.

## Reports (Reports tab)

Users report listings, messages, profiles, jobs, requests, posts and streams.
Remove content that breaks the terms (prohibited goods, harassment, off-platform
payment requests, sexual content, personal information). Dismiss the rest with
a note. Repeated offences by one account go to Risk.

## Support requests (Support tab)

1. Reply in plain words, in the customer's language where you can (the app
   offers English, Pidgin, Yoruba, Igbo and Hausa).
2. For anything about money, find the transaction by its reference and say what
   you see.
3. Never ask for a password, card number, PIN, BVN or one-time code. FindWork
   staff never need them.
4. If it is a bug, write down the steps, the device and browser, and pass it to
   the developers.

## Data protection requests

Under the Nigeria Data Protection Act a person can ask for a copy of their data,
correction, erasure, restriction or objection.

1. Confirm it is the account holder (the request comes from their signed-in
   account, or they confirm a code sent to the account's phone or email).
2. Acknowledge within 5 working days; complete within 30 days.
3. Copies: export their profile, bookings, orders, ledger and messages, and send
   them securely.
4. Erasure: the person can delete their account in Settings once nothing is
   owed. Financial and verification records are kept for the periods in the
   privacy policy, as the law requires.
5. Record every request and its outcome; tell the data protection officer.

## Wallet adjustments (Wallets tab)

Adjust a balance only to correct a FindWork error or to fund a test account, and
always with a reason; the person sees it in their history. Two-person rule for
any adjustment above ₦50,000: a second finance or admin member confirms in
writing before you make it.

## Escalation

| When | To |
| --- | --- |
| Anyone in danger | Emergency services, then the admin on duty |
| Suspected crime or a court order | Admin on duty and legal counsel |
| Data breach or suspected breach | Admin on duty and the data protection officer, at once |
| Payment provider problem | Finance lead |
| App fault affecting money | Developers and finance lead |

Contacts: [admin on duty rota], [finance lead], [data protection officer],
[legal counsel], [developer on call].
