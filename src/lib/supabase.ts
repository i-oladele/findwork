import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * True when the app has been pointed at a Supabase project. Screens use this
 * to fail loudly in development instead of rendering empty states that look
 * like real "no data yet" results.
 */
export const isSupabaseConfigured = Boolean(url && anonKey)

if (!isSupabaseConfigured && import.meta.env.DEV) {
  console.warn(
    '[findwork] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set. ' +
      'Copy .env.example to .env.local and fill them in — every query will fail until you do.',
  )
}

export const supabase = createClient<Database>(url ?? 'http://localhost:54321', anonKey ?? 'missing-anon-key', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    // Fingerprint and face sign-in (passkeys), which Supabase still marks
    // experimental. Also switched on per project: Authentication → Passkeys.
    experimental: { passkey: true },
  },
})

/**
 * Postgres error codes and the RAISE EXCEPTION messages our RPCs use, mapped
 * to copy a user should actually see. Anything unrecognised falls through to
 * a generic message rather than leaking SQL to the screen.
 */
const FRIENDLY_ERRORS: Record<string, string> = {
  'minimum transfer': 'The minimum you can send is ₦100.',
  'cannot send to yourself': 'That is your own account.',
  'recipient not found': 'We could not find that account.',
  'invalid transfer': 'That transfer could not be sent. Start again.',
  'transfer note too long': 'Keep the note under 140 characters.',
  'invalid milestones': 'Stages need a name each and must add up to your price.',
  sent_quotes_milestones_valid: 'Stages need a name each and must add up to your price.',
  'milestone not found': 'We could not find that stage.',
  'milestone already settled': 'That stage has already been paid or refunded.',
  'release earlier milestones first': 'Release the earlier stages first.',
  'choose an option': 'Choose an option (such as a size) for every item in your cart.',
  'invalid variants': 'Each option needs a name and a price above ₦0; stock cannot be negative.',
  product_variants_product_id_name_key: 'Two options have the same name.',
  coupon_invalid: 'That coupon is not valid, or it has ended.',
  coupon_used_up: 'That coupon has been used the maximum number of times.',
  coupon_already_used: 'You have already used that coupon.',
  coupon_not_for_cart: 'That coupon is for a different seller\'s goods.',
  coupon_min_spend: 'Your cart is below the minimum spend for that coupon.',
  'invalid coupon code': 'A code is 4 to 20 letters and numbers.',
  'invalid coupon': 'Check the discount: a percentage is 1 to 90, amounts are above ₦0, and the end date is in the future.',
  coupons_code_key: 'That code is already taken. Choose another.',
  'coupon not found': 'We could not find that coupon.',
  'not an approved rider': 'Only approved riders can do that.',
  'invalid vehicle': 'Choose how you will deliver.',
  'plate required': 'Enter your plate number.',
  'rider not found': 'We could not find that rider.',
  'delivery not found': 'We could not find that delivery.',
  'delivery already taken': 'Another rider has taken that delivery.',
  'delivery already collected': 'This order has already been collected.',
  'delivery already closed': 'This delivery is already finished.',
  'cannot deliver your own order': 'You cannot deliver an order you bought or sold.',
  'too many active deliveries': 'Finish a delivery before taking another: five at a time is the limit.',
  'collect the order first': 'Mark the order as collected before delivering it.',
  'delivery code locked': 'Too many wrong codes. Ask the customer to contact support.',
  'invalid location': 'We could not read that location. Try again.',
  'invalid language': 'Choose one of the listed languages.',
  'too many choices': 'Choose up to 20.',
  'invalid push subscription': 'This browser could not turn on push notifications.',
  'listing not found': 'That listing is no longer available.',
  'cannot meet yourself': 'That is your own listing.',
  'meeting place required': 'Say where you will meet: a public place is safest.',
  'invalid meeting time': 'Choose a time in the next 60 days.',
  'too many open meet-ups': 'You have ten meet-ups open. Finish or cancel one first.',
  'meet-up not found': 'We could not find that meet-up.',
  'meet-up cannot be changed': 'This meet-up can no longer be changed that way.',
  'invalid duration': 'Share for between 5 minutes and 3 hours.',
  'location sharing has ended': 'Location sharing has ended. Start it again to keep sharing.',
  'You can save up to 3 trusted contacts.': 'You can save up to 3 trusted contacts. Remove one first.',
  trusted_contacts_phone_check: 'Enter the number in full, with the country code: +234…',
  trusted_contacts_profile_id_phone_key: 'That number is already one of your trusted contacts.',
  'say what was done': 'Say what was done, so the person knows.',
  'invalid organisation': 'Give the organisation a name, and an approval limit of ₦0 or more.',
  'too many organisations': 'You can own up to five organisations.',
  'organisation owners only': 'Only the organisation\'s owner can do that.',
  'organisation approvers only': 'Only the organisation\'s owner or an approver can do that.',
  'not a member of that organisation': 'You are not a member of that organisation.',
  'too many members': 'An organisation can have up to 50 members.',
  'invalid request': 'Give the request a title, and each line a description and a quantity.',
  supplier_not_verified: 'This buyer only accepts quotes from verified suppliers. Verify your ID or business first.',
  supplier_blocked: 'This organisation does not buy from that supplier.',
  'purchase order not found': 'We could not find that purchase order.',
  'purchase order cannot be changed': 'This purchase order has moved on. Refresh to see where it stands.',
  'hold reason required': 'Say what is wrong, in at least a sentence.',
  'invalid stock lines': 'Choose your own products and quantities above zero.',
  'lesson has no content': 'This lesson has not been written yet, so it cannot be completed.',
  'finish the lessons first': 'Finish every lesson before taking the quiz.',
  'course has no quiz': 'This course has no quiz.',
  'answer every question': 'Answer every question before sending.',
  'too many quiz attempts': 'You have used three attempts today. Review the lessons and try again tomorrow.',
  'invalid course': 'Give the course a title, and every lesson a title.',
  quiz_questions_check: 'Every question needs two to six options and one marked correct.',
  'verification required to post': 'Verify your ID before posting an internship, so applicants know who they are dealing with.',
  'too many open internships': 'You have 20 internships open. Close one first.',
  'internship is closed': 'This internship is no longer taking applications.',
  'cannot apply to your own internship': 'That is your own listing.',
  'cover note required': 'Write at least a couple of sentences about why you are applying.',
  internship_applications_internship_id_applicant_id_key: 'You have already applied to this internship.',
  'application not found': 'We could not find that application.',
  'application already decided': 'That application has already been decided.',
  'invalid post': 'Choose a story or a reel.',
  'too many posts': 'You have reached the limit: ten stories at a time, fifty reels. Remove one first.',
  'post not found': 'That post is no longer available.',
  'invalid stream link': 'Paste the secure (https) link where people watch your stream.',
  'too many products': 'A stream can show up to 20 products.',
  'too many streams': 'You have five streams scheduled or live. End one first.',
  'stream not found': 'We could not find that stream.',
  'stream cannot be changed': 'This stream has moved on. Refresh to see where it stands.',
  'stream is not live': 'The chat opens when the stream is live.',
  'invalid message': 'Write a message of up to 300 characters.',
  'slow down': 'Give it a moment before sending another message.',
  'message not found': 'That message is no longer there.',
  'too many invites': 'You have invited ten providers to this job already.',
  'thread not found': 'We could not find that conversation.',
  verification_limit: 'That is more than your daily limit. Verify your ID or business to raise it.',
  'invalid registration number': 'Check the CAC number: for example RC1234567 or BN1234567.',
  'invalid business name': 'Enter the registered business name.',
  'rejection reason required': 'Say why, so they know what to fix.',
  'verification not found': 'We could not find that submission.',
  mfa_required: 'Enter the code from your authenticator app to continue.',
  account_suspended: 'Your account is suspended. Contact support from Settings to resolve it.',
  counterparty_suspended: 'This person is not available on FindWork right now.',
  'cannot change your own account': 'You cannot change your own account. Ask another admin.',
  'suspension reason required': 'Give a reason of 3 to 500 characters.',
  'alert already reviewed': 'Someone on the team has already reviewed that alert.',
  'dispute already resolved': 'This dispute has been resolved. Refresh to see the outcome.',
  'not a dispute participant': 'Only the people involved and FindWork moderators can respond.',
  'invalid response evidence': 'Upload your own JPG, PNG, WebP or GIF photos, up to 8 MB each.',
  'invalid response': 'Add a response of up to 2,000 characters or up to four photos.',
  quote_changed: 'This quote has changed. Go back and review the latest terms before continuing.',
  'quote unavailable': 'This quote was withdrawn or is no longer available.',
  'quote text too long': 'Keep your message under 2,000 characters and your start date under 100 characters.',
  'address not found': 'That address is no longer available. Refresh your address book.',
  'You can save up to 20 addresses.': 'You can save up to 20 addresses. Delete an old one first.',
  'portfolio item not found': 'That portfolio item is no longer available. Refresh and try again.',
  'You can publish up to 20 portfolio items.': 'You can publish up to 20 portfolio items. Remove an old item first.',
  'invalid media path': 'That file cannot be used. Upload a file from your own account.',
  'invalid media file': 'The file is unavailable or too large. Upload it again (40 MB maximum).',
  'unsupported media type': 'Choose a supported image, video or PDF for this item type.',
  insufficient_balance: 'Not enough money in your wallet. Top up and try again.',
  dispute_open: 'A dispute is open on this. The money stays on hold until our team resolves it.',
  listing_limit_reached: 'Your plan allows 3 live services. Pause one, or upgrade for unlimited listings.',
  '23P01': 'That time slot was just taken. Please pick another.',
  '23505': 'That already exists.',
  '23503': 'Something this depends on is missing. Please refresh and try again.',
  '42501': 'You do not have permission to do that.',
  'provider not found': 'This provider is no longer available.',
  'provider is not taking bookings': 'This provider is not taking bookings right now.',
  'provider is closed that day': 'This provider does not work on that day. Pick another.',
  'cannot book a time in the past': 'That time has already passed. Pick a later one.',
  'cannot book yourself': 'You cannot book your own services.',
  'package is paused': 'That service is paused by the provider.',
  'package not found': 'That service is no longer available.',
  'booking not found': 'We could not find that booking.',
  'not your booking': 'You do not have permission to change this booking.',
  'booking already answered': 'This booking has already been accepted or declined.',
  'booking already started': 'This booking has already started. If something is wrong, open a dispute.',
  'booking cannot be cancelled': 'This booking can no longer be cancelled.',
  'booking cannot be rescheduled': 'This booking can no longer be rescheduled.',
  'choose a different time': 'Choose a time different from the current booking.',
  'too far ahead': 'Choose a time within the next 90 days.',
  'reason too long': 'Keep your reason under 500 characters.',
  'reschedule already pending': 'There is already a proposed time. Respond to it or withdraw it first.',
  'reschedule already answered': 'This time change is no longer pending. Refresh to see the latest schedule.',
  'reschedule not found': 'We could not find that time change.',
  'only the other participant can respond': 'Only the other person can accept or decline your proposed time.',
  'booking is not active': 'The provider has not accepted this booking yet.',
  'booking is closed': 'This booking is already finished, so there is nothing to dispute.',
  'order already dispatched': 'This order is already on its way, so it cannot be cancelled.',
  'order is closed': 'This order is already closed.',
  'address required': 'Add a delivery address first.',
  'product not found': 'Something in your cart is no longer sold. Remove it and try again.',
  checkout_total_changed: 'Your cart total changed. Review the updated total before paying.',
  seller_refund_insufficient_balance: 'The seller wallet cannot cover this return yet. The dispute remains open; recover the funds before retrying.',
  'not enough stock': 'There is not enough stock for this cart. Update the quantities and try again.',
  'cannot buy your own goods': 'That is one of your own products. Remove it from your cart to check out.',
  'order not found': 'We could not find that order.',
  'not your order': 'You do not have permission to change this order.',
  products_name_length: 'Give the product a name of 2 to 120 characters.',
  products_price_positive: 'Set a price above ₦0.',
  products_stock_check: 'Stock cannot be less than zero.',
  products_description_length: 'Keep the description under 2,000 characters.',
  products_photo_limit: 'A product can have up to 6 photos.',
  'payment is not awaiting a refund': 'That payment has already been dealt with.',
  already_verified: 'Your account is already verified.',
  verification_pending: 'We are already checking your ID. We will let you know when it is done.',
  'invalid id number': 'Check the ID number: a NIN or BVN is 11 digits.',
  'invalid id type': 'Choose the type of ID you are sending.',
  'verification photos missing': 'Add a photo of your ID and a selfie, then send again.',
  'verification already reviewed': 'Someone on the team has already checked this one.',
  'invalid quantity': 'Quantities must be between 1 and 99.',
  'cart is empty': 'Your cart is empty.',
  'not your job': 'You do not have permission to change this job.',
  'job is closed': 'This job is closed.',
  'not your RFQ': 'You do not have permission to change this RFQ.',
  'RFQ is closed': 'This RFQ is closed.',
  'plan not found': 'That plan is no longer available.',
  'quote not found': 'We could not find that quote.',
  'not enrolled': 'Enrol in the course first.',
  'add a bank account first': 'Add the bank account to pay into first.',
  'minimum withdrawal': 'The minimum withdrawal is ₦1,000.',
  'cannot message yourself': 'That is you.',
  'admins only': 'Only FindWork staff can do that.',
  'reason required': 'Tell us what went wrong.',
  'Invalid login credentials': 'That email, phone or password is not right.',
  'User already registered': 'An account with those details already exists. Sign in instead.',

  // Supabase Auth error codes. Phone sign-in needs an SMS provider
  // (Twilio and friends) configured on the project, and costs money per
  // message, so it is off until someone switches it on.
  phone_provider_disabled: 'Phone sign-in is not available yet. Use your email address for now.',
  sms_send_failed: 'We could not text that number. Check it and try again, or use your email address.',
  // From the send-sms hook: codes are only texted to countries the business serves.
  sms_country_not_supported: 'We can only text codes to Nigerian numbers for now. Use your email address instead.',
  email_provider_disabled: 'Email sign-up is not switched on yet.',
  signup_disabled: 'New accounts are closed at the moment.',
  over_sms_send_rate_limit: 'Too many codes sent. Wait a few minutes and try again.',
  over_email_send_rate_limit: 'Too many emails sent. Wait a few minutes and try again.',
  over_request_rate_limit: 'Too many attempts. Wait a minute and try again.',
  // Supabase's built-in mailer only writes to the project's own team. Real
  // sign-ups need a custom SMTP sender set up in the dashboard.
  email_address_not_authorized: 'We cannot send email to that address yet. Please try again later.',
  'Database error saving new user': 'We could not finish creating your account. Please try again.',
  otp_expired: 'That code has expired. Ask for a new one.',
  invalid_credentials: 'That email, phone or password is not right.',
  user_already_exists: 'An account with those details already exists. Sign in instead.',
  email_not_confirmed: 'Confirm your email address first — check your inbox.',
  weak_password: 'Choose a stronger password: at least 8 characters, including a number.',
  // Supabase rejects throwaway domains such as example.com outright.
  email_address_invalid: 'That email address was not accepted. Use a real one you can open.',
  validation_failed: 'Check the details you entered and try again.',
  'Unsupported provider': 'That sign-in option is not available yet. Use your email address.',
  same_password: 'That is your current password. Choose a different one.',
  'Phone signups are disabled': 'Phone sign-in is not available yet. Use your email address for now.',
  'Unsupported phone provider': 'Phone sign-in is not available yet. Use your email address for now.',
  'Signups not allowed': 'New accounts are closed at the moment.',
}

export function friendlyError(error: unknown): string {
  if (!error) return 'Something went wrong. Please try again.'
  const err = error as { message?: string; code?: string }
  if (err.code && FRIENDLY_ERRORS[err.code]) return FRIENDLY_ERRORS[err.code]
  if (err.message) {
    for (const [needle, friendly] of Object.entries(FRIENDLY_ERRORS)) {
      if (err.message.includes(needle)) return friendly
    }
    if (err.message.includes('Failed to fetch')) {
      return 'No connection. Check your network and try again.'
    }
  }
  // Errors raised in the app itself (validation, Edge Function messages)
  // are already written for the user.
  if (error instanceof Error && !(error as { code?: string }).code && error.message) {
    return error.message
  }
  return 'Something went wrong. Please try again.'
}
