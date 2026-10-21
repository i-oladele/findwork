/**
 * FindWork's terms of service and privacy policy.
 *
 * DRAFTS, written by the developers from how the app actually works, for a
 * Nigerian lawyer to review, correct and approve before launch. Text in
 * [square brackets] is for the company or its lawyer to fill in. The screen
 * says plainly that these are drafts until DRAFT is set to false.
 *
 * When a feature changes how money, data or responsibility moves, update
 * the matching section here in the same change.
 */

export const DRAFT = true
export const LAST_UPDATED = '21 October 2026'

export type Section = { heading: string; paragraphs?: string[]; list?: string[] }
export type LegalDocument = { title: string; summary: string; sections: Section[] }

const COMPANY = '[FindWork legal entity name], a company registered in Nigeria with RC number [number], of [registered address]'
const CONTACT = '[support email address]'

export const TERMS: LegalDocument = {
  title: 'Terms of service',
  summary: 'The agreement between you and FindWork when you use the app: bookings, escrow, fees, refunds, the wallet and how everyone is expected to behave.',
  sections: [
    {
      heading: '1. Who we are and what this covers',
      paragraphs: [
        `FindWork is operated by ${COMPANY} ("FindWork", "we", "us"). These terms apply to everyone who uses the FindWork app or website: people who hire or buy, providers and sellers, riders, business buyers and suppliers.`,
        'By creating an account or using FindWork you agree to these terms and to our privacy policy. If you do not agree, do not use FindWork.',
      ],
    },
    {
      heading: '2. Your account',
      list: [
        'You must be at least 18 years old and able to enter a binding contract.',
        'Give true details and keep them up to date. One person, one account, unless we agree otherwise for a business.',
        'Keep your password, codes and devices secure. You are responsible for what happens on your account until you tell us it has been compromised.',
        'You can switch on a second sign-in step and fingerprint or face sign-in in Settings. We recommend both.',
        'You can delete your account in Settings once nothing is owed to or by you (no money in your wallet or escrow, no open jobs, orders, disputes or withdrawals).',
      ],
    },
    {
      heading: '3. Verification',
      paragraphs: [
        'Some services and higher limits need you to verify your identity or business. When you send a NIN or BVN with a selfie, we check them with the national registers through our identity-check provider (Dojah); a business is checked against the Corporate Affairs Commission register. Other IDs, and anything a check cannot confirm, are reviewed by our staff.',
        'Verification shows that a person or business matched a register on the day it was checked. It is not a guarantee of anyone\'s work, honesty or conduct. Daily limits on withdrawals and transfers depend on your verification level, as shown in the app.',
      ],
    },
    {
      heading: '4. FindWork\'s role',
      paragraphs: [
        'FindWork is a marketplace. Providers, sellers, suppliers and riders are independent: they are not our employees or agents, and they set their own prices and terms within these rules. The contract for a service or goods is between the customer and the provider or seller. We provide the platform, hold payments in escrow as described below, and help resolve disputes.',
      ],
    },
    {
      heading: '5. Bookings and escrow',
      list: [
        'When you book a service, the price plus a 5% service fee is taken from your wallet and held in escrow. The provider is not paid until you confirm the job is done, or release a stage on a job paid in stages.',
        'If the provider declines, or either side cancels before the start time, everything held is refunded to your wallet. A booking that has started cannot be cancelled; report a problem instead.',
        'When you confirm a job, the provider receives the price less the commission for their plan, as shown on the Plans screen at the time.',
        'A job agreed through a quote can be paid in two to six stages. The full price is held at the start; you release each stage in order; cancelling refunds only what has not been released.',
      ],
    },
    {
      heading: '6. Shop orders and delivery',
      list: [
        'When you buy goods, the price and delivery (one fee per seller) are taken when you order. For goods from a seller, the money is held until you confirm the order arrived, or until [7] days after dispatch if you do not respond.',
        'An order can be cancelled for a full refund until it is dispatched. After delivery, report a problem from the order page.',
        'A rider delivering your order shares their position with you while carrying it. Give your delivery code to the rider only when the goods are in your hands: it confirms delivery and releases payment.',
        'Coupons apply only as described in the app. A seller\'s coupon is paid for by that seller. One code per order.',
      ],
    },
    {
      heading: '7. Paying, the wallet and withdrawals',
      list: [
        'Card and bank payments are processed by Paystack. We never see or store your full card details.',
        'Your FindWork wallet is a record of money you hold with us for use on FindWork. It is not a bank account and earns no interest. Customer money is held [with / through a licensed payment service provider: name].',
        'You can pay for an order or a plan directly by card. If an order cannot be placed after your card is charged (for example, an item sold out), the money is kept in your wallet and you are told why. You can withdraw it or spend it.',
        'If you choose to keep a card for your plan, we charge it for each renewal and tell you three days before. If the card is declined we use your wallet; if neither covers it, your plan moves to Free. You can remove a saved card at any time in Plan and billing.',
        'Withdrawals leave your balance at once. To a bank account your bank has confirmed, they are usually sent automatically within minutes; others, and larger amounts, are sent by our team, usually the same working day. The minimum withdrawal is ₦1,000.',
        'Transfers between FindWork accounts are gifts: they are not held in escrow and we cannot reverse them. Pay for work or goods through a booking or order instead.',
        'We may hold, delay or reverse a payment that our checks or a dispute show is fraudulent or mistaken, and we will tell you why unless the law prevents it.',
      ],
    },
    {
      heading: '8. Plans and fees',
      paragraphs: [
        'Providers and sellers can subscribe to a paid plan that lowers commission and lifts listing limits. Prices, commissions and limits are shown on the Plans screen before you subscribe. Plans renew monthly until you change them; there is no refund for a part month. We will give at least [30] days\' notice of any change to fees that affects you.',
      ],
    },
    {
      heading: '9. Disputes',
      list: [
        'If something goes wrong with a booking, order or purchase order, report a problem from it. The money is frozen until it is resolved.',
        'Both sides can explain and add photos. A member of FindWork staff decides whether to release the money, refund it, or split the outcome where the app allows. Staff may use an AI summary to organise the evidence, but a person always decides.',
        'Our decision settles where the money held on FindWork goes. It does not stop you taking any other step the law allows.',
      ],
    },
    {
      heading: '10. Riders',
      paragraphs: [
        'Riders apply in the app and are approved by our staff. A rider is paid 80% of the delivery fee into their wallet when the customer\'s code confirms delivery. Riders must obey traffic law, carry goods with care, and never ask for payment outside FindWork.',
      ],
    },
    {
      heading: '11. Classifieds and meet-ups',
      paragraphs: [
        'Classifieds are deals between two people and are not covered by escrow. Meet in a public place, check the item before paying, and use the meet-up tools. The SOS button alerts FindWork staff with your position; it does not contact the police or emergency services. In an emergency call 112 (or 767 in Lagos).',
      ],
    },
    {
      heading: '12. Wholesale and organisations',
      paragraphs: [
        'Organisations can let members request quotes and raise purchase orders, paid from the owner\'s wallet into escrow. The owner is responsible for purchases approved under the organisation\'s settings. A supplier is paid when the buyer confirms delivery, or 14 days after delivery is marked if the buyer does not respond.',
      ],
    },
    {
      heading: '13. Courses, internships and certificates',
      paragraphs: [
        'FindWork certificates show that you completed a FindWork course and passed its quiz. They are not government licences or trade accreditations and do not replace one where the law requires it.',
      ],
    },
    {
      heading: '14. Live selling, stories and other content',
      paragraphs: [
        'You keep ownership of what you post. You give FindWork a non-exclusive, worldwide, royalty-free licence to host, show and promote it on FindWork for as long as it is posted. You must have the right to post it. Live video carried by FindWork is transmitted through our video provider and is not recorded by FindWork.',
      ],
    },
    {
      heading: '15. What is not allowed',
      list: [
        'Anything illegal in Nigeria, including prohibited or stolen goods, weapons, drugs, and counterfeit items.',
        'Taking payment outside FindWork for a deal found on FindWork, or asking others to.',
        'Fake reviews, fake listings, misleading prices or photos.',
        'Harassment, threats, hate speech, sexual content involving anyone under 18, or sharing someone\'s personal information without their permission.',
        'Using someone else\'s identity, or creating accounts to get around a suspension or limit.',
        'Interfering with FindWork\'s systems, scraping, or testing our security without written permission.',
      ],
    },
    {
      heading: '16. Safety checks and suspension',
      paragraphs: [
        'We run automated checks on accounts, devices, listings, messages and transactions to detect fraud and abuse. These checks raise alerts for our staff; they do not decide on their own. We may limit, suspend or close an account that breaks these terms or puts others at risk. A suspended account keeps its money where it is and can contact support from the suspension screen.',
      ],
    },
    {
      heading: '17. The assistant',
      paragraphs: [
        'The voice and text assistant, message translation and lesson help use an AI model. Their answers can be wrong; check anything important. The assistant cannot see your account or move money.',
      ],
    },
    {
      heading: '18. Liability',
      paragraphs: [
        'We provide FindWork with reasonable skill and care, but we cannot promise it will always be available or free of errors. We are not responsible for the quality, safety or legality of services or goods offered by others, or for the conduct of other users, except where the law makes us responsible.',
        'Nothing in these terms limits liability that cannot be limited under Nigerian law, including under the Federal Competition and Consumer Protection Act. Otherwise, our total liability to you for any claim is limited to [the fees you paid FindWork in the six months before the claim / an amount to be agreed].',
      ],
    },
    {
      heading: '19. Changes and governing law',
      paragraphs: [
        'We may update these terms. We will tell you in the app at least [14] days before a change that affects you takes effect. These terms are governed by the laws of the Federal Republic of Nigeria, and the courts of [Lagos State] have jurisdiction.',
        `Questions or complaints: write to us from Help and support in the app, or at ${CONTACT}.`,
      ],
    },
  ],
}

export const PRIVACY: LegalDocument = {
  title: 'Privacy policy',
  summary: 'What we collect, why, who we share it with, how long we keep it, and your rights under the Nigeria Data Protection Act 2023.',
  sections: [
    {
      heading: '1. Who is responsible',
      paragraphs: [
        `${COMPANY} is the data controller for personal data processed through FindWork. Our data protection officer can be reached at [DPO email address]. We are registered with the Nigeria Data Protection Commission as [registration details].`,
      ],
    },
    {
      heading: '2. What we collect',
      list: [
        'Account details: your name, phone number and/or email, password (stored only as a secure hash), and the role you choose.',
        'Profile and listings: business name, trade, area, photos, portfolio, services, products, prices and reviews.',
        'Location: the area you choose; a pinned location if you set one (only you see it exactly); a rider\'s position while carrying an order (shared with that order\'s customer and seller); and your position during an SOS or a meet-up you choose to share.',
        'Identity verification: the ID type and number, a photo of the ID, a selfie, and the result of register checks (whether the number, name, face and phone matched, and the name the register holds). We do not keep the register\'s photo, date of birth or other register data.',
        'Payments: wallet history, bookings, orders, withdrawals and the bank account you pay out to. Card details are handled by Paystack; for a card you keep for renewals we store only Paystack\'s reference for it and its type, last four digits and expiry.',
        'Messages and content: chat messages, voice notes, photos and files you send, dispute statements and evidence, support requests, posts and live chat.',
        'Security data: devices you sign in from, IP address, sign-in events, and a browser identifier, used to protect accounts and detect fraud.',
        'Usage analytics, if you allow it: which kinds of screen you open (never what is on them). You can turn this off in Preferences, which erases what was recorded.',
        'What you ask the assistant: the words of a voice or typed request, a message you ask to translate, or a lesson question.',
      ],
    },
    {
      heading: '3. Why we use it, and on what basis',
      list: [
        'To provide FindWork and carry out our agreement with you: accounts, bookings, orders, escrow, payouts, delivery, chat and support (contract).',
        'To verify identity and businesses, set limits, and prevent fraud and money laundering (legal obligation and legitimate interest).',
        'To keep you and others safe: risk alerts, moderation, SOS and dispute resolution (legitimate interest; vital interests in an emergency).',
        'To suggest providers, jobs and products, and to improve the app from aggregated usage (legitimate interest; consent for usage analytics).',
        'To send notifications you have not switched off, and push notifications on devices where you turned them on (contract; consent for push).',
      ],
    },
    {
      heading: '4. Automated checks',
      paragraphs: [
        'We use fixed rules to score how well a provider fits a job, to calculate trust scores and to flag possible fraud. When every register check matches, your account is verified without a person looking; a mismatch is never rejected automatically, it is reviewed by our staff. Fraud rules raise alerts for staff and do not suspend accounts or move money on their own. You can ask for any decision about you to be reviewed by a person.',
      ],
    },
    {
      heading: '5. Who we share it with',
      paragraphs: [
        'Other users see what is needed for a deal: your public profile, listings and reviews; the delivery address and phone for an order you place; your first name in live chat. Your phone number and email are not shown to other users.',
        'We use these service providers, under contracts that require them to protect your data and use it only for us:',
      ],
      list: [
        'Supabase (database, storage and server functions), hosted in the European Union (Ireland).',
        'Vercel (website hosting).',
        'Paystack (card and bank payments, payouts and bank account confirmation), Nigeria.',
        'Dojah (identity and business register checks), Nigeria.',
        'Termii (sign-up codes by text message), Nigeria.',
        'Google (road travel times for deliveries; only the points of a delivery route are sent).',
        'LiveKit (live video for selling streams carried by FindWork).',
        'Anthropic (the assistant, translation, lesson help and staff analysis; text only, not used to train their models under our agreement).',
        'OpenStreetMap and Photon (maps and address search).',
      ],
    },
    {
      heading: '6. Transfers outside Nigeria',
      paragraphs: [
        'Some providers above process data outside Nigeria (in the European Union and the United States). We transfer data only where the Nigeria Data Protection Act allows it, relying on [adequacy decisions / standard contractual clauses / other safeguards approved by the NDPC].',
      ],
    },
    {
      heading: '7. How long we keep it',
      list: [
        'Account and profile data: while your account is open. When you delete your account, your profile is anonymised and your listings and bank details are removed.',
        'Financial records (ledger, bookings, orders, payouts, invoices): [the period required by tax and anti-money-laundering law, e.g. six years], even after deletion, without your name attached where the law allows.',
        'Verification documents and register results: [period to be confirmed by counsel, e.g. five years after the account closes, as required for KYC].',
        'Messages and dispute evidence: [period to be confirmed], and longer while a dispute or legal claim is open.',
        'Usage analytics: six months, then deleted automatically; immediately if you turn analytics off.',
        'Security and sign-in records: [period to be confirmed, e.g. 12 months].',
      ],
    },
    {
      heading: '8. Your rights',
      paragraphs: [
        'Under the Nigeria Data Protection Act 2023 you can ask us to give you a copy of your data, correct it, delete it, restrict or object to how we use it, move it to another service, and withdraw consent you gave (for push and usage analytics, you can do this yourself in Preferences). Write to us from Help and support or at the address below. We reply within [30] days.',
        'If you are not satisfied with our answer, you can complain to the Nigeria Data Protection Commission.',
      ],
    },
    {
      heading: '9. Security',
      paragraphs: [
        'Data is encrypted in transit; access to each record is enforced by the database itself, so one account cannot read another\'s data; ID documents and evidence are in private storage reachable only through short-lived links. Staff access is limited by role and logged. No system is perfectly secure: if a breach puts you at risk, we will tell you and the NDPC as the law requires.',
      ],
    },
    {
      heading: '10. Children',
      paragraphs: ['FindWork is not for anyone under 18, and we do not knowingly collect their data. If you believe a child has an account, tell us and we will close it.'],
    },
    {
      heading: '11. Changes and contact',
      paragraphs: [
        'We will tell you in the app before a change to this policy that affects you takes effect.',
        `Contact: ${CONTACT}, or Help and support in the app. Post: [registered address].`,
      ],
    },
  ],
}
