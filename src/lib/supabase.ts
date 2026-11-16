import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'
import { msg } from './msg'

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
      'Add them to .env.local — every query will fail until you do.',
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
  'messaging blocked': 'Messaging is unavailable because a user block is in place.',
  'minimum transfer': msg('The minimum you can send is ₦100.'),
  'cannot send to yourself': msg('That is your own account.'),
  'recipient not found': msg('We could not find that account.'),
  'invalid transfer': msg('That transfer could not be sent. Start again.'),
  'transfer note too long': msg('Keep the note under 140 characters.'),
  'invalid milestones': msg('Stages need a name each and must add up to your price.'),
  sent_quotes_milestones_valid: msg('Stages need a name each and must add up to your price.'),
  'milestone not found': msg('We could not find that stage.'),
  'milestone already settled': msg('That stage has already been paid or refunded.'),
  'release earlier milestones first': msg('Release the earlier stages first.'),
  'choose an option': msg('Choose an option (such as a size) for every item in your cart.'),
  'invalid variants': msg('Each option needs a name and a price above ₦0; stock cannot be negative.'),
  product_variants_product_id_name_key: msg('Two options have the same name.'),
  coupon_invalid: msg('That coupon is not valid, or it has ended.'),
  coupon_used_up: msg('That coupon has been used the maximum number of times.'),
  coupon_already_used: msg('You have already used that coupon.'),
  coupon_not_for_cart: msg('That coupon is for a different seller\'s goods.'),
  coupon_min_spend: msg('Your cart is below the minimum spend for that coupon.'),
  'invalid coupon code': msg('A code is 4 to 20 letters and numbers.'),
  'invalid coupon': msg('Check the discount: a percentage is 1 to 90, amounts are above ₦0, and the end date is in the future.'),
  coupons_code_key: msg('That code is already taken. Choose another.'),
  'coupon not found': msg('We could not find that coupon.'),
  'not an approved rider': msg('Only approved riders can do that.'),
  'invalid vehicle': msg('Choose how you will deliver.'),
  'plate required': msg('Enter your plate number.'),
  'rider not found': msg('We could not find that rider.'),
  'delivery not found': msg('We could not find that delivery.'),
  'delivery already taken': msg('Another rider has taken that delivery.'),
  'delivery already collected': msg('This order has already been collected.'),
  'delivery already closed': msg('This delivery is already finished.'),
  'cannot deliver your own order': msg('You cannot deliver an order you bought or sold.'),
  'too many active deliveries': msg('Finish a delivery before taking another: five at a time is the limit.'),
  'collect the order first': msg('Mark the order as collected before delivering it.'),
  'delivery code locked': msg('Too many wrong codes. Ask the customer to contact support.'),
  'invalid location': msg('We could not read that location. Try again.'),
  'invalid language': msg('Choose one of the listed languages.'),
  'too many choices': msg('Choose up to 20.'),
  'invalid push subscription': msg('This browser could not turn on push notifications.'),
  'listing not found': msg('That listing is no longer available.'),
  'cannot meet yourself': msg('That is your own listing.'),
  'meeting place required': msg('Say where you will meet: a public place is safest.'),
  'invalid meeting time': msg('Choose a time in the next 60 days.'),
  'too many open meet-ups': msg('You have ten meet-ups open. Finish or cancel one first.'),
  'meet-up not found': msg('We could not find that meet-up.'),
  'meet-up cannot be changed': msg('This meet-up can no longer be changed that way.'),
  'invalid duration': msg('Share for between 5 minutes and 3 hours.'),
  'location sharing has ended': msg('Location sharing has ended. Start it again to keep sharing.'),
  'You can save up to 3 trusted contacts.': msg('You can save up to 3 trusted contacts. Remove one first.'),
  trusted_contacts_phone_check: msg('Enter the number in full, with the country code: +234…'),
  trusted_contacts_profile_id_phone_key: msg('That number is already one of your trusted contacts.'),
  'say what was done': msg('Say what was done, so the person knows.'),
  'invalid organisation': msg('Give the organisation a name, and an approval limit of ₦0 or more.'),
  'too many organisations': msg('You can own up to five organisations.'),
  'organisation owners only': msg('Only the organisation\'s owner can do that.'),
  'organisation approvers only': msg('Only the organisation\'s owner or an approver can do that.'),
  'not a member of that organisation': msg('You are not a member of that organisation.'),
  'too many members': msg('An organisation can have up to 50 members.'),
  'invalid request': msg('Give the request a title, and each line a description and a quantity.'),
  supplier_not_verified: msg('This buyer only accepts quotes from verified suppliers. Verify your ID or business first.'),
  supplier_blocked: msg('This organisation does not buy from that supplier.'),
  'purchase order not found': msg('We could not find that purchase order.'),
  'purchase order cannot be changed': msg('This purchase order has moved on. Refresh to see where it stands.'),
  'hold reason required': msg('Say what is wrong, in at least a sentence.'),
  'invalid stock lines': msg('Choose your own products and quantities above zero.'),
  'invalid received lines': msg('Give each line a name and a whole quantity of zero or more, with at least one above zero.'),
  'purchase order not delivered yet': msg('The supplier has not marked this order delivered yet.'),
  'already received into stock': msg('This order is already in your stock records.'),
  'stock item not found': msg('We could not find that stock item.'),
  'invalid stock item': msg('Give the item a name, a unit, and a reorder level of zero or more.'),
  'too many stock items': msg('You can keep up to 500 stock items.'),
  'invalid stock quantity': msg('Enter a whole quantity of zero or more.'),
  'not enough on hand': msg('There is not that much on hand. Count the stock if the figure is wrong.'),
  'count note required': msg('Say why the count changed, for example "Friday store count".'),
  'lesson has no content': msg('This lesson has not been written yet, so it cannot be completed.'),
  'finish the lessons first': msg('Finish every lesson before taking the quiz.'),
  'course has no quiz': msg('This course has no quiz.'),
  'answer every question': msg('Answer every question before sending.'),
  'too many quiz attempts': msg('You have used three attempts today. Review the lessons and try again tomorrow.'),
  'invalid course': msg('Give the course a title, and every lesson a title.'),
  quiz_questions_check: msg('Every question needs two to six options and one marked correct.'),
  'verification required to post': msg('Verify your ID before posting an internship, so applicants know who they are dealing with.'),
  'too many open internships': msg('You have 20 internships open. Close one first.'),
  'internship is closed': msg('This internship is no longer taking applications.'),
  'cannot apply to your own internship': msg('That is your own listing.'),
  'cover note required': msg('Write at least a couple of sentences about why you are applying.'),
  internship_applications_internship_id_applicant_id_key: msg('You have already applied to this internship.'),
  'application not found': msg('We could not find that application.'),
  'application already decided': msg('That application has already been decided.'),
  'invalid post': msg('Choose a story or a reel.'),
  'too many posts': msg('You have reached the limit: ten stories at a time, fifty reels. Remove one first.'),
  'post not found': msg('That post is no longer available.'),
  'invalid stream link': msg('Paste the secure (https) link where people watch your stream.'),
  'too many products': msg('A stream can show up to 20 products.'),
  'too many streams': msg('You have five streams scheduled or live. End one first.'),
  'live video used up': msg('Live video inside FindWork is used up for this month. Stream with a YouTube link instead.'),
  'live video allowance used': msg('You have used this month’s live video inside FindWork. Stream with a YouTube link instead until it resets.'),
  'invalid live video policy': msg('Check the live video limits: each must be a whole number in range, and the seller share no more than the plan.'),
  'stream not found': msg('We could not find that stream.'),
  'stream cannot be changed': msg('This stream has moved on. Refresh to see where it stands.'),
  'stream is not live': msg('The chat opens when the stream is live.'),
  'invalid message': msg('Write a message of up to 300 characters.'),
  'slow down': msg('Give it a moment before sending another message.'),
  'message not found': msg('That message is no longer there.'),
  'too many invites': msg('You have invited ten providers to this job already.'),
  'thread not found': msg('We could not find that conversation.'),
  verification_limit: msg('That is more than your daily limit. Verify your ID or business to raise it.'),
  'invalid registration number': msg('Check the CAC number: for example RC1234567 or BN1234567.'),
  'invalid business name': msg('Enter the registered business name.'),
  'rejection reason required': msg('Say why, so they know what to fix.'),
  'verification not found': msg('We could not find that submission.'),
  mfa_required: msg('Enter the code from your authenticator app to continue.'),
  account_suspended: msg('Your account is suspended. Contact support from Settings to resolve it.'),
  counterparty_suspended: msg('This person is not available on FindWork right now.'),
  'cannot change your own account': msg('You cannot change your own account. Ask another admin.'),
  'suspension reason required': msg('Give a reason of 3 to 500 characters.'),
  'alert already reviewed': msg('Someone on the team has already reviewed that alert.'),
  'dispute already resolved': msg('This dispute has been resolved. Refresh to see the outcome.'),
  'not a dispute participant': msg('Only the people involved and FindWork moderators can respond.'),
  'invalid response evidence': msg('Upload your own JPG, PNG, WebP or GIF photos, up to 8 MB each.'),
  'invalid response': msg('Add a response of up to 2,000 characters or up to four photos.'),
  quote_changed: msg('This quote has changed. Go back and review the latest terms before continuing.'),
  'quote unavailable': msg('This quote was withdrawn or is no longer available.'),
  'quote text too long': msg('Keep your message under 2,000 characters and your start date under 100 characters.'),
  'address not found': msg('That address is no longer available. Refresh your address book.'),
  'You can save up to 20 addresses.': msg('You can save up to 20 addresses. Delete an old one first.'),
  'portfolio item not found': msg('That portfolio item is no longer available. Refresh and try again.'),
  'You can publish up to 20 portfolio items.': msg('You can publish up to 20 portfolio items. Remove an old item first.'),
  'invalid media path': msg('That file cannot be used. Upload a file from your own account.'),
  'invalid media file': msg('The file is unavailable or too large. Upload it again (40 MB maximum).'),
  'unsupported media type': msg('Choose a supported image, video or PDF for this item type.'),
  insufficient_balance: msg('Not enough money in your wallet. Top up and try again.'),
  dispute_open: msg('A dispute is open on this. The money stays on hold until our team resolves it.'),
  listing_limit_reached: msg('Your plan allows 3 live services. Pause one, or upgrade for unlimited listings.'),
  '23P01': msg('That time slot was just taken. Please pick another.'),
  '23505': msg('That already exists.'),
  '23503': msg('Something this depends on is missing. Please refresh and try again.'),
  '42501': msg('You do not have permission to do that.'),
  'provider not found': msg('This provider is no longer available.'),
  'provider is not taking bookings': msg('This provider is not taking bookings right now.'),
  'provider is closed that day': msg('This provider does not work on that day. Pick another.'),
  'cannot book a time in the past': msg('That time has already passed. Pick a later one.'),
  'cannot book yourself': msg('You cannot book your own services.'),
  'package is paused': msg('That service is paused by the provider.'),
  'package not found': msg('That service is no longer available.'),
  'booking not found': msg('We could not find that booking.'),
  'not your booking': msg('You do not have permission to change this booking.'),
  'booking already answered': msg('This booking has already been accepted or declined.'),
  'booking already started': msg('This booking has already started. If something is wrong, open a dispute.'),
  'booking cannot be cancelled': msg('This booking can no longer be cancelled.'),
  'booking cannot be rescheduled': msg('This booking can no longer be rescheduled.'),
  'choose a different time': msg('Choose a time different from the current booking.'),
  'too far ahead': msg('Choose a time within the next 90 days.'),
  'reason too long': msg('Keep your reason under 500 characters.'),
  'reschedule already pending': msg('There is already a proposed time. Respond to it or withdraw it first.'),
  'reschedule already answered': msg('This time change is no longer pending. Refresh to see the latest schedule.'),
  'reschedule not found': msg('We could not find that time change.'),
  'only the other participant can respond': msg('Only the other person can accept or decline your proposed time.'),
  'booking is not active': msg('The provider has not accepted this booking yet.'),
  'booking is closed': msg('This booking is already finished, so there is nothing to dispute.'),
  'order already dispatched': msg('This order is already on its way, so it cannot be cancelled.'),
  'order is closed': msg('This order is already closed.'),
  'address required': msg('Add a delivery address first.'),
  'product not found': msg('Something in your cart is no longer sold. Remove it and try again.'),
  checkout_total_changed: msg('Your cart total changed. Review the updated total before paying.'),
  seller_refund_insufficient_balance: msg('The seller wallet cannot cover this return yet. The dispute remains open; recover the funds before retrying.'),
  'not enough stock': msg('There is not enough stock for this cart. Update the quantities and try again.'),
  'cannot buy your own goods': msg('That is one of your own products. Remove it from your cart to check out.'),
  'order not found': msg('We could not find that order.'),
  'not your order': msg('You do not have permission to change this order.'),
  products_name_length: msg('Give the product a name of 2 to 120 characters.'),
  products_price_positive: msg('Set a price above ₦0.'),
  products_stock_check: msg('Stock cannot be less than zero.'),
  products_description_length: msg('Keep the description under 2,000 characters.'),
  products_photo_limit: msg('A product can have up to 6 photos.'),
  'payment is not awaiting a refund': msg('That payment has already been dealt with.'),
  already_verified: msg('Your account is already verified.'),
  verification_pending: msg('We are already checking your ID. We will let you know when it is done.'),
  'invalid id number': msg('Check the ID number: a NIN or BVN is 11 digits.'),
  'invalid id type': msg('Choose the type of ID you are sending.'),
  'verification photos missing': msg('Add a photo of your ID and a selfie, then send again.'),
  'verification already reviewed': msg('Someone on the team has already checked this one.'),
  'invalid quantity': msg('Quantities must be between 1 and 99.'),
  'cart is empty': msg('Your cart is empty.'),
  'not your job': msg('You do not have permission to change this job.'),
  'job is closed': msg('This job is closed.'),
  'not your RFQ': msg('You do not have permission to change this RFQ.'),
  'RFQ is closed': msg('This RFQ is closed.'),
  'plan not found': msg('That plan is no longer available.'),
  'quote not found': msg('We could not find that quote.'),
  'not enrolled': msg('Enrol in the course first.'),
  'add a bank account first': msg('Add the bank account to pay into first.'),
  'payout in progress': msg('Paystack is still sending this one. Wait for its answer, or take it back after an hour once you have checked the Paystack dashboard.'),
  'payout account not confirmed': msg('Their bank account has not been confirmed with Paystack, so it can only be paid by hand.'),
  'automatic payouts not configured': msg('Automatic payouts are not set up yet. Send this one by hand.'),
  'invalid payout policy': msg('Set a limit between ₦1,000 and ₦10,000,000.'),
  'card not found': msg('We could not find that card. It may already have been removed.'),
  already_on_plan: msg('You are already on this plan.'),
  payments_not_configured: msg('Card payments are not switched on yet. Pay from your wallet, or try again later.'),
  invalid_checkout: msg('Check your cart and delivery details, then try again.'),
  account_not_found: msg('That bank has no account with that number. Check both and try again.'),
  'minimum withdrawal': msg('The minimum withdrawal is ₦1,000.'),
  'cannot message yourself': msg('That is you.'),
  'admins only': msg('Only FindWork staff can do that.'),
  'reason required': msg('Tell us what went wrong.'),
  'Invalid login credentials': msg('That email, phone or password is not right.'),
  'User already registered': msg('An account with those details already exists. Sign in instead.'),

  // Supabase Auth error codes. Phone sign-in needs an SMS provider
  // (Twilio and friends) configured on the project, and costs money per
  // message, so it is off until someone switches it on.
  phone_provider_disabled: msg('Phone sign-in is not available yet. Use your email address for now.'),
  sms_send_failed: msg('We could not text that number. Check it and try again, or use your email address.'),
  // From the send-sms hook: codes are only texted to countries the business serves.
  sms_country_not_supported: msg('We can only text codes to Nigerian numbers for now. Use your email address instead.'),
  email_provider_disabled: msg('Email sign-up is not switched on yet.'),
  signup_disabled: msg('New accounts are closed at the moment.'),
  over_sms_send_rate_limit: msg('Too many codes sent. Wait a few minutes and try again.'),
  over_email_send_rate_limit: msg('Too many emails sent. Wait a few minutes and try again.'),
  over_request_rate_limit: msg('Too many attempts. Wait a minute and try again.'),
  // Supabase's built-in mailer only writes to the project's own team. Real
  // sign-ups need a custom SMTP sender set up in the dashboard.
  email_address_not_authorized: msg('We cannot send email to that address yet. Please try again later.'),
  'Database error saving new user': msg('We could not finish creating your account. Please try again.'),
  otp_expired: msg('That code has expired. Ask for a new one.'),
  invalid_credentials: msg('That email, phone or password is not right.'),
  user_already_exists: msg('An account with those details already exists. Sign in instead.'),
  email_not_confirmed: msg('Confirm your email address first — check your inbox.'),
  weak_password: msg('Choose a stronger password: at least 8 characters, including a number.'),
  // Supabase rejects throwaway domains such as example.com outright.
  email_address_invalid: msg('That email address was not accepted. Use a real one you can open.'),
  validation_failed: msg('Check the details you entered and try again.'),
  'Unsupported provider': msg('That sign-in option is not available yet. Use your email address.'),
  same_password: msg('That is your current password. Choose a different one.'),
  'Phone signups are disabled': msg('Phone sign-in is not available yet. Use your email address for now.'),
  'Unsupported phone provider': msg('Phone sign-in is not available yet. Use your email address for now.'),
  'Signups not allowed': msg('New accounts are closed at the moment.'),
}

export function friendlyError(error: unknown): string {
  if (!error) return msg('Something went wrong. Please try again.')
  const err = error as { message?: string; code?: string }
  if (err.code && FRIENDLY_ERRORS[err.code]) return FRIENDLY_ERRORS[err.code]
  if (err.message) {
    for (const [needle, friendly] of Object.entries(FRIENDLY_ERRORS)) {
      if (err.message.includes(needle)) return friendly
    }
    if (err.message.includes('Failed to fetch')) {
      return msg('No connection. Check your network and try again.')
    }
  }
  // Errors raised in the app itself (validation, Edge Function messages)
  // are already written for the user.
  if (error instanceof Error && !(error as { code?: string }).code && error.message) {
    return error.message
  }
  return 'Something went wrong. Please try again.'
}
