-- Exercises every money-moving RPC and permission rule as the users who
-- would call them, against the seed data. Runs inside one transaction and
-- rolls back, so it is safe to run against any database that has been
-- seeded — local or a staging project — but never production.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/checks/business_rules.sql
--
-- Each check raises on failure; reaching the final line means all passed.

begin;

-- ---- helpers ----------------------------------------------------------------

-- Balances are read as the owner so a check can look at any wallet, not
-- just the one the current user is allowed to see.
create function pg_temp.balance(p uuid) returns bigint language sql security definer as
  $$ select balance from public.wallet_summary(p) $$;
create function pg_temp.escrow(p uuid) returns bigint language sql security definer as
  $$ select escrow_held from public.wallet_summary(p) $$;
create function pg_temp.eq(label text, got anyelement, want anyelement) returns void language plpgsql as $$
begin
  if got is distinct from want then
    raise exception 'FAIL %: got %, want %', label, got, want;
  end if;
  raise notice 'ok  %', label;
end $$;

-- Runs p_sql and passes only if it raises an error whose message contains p_expect.
create function pg_temp.fails(label text, p_sql text, p_expect text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if position(p_expect in sqlerrm) > 0 or sqlstate = p_expect then
      raise notice 'ok  % (%)', label, sqlerrm;
      return;
    end if;
    raise exception 'FAIL %: expected "%", got "%" (%)', label, p_expect, sqlerrm, sqlstate;
  end;
  raise exception 'FAIL %: expected an error containing "%"', label, p_expect;
end $$;

grant execute on all functions in schema pg_temp to authenticated, service_role;

-- Well-known seed ids.
\set customer '''00000000-0000-0000-0000-000000000001'''
\set ada      '''00000000-0000-0000-0000-000000000002'''
\set chidi    '''00000000-0000-0000-0000-000000000003'''
\set mama     '''00000000-0000-0000-0000-000000000005'''
\set tunde    '''00000000-0000-0000-0000-000000000006'''
\set admin    '''00000000-0000-0000-0000-000000000010'''

-- Next Monday 10:00 and next Sunday 10:00, Lagos time.
create temp table t_when as
select
  (date_trunc('week', now() at time zone 'Africa/Lagos') + interval '7 days 10 hours') at time zone 'Africa/Lagos' as monday,
  (date_trunc('week', now() at time zone 'Africa/Lagos') + interval '13 days 10 hours') at time zone 'Africa/Lagos' as sunday;
grant select on t_when to authenticated;

create temp table t_ids (k text primary key, v uuid);
grant all on t_ids to authenticated, service_role;

select id as ready_to_wear from public.provider_packages
where provider_id = :ada and name = 'Ready-to-wear, single piece' \gset
select id as aso_ebi from public.provider_packages
where provider_id = :ada and name = 'Aso-ebi set, per person' \gset

-- ==== 1. Privileges ==========================================================

select set_config('request.jwt.claim.sub', :customer, true);
set local role authenticated;

select pg_temp.fails('customer cannot make themselves admin',
  $$ update public.profiles set is_admin = true where id = auth.uid() $$, 'permission denied');
select pg_temp.fails('customer cannot read other users'' email',
  $$ select email from public.profiles where id = '00000000-0000-0000-0000-000000000002' $$, 'permission denied');
select pg_temp.eq('customer reads own profile via get_my_profile',
  (select email from public.get_my_profile()), 'ada@findwork.africa');
select pg_temp.fails('customer cannot anonymise someone else',
  $$ select public.anonymise_profile('00000000-0000-0000-0000-000000000002') $$, 'permission denied');
select pg_temp.fails('customer cannot fabricate a notification',
  $$ select public.notify('00000000-0000-0000-0000-000000000002', 'system', 'x') $$, 'permission denied');
select pg_temp.fails('customer cannot credit their own wallet',
  $$ select public.credit_topup('x', 100) $$, 'permission denied');
select pg_temp.fails('customer cannot self-declare a verified provider profile',
  $$ insert into public.provider_profiles (id, business_name, category, location, verified)
     values (auth.uid(), 'Me', 'Tailoring', 'Yaba', true) $$, 'permission denied');
select pg_temp.fails('customer cannot use admin tools',
  $$ select public.admin_adjust_balance(auth.uid(), 1000000, 'free money') $$, 'admins only');

reset role;
select set_config('request.jwt.claim.sub', :ada, true);
set local role authenticated;
select pg_temp.fails('provider cannot set their own rating',
  $$ update public.provider_profiles set rating = 5.0 where id = auth.uid() $$, 'permission denied');
select pg_temp.fails('provider cannot verify themselves',
  $$ update public.provider_profiles set verified = true where id = auth.uid() $$, 'permission denied');

-- ==== 2. Booking: pay, accept, complete, review ==============================

reset role;
select set_config('request.jwt.claim.sub', :customer, true);
set local role authenticated;

select pg_temp.eq('customer starts with seeded balance', pg_temp.balance(auth.uid()), 48200::bigint);

insert into t_ids
select 'b1', public.pay_booking(:ada, :'ready_to_wear', (select monday from t_when));

select pg_temp.eq('booking price comes from the package',
  (select price from public.bookings where id = (select v from t_ids where k = 'b1')), 12000);
select pg_temp.eq('booking starts pending',
  (select status from public.bookings where id = (select v from t_ids where k = 'b1')), 'pending');
select pg_temp.eq('price + 5% fee leaves balance', pg_temp.balance(auth.uid()), (48200 - 12600)::bigint);
select pg_temp.eq('and holds it in escrow', pg_temp.escrow(auth.uid()), 12600::bigint);

select pg_temp.fails('cannot book a provider on a closed day',
  format($$ select public.pay_booking(%L, %L, %L) $$, :ada, :'ready_to_wear', (select sunday from t_when)),
  'closed that day');
select pg_temp.fails('cannot release escrow before the provider accepts',
  format($$ select public.complete_booking(%L) $$, (select v from t_ids where k = 'b1')), 'not active');

-- Another customer tries the same slot.
reset role;
select set_config('request.jwt.claim.sub', :admin, true);
set local role authenticated;
select public.admin_adjust_balance(:tunde, 50000, 'Test funds');
reset role;
select set_config('request.jwt.claim.sub', :tunde, true);
set local role authenticated;
select pg_temp.fails('double booking the same slot is impossible',
  format($$ select public.pay_booking(%L, %L, %L) $$, :ada, :'ready_to_wear', (select monday from t_when)),
  '23P01');

reset role;
select set_config('request.jwt.claim.sub', :customer, true);
set local role authenticated;
select pg_temp.fails('customer cannot accept their own booking',
  format($$ select public.respond_to_booking(%L, true) $$, (select v from t_ids where k = 'b1')), 'not your booking');

reset role;
select set_config('request.jwt.claim.sub', :ada, true);
set local role authenticated;
select public.respond_to_booking((select v from t_ids where k = 'b1'), true);
select pg_temp.eq('provider accepted',
  (select status from public.bookings where id = (select v from t_ids where k = 'b1')), 'active');

reset role;
select set_config('request.jwt.claim.sub', :customer, true);
set local role authenticated;
select public.complete_booking((select v from t_ids where k = 'b1'));
select pg_temp.eq('customer escrow cleared on release', pg_temp.escrow(auth.uid()), 0::bigint);
select pg_temp.eq('provider paid price less 6% free-plan commission', pg_temp.balance(:ada), (12000 - 720)::bigint);

insert into public.reviews (booking_id, reviewer_id, provider_id, rating, body)
values ((select v from t_ids where k = 'b1'), auth.uid(), :ada, 4, 'Good work, a day late.');
select pg_temp.fails('only one review per booking',
  format($$ insert into public.reviews (booking_id, reviewer_id, provider_id, rating)
            values (%L, auth.uid(), %L, 5) $$, (select v from t_ids where k = 'b1'), :ada), '23505');

-- ==== 3. Decline and cancel both refund in full ==============================

insert into t_ids select 'b2', public.pay_booking(:ada, :'aso_ebi', (select monday from t_when) + interval '1 day');
select pg_temp.eq('second booking held', pg_temp.escrow(auth.uid()), 29925::bigint);

reset role;
select set_config('request.jwt.claim.sub', :ada, true);
set local role authenticated;
select public.respond_to_booking((select v from t_ids where k = 'b2'), false);

reset role;
select set_config('request.jwt.claim.sub', :customer, true);
set local role authenticated;
select pg_temp.eq('declined booking refunded', pg_temp.balance(auth.uid()), 35600::bigint);
select pg_temp.eq('and nothing left in escrow', pg_temp.escrow(auth.uid()), 0::bigint);

insert into t_ids select 'b3', public.pay_booking(:ada, :'ready_to_wear', (select monday from t_when) + interval '2 days');
select public.cancel_booking((select v from t_ids where k = 'b3'));
select pg_temp.eq('cancelled booking refunded', pg_temp.balance(auth.uid()), 35600::bigint);

-- ==== 4. Disputes freeze escrow until an admin settles them ==================

insert into t_ids select 'b4', public.pay_booking(:ada, :'ready_to_wear', (select monday from t_when) + interval '3 days');
reset role;
select set_config('request.jwt.claim.sub', :ada, true);
set local role authenticated;
select public.respond_to_booking((select v from t_ids where k = 'b4'), true);

reset role;
select set_config('request.jwt.claim.sub', :tunde, true);
set local role authenticated;
select pg_temp.fails('a stranger cannot dispute someone else''s booking',
  format($$ select public.open_dispute('booking', %L, 'x') $$, (select v from t_ids where k = 'b4')), 'booking not found');

reset role;
select set_config('request.jwt.claim.sub', :customer, true);
set local role authenticated;
insert into t_ids select 'd1', public.open_dispute('booking', (select v from t_ids where k = 'b4'), 'Work not completed');
select pg_temp.fails('escrow cannot be released during a dispute',
  format($$ select public.complete_booking(%L) $$, (select v from t_ids where k = 'b4')), 'dispute_open');
select pg_temp.fails('nor cancelled',
  format($$ select public.cancel_booking(%L) $$, (select v from t_ids where k = 'b4')), 'dispute_open');

reset role;
select set_config('request.jwt.claim.sub', :ada, true);
set local role authenticated;
select pg_temp.eq('the provider can see the dispute against them',
  (select count(*) from public.disputes where id = (select v from t_ids where k = 'd1')), 1::bigint);

reset role;
select set_config('request.jwt.claim.sub', :admin, true);
set local role authenticated;
select public.resolve_dispute((select v from t_ids where k = 'd1'), 'refund', 'Provider did not show up.');

reset role;
select set_config('request.jwt.claim.sub', :customer, true);
set local role authenticated;
select pg_temp.eq('refund outcome returns escrow', pg_temp.balance(auth.uid()), 35600::bigint);
select pg_temp.eq('refunded booking is cancelled',
  (select status from public.bookings where id = (select v from t_ids where k = 'b4')), 'cancelled');

-- ==== 5. Posted job → quote → accepted booking ===============================

insert into public.job_posts (customer_id, title, description, budget)
values (auth.uid(), 'Fix a leaking tap', 'Kitchen tap drips all night.', 10000);
insert into t_ids select 'job', id from public.job_posts where title = 'Fix a leaking tap';

reset role;
select set_config('request.jwt.claim.sub', :tunde, true);
set local role authenticated;
select pg_temp.fails('only providers can quote',
  format($$ insert into public.sent_quotes (job_id, provider_id, price, days) values (%L, auth.uid(), 9000, 1) $$,
    (select v from t_ids where k = 'job')), 'row-level security');

reset role;
select set_config('request.jwt.claim.sub', :chidi, true);
set local role authenticated;
insert into public.sent_quotes (job_id, provider_id, price, days, message)
values ((select v from t_ids where k = 'job'), auth.uid(), 9000, 1, 'Can come tomorrow.');

reset role;
select set_config('request.jwt.claim.sub', :customer, true);
set local role authenticated;
select pg_temp.eq('job counts its quotes',
  (select quote_count from public.job_posts where id = (select v from t_ids where k = 'job')), 1);
insert into t_ids
select 'b5', public.accept_job_quote(
  (select id from public.sent_quotes where job_id = (select v from t_ids where k = 'job')),
  (select monday from t_when) + interval '4 days', 1);
select pg_temp.eq('accepted quote books at the quoted price',
  (select price from public.bookings where id = (select v from t_ids where k = 'b5')), 9000);
select pg_temp.eq('and closes the job',
  (select status from public.job_posts where id = (select v from t_ids where k = 'job')), 'closed');

-- ==== 6. Orders ==============================================================

select pg_temp.fails('quantity must be sensible',
  $$ select public.place_order('[{"product_id":"palm-oil","qty":0}]', 'standard', 'Yaba', '') $$, 'invalid quantity');
select pg_temp.fails('unknown products are rejected, not skipped',
  $$ select public.place_order('[{"product_id":"nope","qty":1}]', 'standard', 'Yaba', '') $$, 'product not found');

select pg_temp.eq('the quote is what checkout shows',
  public.checkout_quote('[{"product_id":"ankara-wax-print","qty":2}]', 'standard') - 'coupon' - 'discount',
  '{"items_total": 19600, "delivery_fee": 1200, "seller_count": 1, "total": 20800}'::jsonb);
select pg_temp.fails('a total the customer was not shown is refused',
  $$ select public.place_order('[{"product_id":"ankara-wax-print","qty":2}]', 'standard', 'Yaba', '', 19600) $$,
  'checkout_total_changed');

select pg_temp.balance(auth.uid()) as before_order \gset
insert into t_ids
select 'o1', (public.place_order('[{"product_id":"ankara-wax-print","qty":2}]', 'standard', '14 Herbert Macaulay Way', '08034129087', 20800))[1];
select pg_temp.eq('order total is catalog price x qty + delivery',
  (select total from public.orders where id = (select v from t_ids where k = 'o1')), 9800 * 2 + 1200);
select public.cancel_order((select v from t_ids where k = 'o1'));
select pg_temp.eq('cancelled order refunded', pg_temp.balance(auth.uid()), :before_order::bigint);

insert into t_ids
select 'o2', (public.place_order('[{"product_id":"palm-oil","qty":1}]', 'same-day', '14 Herbert Macaulay Way', '', 11200 + 1800))[1];
reset role;
select set_config('request.jwt.claim.sub', :admin, true);
set local role authenticated;
select public.admin_set_order_status((select v from t_ids where k = 'o2'), 'dispatched');
reset role;
select set_config('request.jwt.claim.sub', :customer, true);
set local role authenticated;
select pg_temp.fails('dispatched orders cannot be cancelled',
  format($$ select public.cancel_order(%L) $$, (select v from t_ids where k = 'o2')), 'already dispatched');

-- ==== 7. Learning ============================================================

select pg_temp.balance(auth.uid()) as before_course \gset
select public.enroll_in_course('pattern-cutting-basics');
select public.enroll_in_course('pattern-cutting-basics');
select pg_temp.eq('paid course charged exactly once', pg_temp.balance(auth.uid()), (:before_course - 8000)::bigint);
select pg_temp.fails('a lesson nobody has written cannot be completed',
  $$ select public.complete_lesson((select id from public.course_lessons where course_id = 'pattern-cutting-basics' and position = 1)) $$,
  'lesson has no content');
reset role;
update public.course_lessons set body = 'Measure twice. Mark the grain line before you cut.' where course_id = 'pattern-cutting-basics';
select set_config('request.jwt.claim.sub', :customer, true);
set local role authenticated;
select pg_temp.eq('one of four lessons is 25%',
  public.complete_lesson((select id from public.course_lessons where course_id = 'pattern-cutting-basics' and position = 1)), 25);
select pg_temp.eq('completing the same lesson again changes nothing',
  public.complete_lesson((select id from public.course_lessons where course_id = 'pattern-cutting-basics' and position = 1)), 25);
select pg_temp.fails('cannot complete lessons without enrolling',
  $$ select public.complete_lesson((select id from public.course_lessons where course_id = 'plumbing-safety-cert' limit 1)) $$,
  'not enrolled');

-- ==== 8. Plans: commission and listing limit =================================

reset role;
select set_config('request.jwt.claim.sub', :ada, true);
set local role authenticated;
select pg_temp.balance(auth.uid()) as ada_pre_plan \gset
select public.subscribe_plan('pro');
select public.subscribe_plan('pro');
select pg_temp.eq('asking for the same upgrade twice charges once',
  pg_temp.balance(auth.uid()), (:ada_pre_plan - 4500)::bigint);
select pg_temp.eq('plan shows on the provider profile',
  (select plan from public.provider_profiles where id = auth.uid()), 'pro');

-- Sections 5–7 spent most of the customer's wallet.
reset role;
select set_config('request.jwt.claim.sub', :admin, true);
set local role authenticated;
select public.admin_adjust_balance(:customer, 50000, 'Test funds');

reset role;
select set_config('request.jwt.claim.sub', :customer, true);
set local role authenticated;
insert into t_ids select 'b6', public.pay_booking(:ada, :'ready_to_wear', (select monday from t_when) + interval '7 days');
reset role;
select set_config('request.jwt.claim.sub', :ada, true);
set local role authenticated;
select pg_temp.balance(auth.uid()) as ada_before \gset
select public.respond_to_booking((select v from t_ids where k = 'b6'), true);
reset role;
select set_config('request.jwt.claim.sub', :customer, true);
set local role authenticated;
select public.complete_booking((select v from t_ids where k = 'b6'));
select pg_temp.eq('Pro provider pays 4%, not 6%', pg_temp.balance(:ada), (:ada_before + 12000 - 480)::bigint);

reset role;
select set_config('request.jwt.claim.sub', :mama, true);
set local role authenticated;
insert into public.provider_packages (provider_id, name, price) values
  (auth.uid(), 'One', 1000), (auth.uid(), 'Two', 1000), (auth.uid(), 'Three', 1000);
select pg_temp.fails('Free plan is capped at three live listings',
  $$ insert into public.provider_packages (provider_id, name, price) values (auth.uid(), 'Four', 1000) $$,
  'listing_limit_reached');

-- ==== 9. Top-ups are credited once, by the server only =======================

reset role;
set local role service_role;
insert into public.payment_intents (profile_id, reference, amount) values (:customer, 'test-ref-1', 5000);
select pg_temp.balance(:customer) as before_topup \gset
select pg_temp.eq('webhook credits the wallet', public.credit_topup('test-ref-1', 500000), true);
select pg_temp.eq('a second delivery of the same event does not', public.credit_topup('test-ref-1', 500000), false);
select pg_temp.eq('balance rose once', pg_temp.balance(:customer), (:before_topup + 5000)::bigint);
insert into public.payment_intents (profile_id, reference, amount) values (:customer, 'test-ref-2', 5000);
select pg_temp.fails('an amount that does not match the intent is refused',
  $$ select public.credit_topup('test-ref-2', 100) $$, 'amount mismatch');

-- ==== 10. Withdrawals ========================================================

reset role;
select set_config('request.jwt.claim.sub', :ada, true);
set local role authenticated;
select pg_temp.fails('no withdrawal without a bank account',
  $$ select public.request_withdrawal(5000) $$, 'add a bank account first');
insert into public.payout_accounts (profile_id, bank_name, account_number, account_name)
values (auth.uid(), 'GTBank', '0123456789', 'Ada Tailoring Ltd');
select pg_temp.balance(auth.uid()) as ada_pre_withdraw \gset
insert into t_ids select 'w1', public.request_withdrawal(5000);
select pg_temp.eq('withdrawal leaves the balance at once', pg_temp.balance(auth.uid()), (:ada_pre_withdraw - 5000)::bigint);

reset role;
select set_config('request.jwt.claim.sub', :admin, true);
set local role authenticated;
select public.admin_process_withdrawal((select v from t_ids where k = 'w1'), false, 'Account name did not match');
select pg_temp.eq('rejected withdrawal is reversed', pg_temp.balance(:ada), :ada_pre_withdraw::bigint);

-- ==== 11. Chat, reports, support =============================================

reset role;
select set_config('request.jwt.claim.sub', :customer, true);
set local role authenticated;
insert into t_ids select 'thread', public.get_or_create_thread(:ada);
select pg_temp.eq('the other person in a thread is visible',
  (select count(*) from public.thread_participants
   where thread_id = (select v from t_ids where k = 'thread') and profile_id <> auth.uid()), 1::bigint);
select pg_temp.fails('cannot open a thread with yourself',
  $$ select public.get_or_create_thread(auth.uid()) $$, 'cannot message yourself');

insert into t_ids select 'ad', id from public.classifieds where title like '1.5HP split AC%';
insert into public.reports (reporter_id, target_type, target_id, reason)
values (auth.uid(), 'classified', (select v from t_ids where k = 'ad')::text, 'Looks like a scam');
insert into public.support_requests (profile_id, topic, message) values (auth.uid(), 'bug', 'Map does not load.');

reset role;
select set_config('request.jwt.claim.sub', :admin, true);
set local role authenticated;
select public.admin_resolve_report((select id from public.reports limit 1), 'remove');
select pg_temp.eq('removed listing is gone',
  (select count(*) from public.classifieds where id = (select v from t_ids where k = 'ad')), 0::bigint);
select public.admin_reply_support((select id from public.support_requests limit 1), 'Fixed in the next build.');

reset role;
select set_config('request.jwt.claim.sub', :customer, true);
set local role authenticated;
select pg_temp.eq('customer sees the support reply',
  (select reply from public.support_requests limit 1), 'Fixed in the next build.');

-- ==== 12. Monthly plan renewal ===============================================

reset role;
update public.subscriptions set renews_at = now() - interval '1 minute' where profile_id = :ada;
select pg_temp.balance(:ada) as ada_pre_renew \gset
select private.renew_subscriptions();
select pg_temp.eq('a due Pro plan is charged from the wallet', pg_temp.balance(:ada), (:ada_pre_renew - 4500)::bigint);
select pg_temp.eq('and pushed a month out',
  (select renews_at > now() + interval '27 days' from public.subscriptions where profile_id = :ada), true);

select public.admin_adjust_balance(:ada, -pg_temp.balance(:ada)::integer, 'Empty for renewal test')
from (select set_config('request.jwt.claim.sub', :admin, true)) s;
update public.subscriptions set renews_at = now() - interval '1 minute' where profile_id = :ada;
select private.renew_subscriptions();
select pg_temp.eq('an unaffordable renewal drops to Free',
  (select plan from public.provider_profiles where id = :ada), 'free');

-- ==== 13. Goods from sellers: escrow, delivery, returns =====================

reset role;
select set_config('request.jwt.claim.sub', :admin, true);
set local role authenticated;
select public.admin_adjust_balance(:customer, 100000, 'Test funds');

reset role;
select set_config('request.jwt.claim.sub', :ada, true);
set local role authenticated;
select pg_temp.fails('a seller cannot list goods at a negative price',
  $$ insert into public.products (id, seller_id, name, price, vendor, status)
     values ('refund-me', auth.uid(), 'Refund me', -10000, 'Ada', 'live') $$, '23514');
insert into public.products (id, seller_id, name, price, vendor, stock)
values ('ada-lace', auth.uid(), 'Lace, 5 yards', 10000, 'FindWork Official', 5);
select pg_temp.fails('nor reprice them to nothing',
  $$ update public.products set price = 0 where id = 'ada-lace' $$, '23514');
select pg_temp.eq('the shop name is the seller''s business, whatever the form said',
  (select vendor from public.products where id = 'ada-lace'),
  (select business_name from public.provider_profiles where id = auth.uid()));
select pg_temp.fails('a seller cannot buy their own goods',
  $$ select public.checkout_quote('[{"product_id":"ada-lace","qty":1}]', 'standard') $$, 'cannot buy your own goods');

-- Supabase grants authenticated these on storage.objects; the stub does not.
reset role;
grant select, insert, update, delete on storage.objects to authenticated;
select set_config('request.jwt.claim.sub', :ada, true);
set local role authenticated;
insert into storage.objects (bucket_id, name) values ('product-images', :ada || '/lace.jpg');
select pg_temp.fails('product photos go only in the seller''s own folder',
  format($$ insert into storage.objects (bucket_id, name) values ('product-images', %L) $$, :chidi || '/lace.jpg'),
  'row-level security');

reset role;
select set_config('request.jwt.claim.sub', :customer, true);
set local role authenticated;
select pg_temp.eq('two sellers in one cart are two deliveries',
  public.checkout_quote('[{"product_id":"ada-lace","qty":1},{"product_id":"palm-oil","qty":1}]', 'standard') - 'coupon' - 'discount',
  '{"items_total": 21200, "delivery_fee": 2400, "seller_count": 2, "total": 23600}'::jsonb);
select pg_temp.fails('a product repeated in the cart is checked against stock in total',
  $$ select public.place_order('[{"product_id":"ada-lace","qty":4},{"product_id":"ada-lace","qty":4}]',
       'standard', 'Yaba', '', 81200) $$, 'not enough stock');

select pg_temp.balance(auth.uid()) as cust_before_s1 \gset
select pg_temp.escrow(auth.uid()) as cust_escrow_before \gset
insert into t_ids
select 's1', (public.place_order('[{"product_id":"ada-lace","qty":2},{"product_id":"ada-lace","qty":1}]',
  'standard', '14 Herbert Macaulay Way', '', 31200))[1];
select pg_temp.eq('repeated lines become one line of three',
  (select array_agg(qty) from public.order_items where order_id = (select v from t_ids where k = 's1')), array[3]);
select pg_temp.eq('and take three from stock',
  (select stock from public.products where id = 'ada-lace'), 2);
select pg_temp.eq('a seller''s order is held in escrow', pg_temp.escrow(auth.uid()), (:cust_escrow_before + 31200)::bigint);

select pg_temp.balance(:ada) as ada_before_sale \gset
reset role;
select set_config('request.jwt.claim.sub', :admin, true);
set local role authenticated;
select public.admin_set_order_status((select v from t_ids where k = 's1'), 'delivered');
select public.admin_set_order_status((select v from t_ids where k = 's1'), 'delivered');
select pg_temp.eq('delivering twice pays the seller once, less 6%',
  pg_temp.balance(:ada), (:ada_before_sale + 30000 - 1800)::bigint);
select pg_temp.eq('and releases the escrow once', pg_temp.escrow(:customer), :cust_escrow_before::bigint);
select pg_temp.fails('a delivered order cannot be sent back to dispatched',
  format($$ select public.admin_set_order_status(%L, 'dispatched') $$, (select v from t_ids where k = 's1')),
  'order is closed');

reset role;
select set_config('request.jwt.claim.sub', :customer, true);
set local role authenticated;
select pg_temp.fails('confirming receipt afterwards pays nobody again',
  format($$ select public.confirm_order_received(%L) $$, (select v from t_ids where k = 's1')), 'order is closed');
insert into t_ids select 'sd1', public.open_dispute('order', (select v from t_ids where k = 's1'), 'Wrong colour');
select pg_temp.fails('an order has one open dispute at a time',
  format($$ select public.open_dispute('order', %L, 'Still wrong') $$, (select v from t_ids where k = 's1')),
  'dispute_open');

reset role;
select set_config('request.jwt.claim.sub', :admin, true);
set local role authenticated;
select public.resolve_dispute((select v from t_ids where k = 'sd1'), 'refund', 'Return approved.');
select pg_temp.eq('a return takes back what the seller was paid', pg_temp.balance(:ada), :ada_before_sale::bigint);
select pg_temp.eq('refunds the customer in full', pg_temp.balance(:customer), :cust_before_s1::bigint);
select pg_temp.eq('and leaves escrow where it was, never negative', pg_temp.escrow(:customer), :cust_escrow_before::bigint);
select pg_temp.eq('the order is returned',
  (select status from public.orders where id = (select v from t_ids where k = 's1')), 'returned');

-- A dispute freezes an unshipped order until it is settled.
reset role;
select set_config('request.jwt.claim.sub', :customer, true);
set local role authenticated;
insert into t_ids select 's2', (public.place_order('[{"product_id":"ada-lace","qty":1}]',
  'standard', '14 Herbert Macaulay Way', '', 11200))[1];
insert into t_ids select 'sd2', public.open_dispute('order', (select v from t_ids where k = 's2'), 'Seller stopped replying');
select pg_temp.fails('the customer cannot release a disputed order',
  format($$ select public.confirm_order_received(%L) $$, (select v from t_ids where k = 's2')), 'dispute_open');
reset role;
select set_config('request.jwt.claim.sub', :admin, true);
set local role authenticated;
select pg_temp.fails('nor can an admin deliver it',
  format($$ select public.admin_set_order_status(%L, 'delivered') $$, (select v from t_ids where k = 's2')),
  'dispute_open');
select public.resolve_dispute((select v from t_ids where k = 'sd2'), 'refund', 'Never shipped.');
select pg_temp.eq('refunding an unshipped order puts its stock back',
  (select stock from public.products where id = 'ada-lace'), 2);
select pg_temp.eq('without paying the seller', pg_temp.balance(:ada), :ada_before_sale::bigint);

-- A seller who cannot send an order cancels it; the customer is told why.
reset role;
select set_config('request.jwt.claim.sub', :customer, true);
set local role authenticated;
insert into t_ids select 's4', (public.place_order('[{"product_id":"ada-lace","qty":1}]',
  'standard', '14 Herbert Macaulay Way', '', 11200))[1];
reset role;
select set_config('request.jwt.claim.sub', :ada, true);
set local role authenticated;
select pg_temp.eq('the seller sees the order and where it goes',
  (select delivery_address from public.orders where id = (select v from t_ids where k = 's4')), '14 Herbert Macaulay Way');
select public.cancel_order((select v from t_ids where k = 's4'));
reset role;
select set_config('request.jwt.claim.sub', :customer, true);
set local role authenticated;
select pg_temp.eq('the customer hears the seller cancelled',
  (select title from public.notifications where profile_id = auth.uid() and ref_id = (select v::text from t_ids where k = 's4')),
  'Your order was cancelled');
select pg_temp.eq('and the stock is back on sale', (select stock from public.products where id = 'ada-lace'), 2);

-- A seller who has already withdrawn the money cannot be pushed negative.
insert into t_ids select 's3', (public.place_order('[{"product_id":"ada-lace","qty":1}]',
  'standard', '14 Herbert Macaulay Way', '', 11200))[1];
reset role;
select set_config('request.jwt.claim.sub', :tunde, true);
set local role authenticated;
select pg_temp.fails('only the seller can dispatch their order',
  format($$ select public.dispatch_order(%L) $$, (select v from t_ids where k = 's3')), 'order not found');
reset role;
select set_config('request.jwt.claim.sub', :ada, true);
set local role authenticated;
select public.dispatch_order((select v from t_ids where k = 's3'));
reset role;
select set_config('request.jwt.claim.sub', :customer, true);
set local role authenticated;
select pg_temp.fails('a dispatched order can no longer be cancelled',
  format($$ select public.cancel_order(%L) $$, (select v from t_ids where k = 's3')), 'already dispatched');
select public.confirm_order_received((select v from t_ids where k = 's3'));
select pg_temp.eq('confirming receipt pays the seller',
  (select status from public.orders where id = (select v from t_ids where k = 's3')), 'delivered');
reset role;
select set_config('request.jwt.claim.sub', :ada, true);
set local role authenticated;
insert into t_ids select 'w2', public.request_withdrawal(pg_temp.balance(auth.uid())::integer);
reset role;
select set_config('request.jwt.claim.sub', :customer, true);
set local role authenticated;
insert into t_ids select 'sd3', public.open_dispute('order', (select v from t_ids where k = 's3'), 'Torn');
reset role;
select set_config('request.jwt.claim.sub', :admin, true);
set local role authenticated;
select pg_temp.fails('a return the seller cannot cover is refused, not paid from nowhere',
  format($$ select public.resolve_dispute(%L, 'refund', 'Return approved.') $$, (select v from t_ids where k = 'sd3')),
  'seller_refund_insufficient_balance');
select pg_temp.eq('and the dispute stays open for the team',
  (select status from public.disputes where id = (select v from t_ids where k = 'sd3')), 'open');

reset role;
select pg_temp.fails('the ledger holds one seller payout per order',
  format($$ insert into public.wallet_transactions (profile_id, label, kind, balance_delta, order_id)
            values (%L, 'Sale again', 'release', 9400, %L) $$, :ada, (select v from t_ids where k = 's3')),
  '23505');

-- ==== 14. Account deletion refuses while anything is still owed =============

reset role;
set local role service_role;
select pg_temp.fails('a customer with a job still in progress cannot be deleted',
  format($$ select public.anonymise_profile(%L) $$, :customer), 'open_bookings');
select pg_temp.fails('nor the provider doing it, whose money sits on the customer''s ledger',
  format($$ select public.anonymise_profile(%L) $$, :chidi), 'open_bookings');
select pg_temp.fails('nor anyone with a dispute open',
  format($$ select public.anonymise_profile(%L) $$, :ada), 'open_disputes');
select pg_temp.fails('nor someone with money left in their wallet',
  format($$ select public.anonymise_profile(%L) $$, :tunde), 'balance_outstanding');

reset role;
select set_config('request.jwt.claim.sub', :admin, true);
set local role authenticated;
select public.resolve_dispute((select v from t_ids where k = 'sd3'), 'dismissed', 'Seller will repair it.');
reset role;
set local role service_role;
select pg_temp.fails('a withdrawal not yet sent also blocks it',
  format($$ select public.anonymise_profile(%L) $$, :ada), 'withdrawal_pending');

reset role;
select set_config('request.jwt.claim.sub', :admin, true);
set local role authenticated;
select public.admin_process_withdrawal((select v from t_ids where k = 'w2'), true, null);
reset role;
set local role service_role;
select public.anonymise_profile(:ada);
select pg_temp.eq('once clear, the account is anonymised',
  (select full_name from public.profiles where id = :ada), 'Deleted user');
select pg_temp.eq('and a deleted seller''s goods come off sale',
  (select status from public.products where id = 'ada-lace'), 'hidden');

-- ==== 15. A top-up that lands after deletion is refunded, not credited ======

reset role;
set local role service_role;
insert into public.payment_intents (profile_id, reference, amount) values (:ada, 'late-ref', 5000);
select pg_temp.eq('a payment confirmed after the account was deleted is not credited',
  public.credit_topup('late-ref', 500000), false);
select pg_temp.eq('the deleted wallet stays empty', pg_temp.balance(:ada), 0::bigint);
select pg_temp.eq('the payment waits for a refund',
  (select status from public.payment_intents where reference = 'late-ref'), 'refund_due');
select pg_temp.eq('Paystack retrying changes nothing', public.credit_topup('late-ref', 500000), false);

reset role;
select set_config('request.jwt.claim.sub', :customer, true);
set local role authenticated;
select pg_temp.fails('customers cannot mark refunds',
  format($$ select public.admin_mark_topup_refunded(%L, 'x') $$,
    (select id from public.payment_intents where reference = 'late-ref')), 'admins only');

reset role;
select set_config('request.jwt.claim.sub', :admin, true);
set local role authenticated;
select pg_temp.eq('the team is told',
  (select count(*) from public.notifications where profile_id = auth.uid() and ref_type = 'admin_refund'), 1::bigint);
select pg_temp.fails('a refund is recorded with its reference',
  format($$ select public.admin_mark_topup_refunded(%L, ' ') $$,
    (select id from public.payment_intents where reference = 'late-ref')), 'reason required');
select public.admin_mark_topup_refunded(
  (select id from public.payment_intents where reference = 'late-ref'), 'Refunded in Paystack');
select pg_temp.eq('and marked done once sent back',
  (select status from public.payment_intents where reference = 'late-ref'), 'refunded');
select pg_temp.fails('only once',
  format($$ select public.admin_mark_topup_refunded(%L, 'again') $$,
    (select id from public.payment_intents where reference = 'late-ref')), 'not awaiting a refund');

-- ==== 16. A busy conversation does not push others out of the inbox ========

reset role;
select set_config('request.jwt.claim.sub', :customer, true);
set local role authenticated;
insert into t_ids select 'quiet', public.get_or_create_thread(:chidi);

-- Every message in this transaction shares now(), so spread them out by hand:
-- three from Chidi two hours ago, then 600 in the other thread since.
reset role;
update public.thread_participants set last_read_at = now() - interval '1 day'
where thread_id in ((select v from t_ids where k = 'quiet'), (select v from t_ids where k = 'thread'));
insert into public.chat_messages (thread_id, sender_id, text)
select (select v from t_ids where k = 'quiet'), :chidi, 'Quote ' || n from generate_series(1, 3) n;
insert into public.chat_messages (thread_id, sender_id, text)
select (select v from t_ids where k = 'thread'), :ada, 'Update ' || n from generate_series(1, 600) n;
update public.chat_messages m
set created_at = now() - case when m.thread_id = (select v from t_ids where k = 'quiet')
                              then interval '2 hours' else interval '1 hour' end
                          + (n.i * interval '1 second')
from (select id, row_number() over (order by text) i from public.chat_messages
      where thread_id in ((select v from t_ids where k = 'quiet'), (select v from t_ids where k = 'thread'))) n
where m.id = n.id;

select set_config('request.jwt.claim.sub', :customer, true);
set local role authenticated;
select pg_temp.eq('both conversations are in the inbox',
  (select array_agg(thread_id order by last_message_at desc) from public.chat_inbox()),
  array[(select v from t_ids where k = 'thread'), (select v from t_ids where k = 'quiet')]);
select pg_temp.eq('each with its own unread count',
  (select array_agg(unread order by last_message_at desc) from public.chat_inbox()), array[600, 3]::bigint[]);
select pg_temp.eq('and its own latest message',
  (select last_message->>'text' from public.chat_inbox() where thread_id = (select v from t_ids where k = 'quiet')),
  'Quote 3');
select pg_temp.eq('pages carry on from the last conversation shown',
  (select thread_id from public.chat_inbox(1,
     (select last_message_at from public.chat_inbox(1)), (select thread_id from public.chat_inbox(1)))),
  (select v from t_ids where k = 'quiet'));

reset role;
select set_config('request.jwt.claim.sub', :tunde, true);
set local role authenticated;
select pg_temp.eq('nobody else sees them', (select count(*) from public.chat_inbox()), 0::bigint);

-- ==== 17. Every way of signing up creates a profile =========================

-- Written as the auth service would: the app puts full_name and an E.164
-- phone in metadata; Google and Apple send "name".
reset role;
insert into auth.users (id, phone, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', '2348031234567', '{"full_name": "Bisi Phone", "phone": "+2348031234567"}');
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a2', 'kemi@example.com', '{"name": "Kemi Google"}');
insert into auth.users (id, phone, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a3', '2348059876543', '{}');
select pg_temp.eq('a phone sign-up gets a profile, with no email',
  (select phone || '|' || email from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'),
  '+2348031234567|');
select pg_temp.eq('a Google sign-up keeps the name Google sends',
  (select full_name from public.profiles where id = '00000000-0000-0000-0000-0000000000a2'), 'Kemi Google');
select pg_temp.eq('a bare phone number is stored in E.164',
  (select phone from public.profiles where id = '00000000-0000-0000-0000-0000000000a3'), '+2348059876543');

-- ==== 18. First and last name ================================================

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a4', 'ngozi@example.com',
   '{"first_name": "Ngozi", "last_name": "Eze Obi", "full_name": "Ngozi Eze Obi"}'),
  ('00000000-0000-0000-0000-0000000000a5', 'tolu@example.com',
   '{"given_name": "Tolu", "family_name": "Bakare-Ade", "name": "Tolu Bakare-Ade"}');
select pg_temp.eq('sign-up keeps first and last name as given, a two-word surname included',
  (select first_name || '|' || last_name || '|' || full_name from public.profiles
   where id = '00000000-0000-0000-0000-0000000000a4'), 'Ngozi|Eze Obi|Ngozi Eze Obi');
select pg_temp.eq('Google''s given and family names are used',
  (select first_name || '|' || last_name from public.profiles where id = '00000000-0000-0000-0000-0000000000a5'),
  'Tolu|Bakare-Ade');
select pg_temp.eq('a full name alone, from an older app, is split at the first space',
  (select first_name || '|' || last_name from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'),
  'Bisi|Phone');

select set_config('request.jwt.claim.sub', :customer, true);
set local role authenticated;
select pg_temp.eq('seeded accounts have their names split too',
  (select first_name <> '' and last_name <> '' from public.get_my_profile()), true);
update public.profiles set first_name = 'Adaeze' where id = auth.uid();
select pg_temp.eq('changing your first name changes the name others see',
  (select full_name = 'Adaeze ' || last_name from public.get_my_profile()), true);

reset role;
select set_config('request.jwt.claim.sub', :tunde, true);
set local role authenticated;
select pg_temp.fails('other people see the full name, not its parts',
  format($$ select first_name from public.profiles where id = %L $$, :customer), 'permission denied');

reset role;
select pg_temp.eq('a deleted account keeps no trace of its real name',
  (select first_name || '|' || last_name || '|' || full_name from public.profiles where id = :ada),
  'Deleted|user|Deleted user');

-- ==== 19. Verifying an account ===============================================

reset role;
select set_config('request.jwt.claim.sub', :chidi, true);
set local role authenticated;
select pg_temp.eq('providers verified before keep their status',
  (select verified_at is not null from public.get_my_profile()), true);

reset role;
select set_config('request.jwt.claim.sub', :mama, true);
set local role authenticated;
select pg_temp.eq('an account starts unverified', (select verified_at is null from public.get_my_profile()), true);
select pg_temp.fails('nobody can mark themselves verified',
  $$ update public.profiles set verified_at = now() where id = auth.uid() $$, 'permission denied');
select pg_temp.fails('the photos must be uploaded first',
  format($$ select public.submit_verification('nin', '12345678901', %L, %L) $$, :mama || '/id.jpg', :mama || '/me.jpg'),
  'verification photos missing');
insert into storage.objects (bucket_id, name) values
  ('verification-documents', :mama || '/id.jpg'), ('verification-documents', :mama || '/me.jpg');
select pg_temp.fails('a NIN has 11 digits',
  format($$ select public.submit_verification('nin', '1234', %L, %L) $$, :mama || '/id.jpg', :mama || '/me.jpg'),
  'invalid id number');
select pg_temp.fails('someone else''s photos cannot be sent',
  format($$ select public.submit_verification('nin', '12345678901', %L, %L) $$, :tunde || '/id.jpg', :mama || '/me.jpg'),
  'verification photos missing');
insert into t_ids
select 'v1', public.submit_verification('nin', '123 4567 8901', :mama || '/id.jpg', :mama || '/me.jpg');
select pg_temp.eq('the number is kept without spaces',
  (select id_number from public.verifications where id = (select v from t_ids where k = 'v1')), '12345678901');
select pg_temp.fails('one submission at a time',
  format($$ select public.submit_verification('nin', '12345678901', %L, %L) $$, :mama || '/id.jpg', :mama || '/me.jpg'),
  'verification_pending');
select pg_temp.eq('they can see it is being checked',
  (select status from public.verifications where id = (select v from t_ids where k = 'v1')), 'pending');

reset role;
select set_config('request.jwt.claim.sub', :tunde, true);
set local role authenticated;
select pg_temp.eq('nobody else can see an ID number',
  (select count(*) from public.verifications where id = (select v from t_ids where k = 'v1')), 0::bigint);
select pg_temp.eq('or open the photos',
  (select count(*) from storage.objects where bucket_id = 'verification-documents' and name like :mama || '/%'), 0::bigint);
select pg_temp.fails('or review it',
  format($$ select public.admin_review_verification(%L, true, null) $$, (select v from t_ids where k = 'v1')), 'admins only');

reset role;
select set_config('request.jwt.claim.sub', :admin, true);
set local role authenticated;
select pg_temp.eq('the team sees it, photos included',
  (select count(*) from storage.objects where bucket_id = 'verification-documents' and name like :mama || '/%'), 2::bigint);
select pg_temp.eq('and is told there is one to check',
  (select count(*) from public.notifications where profile_id = auth.uid() and ref_type = 'admin_verification'), 1::bigint);
select pg_temp.fails('a rejection says why',
  format($$ select public.admin_review_verification(%L, false, ' ') $$, (select v from t_ids where k = 'v1')), 'reason required');
select public.admin_review_verification((select v from t_ids where k = 'v1'), false, 'The photo of your ID is blurry.');

reset role;
select set_config('request.jwt.claim.sub', :mama, true);
set local role authenticated;
select pg_temp.eq('they see the reason, and are still unverified',
  (select note || '|' || (select (verified_at is null)::text from public.get_my_profile())
   from public.verifications where id = (select v from t_ids where k = 'v1')),
  'The photo of your ID is blurry.|true');
insert into storage.objects (bucket_id, name) values
  ('verification-documents', :mama || '/id-2.jpg'), ('verification-documents', :mama || '/me-2.jpg');
insert into t_ids
select 'v2', public.submit_verification('passport', 'A12345678', :mama || '/id-2.jpg', :mama || '/me-2.jpg');

reset role;
select set_config('request.jwt.claim.sub', :admin, true);
set local role authenticated;
select pg_temp.fails('an approval cannot be made twice',
  format($$ select public.admin_review_verification(%L, true, null) $$, (select v from t_ids where k = 'v1')),
  'verification already reviewed');
select public.admin_review_verification((select v from t_ids where k = 'v2'), true, null);

reset role;
select set_config('request.jwt.claim.sub', :mama, true);
set local role authenticated;
select pg_temp.eq('once approved, they are verified',
  (select verified_at is not null from public.get_my_profile()), true);
select pg_temp.eq('and their provider badge comes with it',
  (select verified from public.provider_profiles where id = auth.uid()), true);
select pg_temp.eq('and they are told',
  (select count(*) from public.notifications where profile_id = auth.uid() and title = 'You are verified'), 1::bigint);
select pg_temp.fails('there is nothing more to send',
  format($$ select public.submit_verification('nin', '12345678901', %L, %L) $$, :mama || '/id-2.jpg', :mama || '/me-2.jpg'),
  'already_verified');

-- ==== 20. Pinning where you are ==============================================

reset role;
select set_config('request.jwt.claim.sub', :customer, true);
set local role authenticated;
select pg_temp.eq('a pin in Yaba files you under Yaba',
  public.set_my_location(6.51873, 3.37414, 'Yaba College of Technology, Herbert Macaulay Way, Yaba'), 'Yaba');
select pg_temp.eq('and keeps the exact point and address',
  (select lat || ',' || lng || '|' || location_label from public.get_my_profile()),
  '6.51873,3.37414|Yaba College of Technology, Herbert Macaulay Way, Yaba');
update public.profiles set first_name = 'Adaeze', area = 'Yaba' where id = auth.uid();
select pg_temp.eq('editing your name in Settings leaves the pin where it is',
  (select lat::text from public.get_my_profile()), '6.51873');
select pg_temp.fails('a point off the globe is refused',
  $$ select public.set_my_location(123, 3.37, 'Nowhere') $$, 'invalid location');

reset role;
select set_config('request.jwt.claim.sub', :tunde, true);
set local role authenticated;
select pg_temp.fails('nobody else can read where you live',
  format($$ select lat, lng, location_label from public.profiles where id = %L $$, :customer), 'permission denied');

reset role;
select set_config('request.jwt.claim.sub', :customer, true);
set local role authenticated;
update public.profiles set area = 'Ikeja' where id = auth.uid();
select pg_temp.eq('choosing a different area from the list replaces the pin with that area',
  (select area || '|' || lat || '|' || coalesce(location_label, 'no pin') from public.get_my_profile()),
  'Ikeja|6.60180|no pin');
select pg_temp.eq('a pin far from every listed area is kept, with no area',
  coalesce(public.set_my_location(9.0765, 7.3986, 'Wuse II, Abuja'), 'none'), 'none');
select pg_temp.eq('so distances still work from it',
  (select lat::text || '|' || coalesce(area, 'none') from public.get_my_profile()), '9.07650|none');

-- ==== 21. Private saved addresses and defaults ===============================
reset role;
select set_config('request.jwt.claim.sub', :customer, true);
set local role authenticated;
insert into t_ids select 'address1', public.save_address(null, 'Home', 'Ada', '+2348034129087', '14 Test Street, Yaba', false);
insert into t_ids select 'address2', public.save_address(null, 'Work', 'Ada', '+2348034129087', '20 Office Street, Ikeja', true);
select pg_temp.eq('one address is default', (select count(*) from public.saved_addresses where is_default), 1::bigint);
select pg_temp.eq('the chosen default is work', (select label from public.saved_addresses where is_default), 'Work');
select pg_temp.fails('invalid phones are rejected on the server',
  $$ select public.save_address(null, 'Bad', 'Ada', '123', '14 Test Street', true) $$, '23514');
select pg_temp.eq('failed save does not erase the default', (select label from public.saved_addresses where is_default), 'Work');
select pg_temp.fails('addresses cannot be written around the RPC',
  $$ insert into public.saved_addresses(profile_id,label,recipient,phone,address) values(auth.uid(),'x','x','+2348034129087','14 Test Street') $$, 'permission denied');
reset role;
select set_config('request.jwt.claim.sub', :tunde, true);
set local role authenticated;
select pg_temp.eq('another customer sees no addresses', (select count(*) from public.saved_addresses), 0::bigint);
select pg_temp.fails('another customer cannot edit an address',
  format($$ select public.save_address(%L,'Stolen','Tunde','+2348034129087','14 Test Street',true) $$, (select v from t_ids where k = 'address1')), 'address not found');
select pg_temp.fails('another customer cannot delete an address',
  format($$ select public.delete_address(%L) $$, (select v from t_ids where k = 'address1')), 'address not found');
reset role;
select set_config('request.jwt.claim.sub', :customer, true);
set local role authenticated;
select public.delete_address((select v from t_ids where k = 'address2'));
select pg_temp.eq('deleting the default promotes another address', (select label from public.saved_addresses where is_default), 'Home');

-- Account a1 has no financial obligations; anonymising must erase addresses.
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
set local role authenticated;
select public.save_address(null, 'Home', 'Bisi', '+2348034129087', 'Private home address', true);
reset role;
set local role service_role;
select public.anonymise_profile('00000000-0000-0000-0000-0000000000a1');
select pg_temp.eq('account deletion erases saved addresses',
  (select count(*) from public.saved_addresses where profile_id = '00000000-0000-0000-0000-0000000000a1'), 0::bigint);
reset role;
select set_config('request.jwt.claim.sub', :ada, true);
set local role authenticated;
select pg_temp.fails('deleted accounts cannot save new addresses',
  $$ select public.save_address(null,'Home','Deleted','+2348034129087','14 Test Street',true) $$, 'not authenticated');

-- ==== 22. Portfolio file access, validation and credentials ===================
reset role;
insert into storage.objects(bucket_id, name, owner, metadata) values
  ('provider-media', :mama || '/work.mp4', :mama, '{"mimetype":"video/mp4","size":2048}'),
  ('provider-media', :mama || '/credential.pdf', :mama, '{"mimetype":"application/pdf","size":2048}'),
  ('provider-media', :mama || '/unpublished.jpg', :mama, '{"mimetype":"image/jpeg","size":2048}'),
  ('provider-media', :mama || '/large.mp4', :mama, '{"mimetype":"video/mp4","size":41943041}'),
  ('provider-media', :chidi || '/other.jpg', :chidi, '{"mimetype":"image/jpeg","size":2048}');
select set_config('request.jwt.claim.sub', :mama, true);
set local role authenticated;
insert into t_ids select 'media1', public.save_provider_media(null,'video',:mama || '/work.mp4','My work','A finished project');
insert into t_ids select 'media2', public.save_provider_media(null,'certificate',:mama || '/credential.pdf','Training','Self-reported');
select pg_temp.fails('cannot publish someone else''s file',
  format($$ select public.save_provider_media(null,'image',%L,'Other','') $$, :chidi || '/other.jpg'), 'invalid media path');
select pg_temp.fails('video cannot masquerade as an image',
  format($$ select public.save_provider_media(null,'image',%L,'Wrong','') $$, :mama || '/work.mp4'), 'unsupported media type');
select pg_temp.fails('server rejects oversized media',
  format($$ select public.save_provider_media(null,'video',%L,'Large','') $$, :mama || '/large.mp4'), 'invalid media file');
reset role;
select set_config('request.jwt.claim.sub', :tunde, true);
set local role authenticated;
select pg_temp.eq('visitors can read published media metadata',
  (select count(*) from storage.objects where bucket_id = 'provider-media' and name = :mama || '/work.mp4'), 1::bigint);
select pg_temp.eq('unpublished objects stay private',
  (select count(*) from storage.objects where bucket_id = 'provider-media' and name = :mama || '/unpublished.jpg'), 0::bigint);
select pg_temp.fails('visitors cannot remove portfolio items',
  format($$ select public.remove_provider_media(%L) $$, (select v from t_ids where k = 'media1')), 'portfolio item not found');
reset role;
select set_config('request.jwt.claim.sub', :mama, true);
set local role authenticated;
select public.remove_provider_media((select v from t_ids where k = 'media1'));
reset role;
select set_config('request.jwt.claim.sub', :tunde, true);
set local role authenticated;
select pg_temp.eq('unpublishing revokes new visitor links even before cleanup',
  (select count(*) from storage.objects where bucket_id = 'provider-media' and name = :mama || '/work.mp4'), 0::bigint);

-- ==== 23. Renewal reminders are once per renewal =============================
reset role;
update public.subscriptions set renews_at = now() + interval '45 days' where renews_at is not null;
insert into public.subscriptions(profile_id, plan, renews_at) values (:mama, 'pro', now() + interval '2 days')
  on conflict(profile_id) do update set plan = excluded.plan, renews_at = excluded.renews_at;
select pg_temp.eq('one upcoming renewal produces one reminder', private.remind_subscription_renewals(), 1);
select pg_temp.eq('a scheduler retry sends nothing twice', private.remind_subscription_renewals(), 0);
select pg_temp.eq('reminder links to billing',
  (select ref_type from public.notifications where profile_id = :mama and title = 'Your plan renews soon' limit 1), 'billing');
select set_config('request.jwt.claim.sub', :mama, true);
set local role authenticated;
select pg_temp.fails('a customer cannot invoke the reminder worker', $$ select private.remind_subscription_renewals() $$, 'permission denied');

-- ==== 24. Quote revisions cannot change accepted terms silently ==============
reset role;
select set_config('request.jwt.claim.sub', :customer, true);
set local role authenticated;
insert into public.job_posts(customer_id, title, description, budget) values(auth.uid(),'Revision test','Proposal lifecycle',20000)
  returning id \gset revision_job_
reset role;
select set_config('request.jwt.claim.sub', :mama, true);
set local role authenticated;
insert into public.sent_quotes(job_id,provider_id,price,days,message) values(:'revision_job_id',auth.uid(),10000,2,'Original') returning id \gset revision_quote_
select public.revise_job_quote(:'revision_quote_id',1,12000,3,'Monday','Revised',null);
select pg_temp.eq('editing increments the proposal version', (select revision from public.sent_quotes where id = :'revision_quote_id'), 2);
select pg_temp.fails('an old editor cannot overwrite a new revision',
  format($$ select public.revise_job_quote(%L,1,9000,1,null,null,null) $$, :'revision_quote_id'), 'quote_changed');
reset role;
select set_config('request.jwt.claim.sub', :tunde, true);
set local role authenticated;
select pg_temp.eq('unrelated users cannot read revision history',
  (select count(*) from public.quote_revisions where quote_id = :'revision_quote_id'), 0::bigint);
select pg_temp.fails('unrelated users cannot withdraw a quote',
  format($$ select public.withdraw_job_quote(%L,2) $$, :'revision_quote_id'), 'quote not found');
reset role;
select set_config('request.jwt.claim.sub', :customer, true);
set local role authenticated;
select pg_temp.fails('customer cannot accept a stale price or message',
  format($$ select public.accept_job_quote(%L,now() + interval '20 days',1) $$, :'revision_quote_id'), 'quote_changed');
select pg_temp.eq('buyer can inspect original and changed terms',
  (select count(*) from public.quote_revisions where quote_id = :'revision_quote_id'), 2::bigint);
reset role;
select set_config('request.jwt.claim.sub', :mama, true);
set local role authenticated;
select public.withdraw_job_quote(:'revision_quote_id',2);
select pg_temp.eq('withdrawn quote is removed from available quote count',
  (select quote_count from public.job_posts where id = :'revision_job_id'), 0);
reset role;
select set_config('request.jwt.claim.sub', :customer, true);
set local role authenticated;
select pg_temp.fails('withdrawn quote cannot be accepted',
  format($$ select public.accept_job_quote(%L,now() + interval '20 days',3) $$, :'revision_quote_id'), 'quote unavailable');

-- A withdrawn quote can go back on offer. Acceptance escrows the terms the
-- customer reviewed, and those terms are then final.
reset role;
select set_config('request.jwt.claim.sub', :mama, true);
set local role authenticated;
select public.revise_job_quote(:'revision_quote_id',3,12000,3,'Monday','Back on offer',null);
select pg_temp.eq('a re-sent quote counts as available again',
  (select quote_count from public.job_posts where id = :'revision_job_id'), 1);
select pg_temp.fails('a quote cannot be revised to a zero price',
  format($$ select public.revise_job_quote(%L,4,0,3,null,null,null) $$, :'revision_quote_id'), '23514');
-- No update policy: the row is not visible to a direct write, so nothing changes.
update public.sent_quotes set price = 1, revision = 99 where id = :'revision_quote_id';
select pg_temp.eq('a provider cannot rewrite a quote around the version check',
  (select price from public.sent_quotes where id = :'revision_quote_id'), 12000);
reset role;
select set_config('request.jwt.claim.sub', :customer, true);
set local role authenticated;
insert into t_ids select 'b_revised', public.accept_job_quote(:'revision_quote_id', (select monday from t_when) + interval '21 days', 4);
select pg_temp.eq('acceptance escrows the revised price and its fee',
  (select escrow_held from public.bookings where id = (select v from t_ids where k = 'b_revised')), 12600);
reset role;
select set_config('request.jwt.claim.sub', :mama, true);
set local role authenticated;
select pg_temp.fails('an accepted quote can no longer be revised',
  format($$ select public.revise_job_quote(%L,5,1,1,null,null,null) $$, :'revision_quote_id'), 'job is closed');

-- ==== 25. Dispute replies and shared evidence =================================
reset role;
insert into public.disputes(raised_by,against_id,ref_type,ref_id,reason)
values(:customer,:mama,'booking','response-access-fixture','Response access test') returning id \gset response_case_
insert into storage.objects(bucket_id,name,owner,metadata) values
  ('dispute-evidence',:mama || '/response.jpg',:mama,'{"mimetype":"image/jpeg","size":1000}'),
  ('dispute-evidence',:mama || '/original-private.jpg',:mama,'{"mimetype":"image/jpeg","size":1000}');
select set_config('request.jwt.claim.sub', :mama, true);
set local role authenticated;
select public.respond_to_dispute('00000000-0000-0000-0000-00000000bb01',:'response_case_id','My response',array[:mama || '/response.jpg']);
select public.respond_to_dispute('00000000-0000-0000-0000-00000000bb01',:'response_case_id','My response',array[:mama || '/response.jpg']);
select pg_temp.eq('reply retry records exactly one response',
  (select count(*) from public.dispute_responses where dispute_id = :'response_case_id'), 1::bigint);
reset role;
select set_config('request.jwt.claim.sub', :customer, true);
set local role authenticated;
select pg_temp.eq('the other participant can read shared evidence',
  (select count(*) from storage.objects where bucket_id = 'dispute-evidence' and name = :mama || '/response.jpg'), 1::bigint);
select pg_temp.eq('original private evidence does not become shared implicitly',
  (select count(*) from storage.objects where bucket_id = 'dispute-evidence' and name = :mama || '/original-private.jpg'), 0::bigint);
select pg_temp.fails('cannot claim the other participant''s file as your evidence',
  format($$ select public.respond_to_dispute(gen_random_uuid(),%L,'Other photo',array[%L]) $$, :'response_case_id', :mama || '/response.jpg'), 'invalid response evidence');
reset role;
select set_config('request.jwt.claim.sub', :tunde, true);
set local role authenticated;
select pg_temp.eq('outsiders cannot read case responses', (select count(*) from public.dispute_responses where dispute_id = :'response_case_id'), 0::bigint);
select pg_temp.eq('outsiders cannot read shared photos', (select count(*) from storage.objects where bucket_id = 'dispute-evidence' and name = :mama || '/response.jpg'), 0::bigint);
select pg_temp.fails('outsiders cannot submit case responses',
  format($$ select public.respond_to_dispute(gen_random_uuid(),%L,'Hello','{}') $$, :'response_case_id'), 'not a dispute participant');
reset role;
update public.disputes set status = 'resolved' where id = :'response_case_id';
select set_config('request.jwt.claim.sub', :mama, true);
set local role authenticated;
select pg_temp.fails('resolved cases reject new responses',
  format($$ select public.respond_to_dispute(gen_random_uuid(),%L,'Late response','{}') $$, :'response_case_id'), 'dispute already resolved');

-- ==== 26. Admin reports: authority, time boundaries and reversal accounting ===
select pg_temp.fails('non-admin cannot read platform aggregates',
  $$ select public.admin_analytics('2030-01-01','2030-01-03') $$, 'admins only');
reset role;
select set_config('request.jwt.claim.sub', :admin, true);
set local role authenticated;
select pg_temp.fails('reports require a bounded period',
  $$ select public.admin_analytics('2025-01-01','2030-01-03') $$, 'invalid report range');
reset role;
insert into public.orders(customer_id,seller_id,total,items_total,delivery_fee,delivery_speed,status,commission)
values(:customer,:mama,11200,10000,1200,'standard','returned',600) returning id \gset analytics_order_
insert into public.wallet_transactions(profile_id,label,kind,balance_delta,order_id,created_at) values
  (:mama,'Reporting fee fixture','fee',-600,:'analytics_order_id','2030-01-01T23:30:00Z'),
  (:customer,'Reporting refund fixture','refund',11200,:'analytics_order_id','2030-01-02T23:30:00Z');
insert into public.wallet_transactions(profile_id,label,kind,balance_delta,created_at) values
  (:customer,'Reporting top-up fixture','topup',50000,'2030-01-01T23:30:00Z'),
  (:mama,'Reporting subscription fixture','subscription',-2000,'2030-01-01T23:30:00Z');
select set_config('request.jwt.claim.sub', :admin, true);
set local role authenticated;
select pg_temp.eq('report recognizes commission on its Lagos date',
  (public.admin_analytics('2030-01-02T00:00:00+01:00','2030-01-03T00:00:00+01:00')->'period'->>'marketplace_fees')::bigint,600::bigint);
select pg_temp.eq('later refund reverses commission on the refund date',
  (public.admin_analytics('2030-01-03T00:00:00+01:00','2030-01-04T00:00:00+01:00')->'period'->>'marketplace_fees')::bigint,(-600)::bigint);
select pg_temp.eq('topups are separate from subscription income',
  (public.admin_analytics('2030-01-02T00:00:00+01:00','2030-01-03T00:00:00+01:00')->'period'->>'subscriptions')::bigint,2000::bigint);
select pg_temp.eq('topup collections are reported separately',
  (public.admin_analytics('2030-01-02T00:00:00+01:00','2030-01-03T00:00:00+01:00')->'period'->>'topups')::bigint,50000::bigint);
select pg_temp.eq('daily table includes zero-activity dates',
  jsonb_array_length(public.admin_analytics('2030-01-01T00:00:00+01:00','2030-01-04T00:00:00+01:00')->'daily'),3);

-- The fixtures above only prove the report agrees with itself. Reconcile it
-- with the bookings and orders tables for everything this run settled: the
-- customer's service fee plus the provider's commission on completed
-- bookings, and commission on delivered seller orders. A seller order that
-- was delivered and then refunded nets to nothing. Every ledger row written
-- by this transaction carries its start time, so a one-second window is
-- exactly this run, whatever else the database already holds.
reset role;
select
  (select coalesce(sum(b.released_fee + b.commission), 0) from public.bookings b
    where exists (select 1 from public.wallet_transactions w
      where w.booking_id = b.id and w.kind = 'release' and w.created_at = now()))
  + (select coalesce(sum(o.commission), 0) from public.orders o
    where o.seller_id is not null and o.status = 'delivered' and exists (select 1 from public.wallet_transactions w
      where w.order_id = o.id and w.kind = 'release' and w.created_at = now())) as fees,
  (select coalesce(sum(o.items_total), 0) from public.orders o
    where o.seller_id is null and o.status not in ('cancelled', 'returned') and exists (select 1 from public.wallet_transactions w
      where w.order_id = o.id and w.kind = 'order' and w.created_at = now())) as catalog
\gset expected_
select set_config('request.jwt.claim.sub', :admin, true);
set local role authenticated;
select pg_temp.eq('reported fees reconcile with completed bookings and delivered seller orders',
  (public.admin_analytics(now(), now() + interval '1 second')->'period'->>'marketplace_fees')::bigint, :expected_fees::bigint);
select pg_temp.eq('reported catalog collections reconcile with unrefunded FindWork orders',
  (public.admin_analytics(now(), now() + interval '1 second')->'period'->>'catalog_collections')::bigint, :expected_catalog::bigint);

-- Deleting an account does not clear its admin flag, so the report checks both.
reset role;
update public.profiles set deleted_at = now() where id = :admin;
select set_config('request.jwt.claim.sub', :admin, true);
set local role authenticated;
select pg_temp.fails('a deleted admin account cannot read platform aggregates',
  $$ select public.admin_analytics('2030-01-01','2030-01-03') $$, 'admins only');
reset role;
update public.profiles set deleted_at = null where id = :admin;

-- ==== 27. Staff roles, suspension and sign-in history ========================
select id as chidi_package from public.provider_packages where provider_id = :chidi and status = 'live' limit 1 \gset
select id as mama_package from public.provider_packages where provider_id = :mama and status = 'live' limit 1 \gset
select set_config('request.jwt.claim.sub', :tunde, true);
set local role authenticated;
select pg_temp.fails('a customer cannot suspend anyone',
  format($$ select public.admin_suspend_user(%L, 'spam account') $$, :chidi), 'admins only');
select pg_temp.fails('a customer cannot grant a role',
  format($$ select public.admin_set_staff_role(%L, 'admin') $$, :tunde), 'admins only');
select pg_temp.fails('nobody can make themselves staff',
  $$ update public.profiles set staff_role = 'admin' where id = auth.uid() $$, 'permission denied');
reset role;
select set_config('request.jwt.claim.sub', :admin, true);
set local role authenticated;
select pg_temp.fails('an admin cannot change their own role',
  format($$ select public.admin_set_staff_role(%L, null) $$, :admin), 'cannot change your own account');
select public.admin_set_staff_role(:tunde, 'support');
reset role;
select set_config('request.jwt.claim.sub', :tunde, true);
set local role authenticated;
select pg_temp.eq('support staff reach their part of the console', public.staff_can('support'), true);
select pg_temp.eq('support staff are not admins', public.is_admin(), false);
select pg_temp.fails('support staff cannot adjust a wallet',
  format($$ select public.admin_adjust_balance(%L, 1000, 'not allowed') $$, :chidi), 'admins only');
select pg_temp.fails('support staff cannot suspend',
  format($$ select public.admin_suspend_user(%L, 'spam account') $$, :chidi), 'admins only');
select pg_temp.eq('support staff cannot read other wallets',
  (select count(*) from public.wallet_transactions where profile_id <> auth.uid()), 0::bigint);
reset role;
select set_config('request.jwt.claim.sub', :admin, true);
set local role authenticated;
select public.admin_set_staff_role(:tunde, 'moderator');
reset role;
select set_config('request.jwt.claim.sub', :tunde, true);
set local role authenticated;
select pg_temp.fails('a moderator cannot suspend another member of staff',
  format($$ select public.admin_suspend_user(%L, 'testing limits') $$, :admin), 'admins only');
select pg_temp.fails('a suspension needs a reason',
  format($$ select public.admin_suspend_user(%L, ' ') $$, :chidi), 'suspension reason required');
select public.admin_suspend_user(:chidi, 'Selling counterfeit goods');

reset role;
select set_config('request.jwt.claim.sub', :chidi, true);
set local role authenticated;
select pg_temp.fails('a suspended account cannot post a job',
  $$ insert into public.job_posts(customer_id, title, description, budget) values (auth.uid(), 'Suspended', 'Should not post', 5000) $$,
  'account_suspended');
select pg_temp.fails('a suspended account cannot spend',
  format($$ select public.pay_booking(%L, %L, %L) $$, :mama, :'mama_package', (select monday from t_when) + interval '28 days'),
  'account_suspended');
select set_config('request.method', 'POST', true);
select set_config('request.path', '/rpc/place_order', true);
select pg_temp.fails('the API hook refuses a suspended account''s writes', $$ select public.check_request() $$, 'account_suspended');
select set_config('request.path', '/support_requests', true);
select public.check_request();
select set_config('request.method', 'GET', true);
select set_config('request.path', '/orders', true);
select public.check_request();
select pg_temp.eq('a suspended account may still read and write to support', true, true);
reset role;
select set_config('request.jwt.claim.sub', :customer, true);
set local role authenticated;
select pg_temp.eq('a suspended provider is hidden from customers',
  (select count(*) from public.provider_profiles where id = :chidi), 0::bigint);
select pg_temp.fails('nobody can book a suspended provider',
  format($$ select public.pay_booking(%L, %L, %L) $$, :chidi, :'chidi_package', (select monday from t_when) + interval '28 days'),
  'counterparty_suspended');
reset role;
select set_config('request.jwt.claim.sub', :tunde, true);
set local role authenticated;
select public.admin_reinstate_user(:chidi, 'Cleared after review');
reset role;
select set_config('request.jwt.claim.sub', :customer, true);
set local role authenticated;
select pg_temp.eq('a reinstated provider is visible again',
  (select count(*) from public.provider_profiles where id = :chidi), 1::bigint);
reset role;
select pg_temp.eq('suspension and reinstatement are both audited',
  (select count(*) from public.admin_actions where target_id = :chidi), 2::bigint);

select set_config('request.jwt.claim.sub', :customer, true);
set local role authenticated;
select public.record_sign_in('device-aaaaaaaa', 'Chrome on Android');
select pg_temp.eq('a first device raises no warning',
  (select count(*) from public.notifications where profile_id = auth.uid() and title = 'New sign-in to your account'), 0::bigint);
select public.record_sign_in('device-bbbbbbbb', 'Safari on iPhone');
select public.record_sign_in('device-bbbbbbbb', 'Safari on iPhone');
select pg_temp.eq('a second device warns the owner once',
  (select count(*) from public.notifications where profile_id = auth.uid() and title = 'New sign-in to your account'), 1::bigint);
select public.record_sign_in('device-cccccccc', 'Firefox on Windows');
reset role;
select pg_temp.eq('three new devices in a day raise a high-risk alert',
  (select severity from public.risk_alerts where profile_id = :customer and kind = 'many_new_devices'), 'high');
select set_config('request.jwt.claim.sub', :mama, true);
set local role authenticated;
select pg_temp.eq('risk alerts are invisible to users', (select count(*) from public.risk_alerts), 0::bigint);
select pg_temp.eq('other people''s devices are private',
  (select count(*) from public.devices where profile_id <> auth.uid()), 0::bigint);
select pg_temp.fails('users cannot close alerts',
  format($$ select public.admin_review_risk_alert(%L, 'dismissed', '') $$, gen_random_uuid()), 'admins only');
reset role;
select set_config('request.jwt.claim.sub', :tunde, true);
set local role authenticated;
select public.admin_review_risk_alert(
  (select id from public.risk_alerts where profile_id = :customer and kind = 'many_new_devices'), 'reviewed', 'Customer confirmed the devices');
select pg_temp.eq('a moderator can review an alert',
  (select status from public.risk_alerts where profile_id = :customer and kind = 'many_new_devices'), 'reviewed');
reset role;
select set_config('request.jwt.claim.sub', :admin, true);
set local role authenticated;
select public.admin_set_staff_role(:tunde, null);
reset role;
select set_config('request.method', '', true);
select set_config('request.path', '', true);

-- ==== 28. Two-step sign-in ====================================================
select set_config('request.jwt.claim.sub', :customer, true);
set local role authenticated;
select pg_temp.fails('recovery codes need an authenticator first', $$ select public.create_mfa_recovery_codes() $$, 'mfa_required');
reset role;
insert into auth.mfa_factors(user_id, factor_type, status) values (:customer, 'totp', 'verified');
select set_config('request.jwt.claim.sub', :customer, true);
select set_config('request.jwt.claims', '{"aal":"aal1"}', true);
select set_config('request.method', 'GET', true);
select set_config('request.path', '/wallet_transactions', true);
set local role authenticated;
select pg_temp.fails('a password-only session cannot read once two-step is on', $$ select public.check_request() $$, 'mfa_required');
select pg_temp.fails('a password-only session cannot spend',
  format($$ select public.pay_booking(%L, %L, %L) $$, :mama, :'mama_package', (select monday from t_when) + interval '35 days'), 'mfa_required');
select pg_temp.fails('a password-only session cannot mint recovery codes', $$ select public.create_mfa_recovery_codes() $$, 'mfa_required');
select set_config('request.jwt.claims', '{"aal":"aal2"}', true);
select public.check_request();
create temp table t_codes as select unnest(public.create_mfa_recovery_codes()) as code;
grant select on t_codes to service_role;
select pg_temp.eq('eight recovery codes are issued', (select count(distinct code) from t_codes), 8::bigint);
select pg_temp.fails('users cannot redeem codes directly',
  format($$ select public.consume_mfa_recovery_code(%L, 'abcde-12345') $$, :customer), 'permission denied');
reset role;
select pg_temp.eq('codes are stored hashed',
  (select count(*) from public.mfa_recovery_codes c join t_codes t on c.code_hash = t.code where c.profile_id = :customer), 0::bigint);
set local role service_role;
select pg_temp.eq('a wrong code is refused', public.consume_mfa_recovery_code(:customer, 'aaaaa-bbbbb'), false);
select pg_temp.eq('a real code works, however it is typed',
  public.consume_mfa_recovery_code(:customer, upper(replace((select code from t_codes limit 1), '-', ' '))), true);
select pg_temp.eq('using one code retires the rest',
  public.consume_mfa_recovery_code(:customer, (select code from t_codes offset 1 limit 1)), false);
select public.consume_mfa_recovery_code(:customer, 'aaaaa-bbbb1');
select public.consume_mfa_recovery_code(:customer, 'aaaaa-bbbb2');
select public.consume_mfa_recovery_code(:customer, 'aaaaa-bbbb3');
select public.consume_mfa_recovery_code(:customer, 'aaaaa-bbbb4');
select pg_temp.fails('guessing is cut off after five tries',
  format($$ select public.consume_mfa_recovery_code(%L, 'aaaaa-bbbb5') $$, :customer), 'too_many_attempts');
reset role;
select pg_temp.eq('recovery is recorded for the owner',
  (select count(*) from public.security_events where profile_id = :customer and kind = 'mfa_recovered'), 1::bigint);
delete from auth.mfa_factors where user_id = :customer;
select set_config('request.jwt.claims', '', true);
select set_config('request.method', '', true);
select set_config('request.path', '', true);

-- ==== 29. Trust score, verification limits and the risk rules ================
\set femi '''00000000-0000-0000-0000-000000000009'''
select pg_temp.eq('every stored trust score is in range',
  (select count(*) from public.profiles where trust_score not between 0 and 100), 0::bigint);
select set_config('request.jwt.claim.sub', :customer, true);
set local role authenticated;
select pg_temp.eq('other people see a score and a tier, not the parts',
  (select count(*) from jsonb_object_keys(public.trust_score(:mama))), 2::bigint);
select pg_temp.eq('you see your own breakdown', public.trust_score(:customer) ? 'conduct', true);
select pg_temp.fails('trust cannot be self-declared',
  $$ update public.profiles set trust_score = 100, verification_tier = 3 where id = auth.uid() $$, 'permission denied');
reset role;
update public.profiles set verified_at = null where id = :femi;
select pg_temp.eq('a confirmed contact is tier 1', (select verification_tier from public.profiles where id = :femi), 1::smallint);
select (private.trust_breakdown(:femi)->>'conduct')::integer as femi_conduct \gset
select private.raise_risk(:femi, 'check_fixture', 'high', 'Fixture alert');
select pg_temp.eq('an open high-risk alert costs ten points of conduct',
  (private.trust_breakdown(:femi)->>'conduct')::integer, greatest(0, :femi_conduct - 10));
update public.risk_alerts set status = 'dismissed' where profile_id = :femi and kind = 'check_fixture';
select pg_temp.eq('dismissing the alert restores them',
  (private.trust_breakdown(:femi)->>'conduct')::integer, :femi_conduct);

-- Money in by card and straight out again, and the daily limit by tier.
insert into public.wallet_transactions(profile_id, label, kind, balance_delta) values (:femi, 'Top-up fixture', 'topup', 120000);
insert into public.payout_accounts(profile_id, bank_name, account_number, account_name)
values (:femi, 'GTBank', '0123456789', 'Femi O') on conflict (profile_id) do nothing;
select set_config('request.jwt.claim.sub', :femi, true);
set local role authenticated;
select public.request_withdrawal(45000);
select pg_temp.fails('a contact-only account cannot withdraw past its daily limit',
  $$ select public.request_withdrawal(10000) $$, 'verification_limit');
select pg_temp.eq('the app can show what is used today', (public.my_limits()->>'withdrawn_today')::integer, 45000);
reset role;
select pg_temp.eq('topping up and withdrawing straight away is flagged high',
  (select severity from public.risk_alerts where profile_id = :femi and kind = 'pass_through'), 'high');
update public.profiles set verified_at = now() where id = :femi;
select pg_temp.eq('ID approval moves the account to tier 2', (select verification_tier from public.profiles where id = :femi), 2::smallint);
select set_config('request.jwt.claim.sub', :femi, true);
set local role authenticated;
select public.request_withdrawal(10000);
reset role;
select pg_temp.eq('a withdrawal by a flagged account is itself flagged',
  (select count(*) from public.risk_alerts where profile_id = :femi and kind = 'withdrawal_while_flagged'), 1::bigint);

-- Listings that copy another seller or take the deal off the platform.
select set_config('request.jwt.claim.sub', :femi, true);
set local role authenticated;
insert into public.classifieds(seller_id, title, price, category, location, description)
values (auth.uid(), 'Generator for sale', 150000, 'Used goods', 'Yaba', 'Clean 2.5kVA generator, barely used. Call 0803 412 9087 or WhatsApp me to pay direct.');
reset role;
select pg_temp.eq('a listing that asks to pay outside FindWork is flagged',
  (select count(*) from public.risk_alerts where profile_id = :femi and kind = 'off_platform_contact'), 1::bigint);
select set_config('request.jwt.claim.sub', :tunde, true);
set local role authenticated;
insert into public.classifieds(seller_id, title, price, category, location, description)
values (auth.uid(), 'Generator for sale', 150000, 'Used goods', 'Ikeja', 'Clean 2.5kVA generator, barely used. Call 0803 412 9087 or WhatsApp me to pay direct.');
reset role;
select pg_temp.eq('a word-for-word copy of another seller''s listing is flagged high',
  (select severity from public.risk_alerts where profile_id = :tunde and kind = 'duplicate_listing'), 'high');

-- A flagged seller is not paid automatically.
insert into public.products(id, seller_id, name, price, vendor, stock) values ('risk-check-fabric', :mama, 'Risk check fabric', 5000, 'Mama Nkechi Styles', 5);
insert into public.wallet_transactions(profile_id, label, kind, balance_delta) values (:customer, 'Fixture funds', 'adjustment', 20000);
select set_config('request.jwt.claim.sub', :customer, true);
set local role authenticated;
insert into t_ids select 'risk_order', (public.place_order('[{"product_id":"risk-check-fabric","qty":1}]', 'standard', '14 Test Street, Yaba', '+2348034129087', 6200))[1];
reset role;
select set_config('request.jwt.claim.sub', :mama, true);
set local role authenticated;
select public.dispatch_order((select v from t_ids where k = 'risk_order'));
reset role;
update public.orders set dispatched_at = now() - interval '8 days' where id = (select v from t_ids where k = 'risk_order');
select private.raise_risk(:mama, 'check_fixture', 'high', 'Fixture alert');
select private.auto_release_orders();
select pg_temp.eq('a flagged seller is not paid automatically',
  (select status from public.orders where id = (select v from t_ids where k = 'risk_order')), 'dispatched');
update public.risk_alerts set status = 'reviewed' where profile_id = :mama and kind = 'check_fixture';
select private.auto_release_orders();
select pg_temp.eq('once the alert is reviewed the seller is paid',
  (select status from public.orders where id = (select v from t_ids where k = 'risk_order')), 'delivered');

-- Business verification is the top tier and is reviewed by a person.
insert into storage.objects(bucket_id, name, owner, metadata) values
  ('verification-documents', :mama || '/cac.pdf', :mama, '{"mimetype":"application/pdf","size":2048}');
select set_config('request.jwt.claim.sub', :mama, true);
set local role authenticated;
select pg_temp.fails('a registration number must look like one',
  format($$ select public.submit_business_verification('hello', 'Mama Nkechi Styles Ltd', %L) $$, :mama || '/cac.pdf'), 'invalid registration number');
insert into t_ids select 'cac', public.submit_business_verification('RC 1234567', 'Mama Nkechi Styles Ltd', :mama || '/cac.pdf');
select pg_temp.fails('a business cannot approve itself',
  format($$ select public.admin_review_business_verification(%L, true, '') $$, (select v from t_ids where k = 'cac')), 'admins only');
reset role;
select set_config('request.jwt.claim.sub', :admin, true);
set local role authenticated;
select public.admin_review_business_verification((select v from t_ids where k = 'cac'), true, '');
reset role;
select pg_temp.eq('an approved business is tier 3', (select verification_tier from public.profiles where id = :mama), 3::smallint);

-- ==== 30. Wallet transfers and milestone escrow ==============================
update public.profiles set verified_at = null, business_verified_at = null where id = :customer;
insert into public.wallet_transactions(profile_id, label, kind, balance_delta) values (:customer, 'Fixture funds', 'adjustment', 90000);
select set_config('request.jwt.claim.sub', :customer, true);
set local role authenticated;
select pg_temp.eq('a recipient is found by a phone number typed the local way',
  public.find_transfer_recipient('0802 000 0004')->>'id', '00000000-0000-0000-0000-000000000005');
select pg_temp.eq('part of a number finds nobody', public.find_transfer_recipient('0802 000') is null, true);
select pg_temp.eq('you cannot look yourself up', public.find_transfer_recipient('ada@findwork.africa') is null, true);
select pg_temp.balance(:customer) as sender_before, pg_temp.balance(:mama) as recipient_before \gset
select public.transfer_funds('00000000-0000-0000-0000-00000000cc01', :mama, 20000, 'For fabric');
select public.transfer_funds('00000000-0000-0000-0000-00000000cc01', :mama, 20000, 'For fabric');
select pg_temp.eq('a retried transfer sends once', pg_temp.balance(:customer), (:sender_before - 20000)::bigint);
select pg_temp.eq('the recipient is credited', pg_temp.balance(:mama), (:recipient_before + 20000)::bigint);
select pg_temp.fails('you cannot send to yourself',
  format($$ select public.transfer_funds(gen_random_uuid(), %L, 1000, null) $$, :customer), 'cannot send to yourself');
select pg_temp.fails('you cannot send more than you have',
  format($$ select public.transfer_funds(gen_random_uuid(), %L, 100000000, null) $$, :mama), 'insufficient_balance');
select pg_temp.fails('transfers stop at the tier''s daily limit',
  format($$ select public.transfer_funds(gen_random_uuid(), %L, 40000, null) $$, :mama), 'verification_limit');
select pg_temp.fails('a reused id with different details is refused',
  format($$ select public.transfer_funds('00000000-0000-0000-0000-00000000cc01', %L, 5000, null) $$, :mama), 'invalid transfer');
reset role;
select set_config('request.jwt.claim.sub', :tunde, true);
set local role authenticated;
select pg_temp.eq('other people cannot see a transfer', (select count(*) from public.wallet_transfers), 0::bigint);

-- A job paid in three stages, released one at a time.
reset role;
select set_config('request.jwt.claim.sub', :customer, true);
set local role authenticated;
insert into public.job_posts(customer_id, title, description, budget) values (auth.uid(), 'Staged job', 'Paid in stages', 25000) returning id \gset staged_job_
reset role;
select set_config('request.jwt.claim.sub', :mama, true);
set local role authenticated;
select pg_temp.fails('stages must add up to the price',
  format($$ insert into public.sent_quotes(job_id, provider_id, price, days, milestones)
    values (%L, auth.uid(), 20000, 5, '[{"title":"Materials","amount":8000},{"title":"Sewing","amount":8000}]') $$, :'staged_job_id'), '23514');
insert into public.sent_quotes(job_id, provider_id, price, days, message, milestones)
values (:'staged_job_id', auth.uid(), 20000, 5, 'In three stages',
  '[{"title":"Materials","amount":8000},{"title":"Sewing","amount":8000},{"title":"Fitting","amount":4000}]') returning id \gset staged_quote_
reset role;
select set_config('request.jwt.claim.sub', :customer, true);
set local role authenticated;
insert into t_ids select 'staged', public.accept_job_quote(:'staged_quote_id', (select monday from t_when) + interval '49 days', 1);
select pg_temp.eq('accepting a staged quote creates its stages',
  (select count(*) from public.booking_milestones where booking_id = (select v from t_ids where k = 'staged')), 3::bigint);
select pg_temp.eq('the whole price and fee are held at acceptance',
  (select escrow_held from public.bookings where id = (select v from t_ids where k = 'staged')), 21000);
select id as stage1 from public.booking_milestones where booking_id = (select v from t_ids where k = 'staged') and position = 1 \gset
select id as stage2 from public.booking_milestones where booking_id = (select v from t_ids where k = 'staged') and position = 2 \gset
select id as stage3 from public.booking_milestones where booking_id = (select v from t_ids where k = 'staged') and position = 3 \gset
select pg_temp.fails('stages are released in order',
  format($$ select public.release_milestone(%L) $$, :'stage2'), 'release earlier milestones first');
reset role;
select set_config('request.jwt.claim.sub', :mama, true);
set local role authenticated;
select pg_temp.fails('a provider cannot release their own stage',
  format($$ select public.release_milestone(%L) $$, :'stage1'), 'not your booking');
reset role;
select set_config('request.jwt.claim.sub', :customer, true);
set local role authenticated;
select public.release_milestone(:'stage1');
select pg_temp.fails('a stage is paid once',
  format($$ select public.release_milestone(%L) $$, :'stage1'), 'milestone already settled');
select pg_temp.eq('escrow falls by the stage and its share of the fee',
  (select escrow_held from public.bookings where id = (select v from t_ids where k = 'staged')), 21000 - 8400);
select public.release_milestone(:'stage2');
select public.release_milestone(:'stage3');
reset role;
select pg_temp.eq('the last stage completes the booking',
  (select status from public.bookings where id = (select v from t_ids where k = 'staged')), 'done');
select pg_temp.eq('nothing is left in escrow for the job',
  (select sum(escrow_delta) from public.wallet_transactions where booking_id = (select v from t_ids where k = 'staged')), 0::bigint);
select pg_temp.eq('the provider received the price less commission, no more',
  (select sum(balance_delta) from public.wallet_transactions where profile_id = :mama and booking_id = (select v from t_ids where k = 'staged')),
  (select (price - commission)::bigint from public.bookings where id = (select v from t_ids where k = 'staged')));
select pg_temp.eq('the whole service fee is recognised once',
  (select released_fee from public.bookings where id = (select v from t_ids where k = 'staged')), 1000);

-- Cancelling after one stage refunds only what was not released.
select set_config('request.jwt.claim.sub', :customer, true);
set local role authenticated;
insert into public.job_posts(customer_id, title, description, budget) values (auth.uid(), 'Half-done job', 'Cancelled part way', 12000) returning id \gset half_job_
reset role;
select set_config('request.jwt.claim.sub', :mama, true);
set local role authenticated;
insert into public.sent_quotes(job_id, provider_id, price, days, milestones)
values (:'half_job_id', auth.uid(), 10000, 3, '[{"title":"Part one","amount":6000},{"title":"Part two","amount":4000}]') returning id \gset half_quote_
reset role;
select set_config('request.jwt.claim.sub', :customer, true);
set local role authenticated;
insert into t_ids select 'half', public.accept_job_quote(:'half_quote_id', (select monday from t_when) + interval '56 days', 1);
select public.release_milestone((select id from public.booking_milestones where booking_id = (select v from t_ids where k = 'half') and position = 1));
select pg_temp.balance(:customer) as before_cancel \gset
select public.cancel_booking((select v from t_ids where k = 'half'));
select pg_temp.eq('cancelling refunds only the unreleased stage and its fee',
  pg_temp.balance(:customer), (:before_cancel + 4200)::bigint);
reset role;
select pg_temp.eq('the unreleased stage is marked refunded',
  (select status from public.booking_milestones where booking_id = (select v from t_ids where k = 'half') and position = 2), 'refunded');
select pg_temp.eq('and nothing is left in escrow for it',
  (select sum(escrow_delta) from public.wallet_transactions where booking_id = (select v from t_ids where k = 'half')), 0::bigint);

-- The report still agrees with the bookings and orders after staged releases.
select
  (select coalesce(sum(b.released_fee + b.commission), 0) from public.bookings b
    where exists (select 1 from public.wallet_transactions w where w.booking_id = b.id and w.kind = 'release' and w.created_at = now()))
  + (select coalesce(sum(o.commission), 0) from public.orders o
    where o.seller_id is not null and o.status = 'delivered' and exists (select 1 from public.wallet_transactions w
      where w.order_id = o.id and w.kind = 'release' and w.created_at = now())) as staged_fees \gset
select set_config('request.jwt.claim.sub', :admin, true);
set local role authenticated;
select pg_temp.eq('reported fees still reconcile after staged releases',
  (public.admin_analytics(now(), now() + interval '1 second')->'period'->>'marketplace_fees')::bigint, :staged_fees::bigint);
reset role;

-- ==== 31. Product options and coupons ========================================
insert into public.products(id, seller_id, name, price, vendor) values ('variant-shirt', :mama, 'Variant shirt', 9000, 'Mama Nkechi Styles');
insert into public.wallet_transactions(profile_id, label, kind, balance_delta) values
  (:customer, 'Fixture funds', 'adjustment', 80000), (:tunde, 'Fixture funds', 'adjustment', 30000);
select set_config('request.jwt.claim.sub', :tunde, true);
set local role authenticated;
select pg_temp.fails('only the seller edits a product''s options',
  $$ select public.save_product_variants('variant-shirt', '[{"name":"Small","price":1}]') $$, 'product not found');
reset role;
select set_config('request.jwt.claim.sub', :mama, true);
set local role authenticated;
select public.save_product_variants('variant-shirt', '[{"name":"Small","price":8000,"stock":2},{"name":"Large","price":10000,"stock":1}]');
select pg_temp.fails('a seller cannot issue a FindWork coupon',
  $$ select public.save_coupon(null, 'PLATFORM5', 'fixed', 500, 0, null, null, null, 1, true, true) $$, 'admins only');
select pg_temp.fails('a discount above 90% is refused',
  $$ select public.save_coupon(null, 'FREE100', 'percent', 100, 0, null, null, null, 1, true, false) $$, 'invalid coupon');
insert into t_ids select 'coupon', public.save_coupon(null, 'mama10', 'percent', 10, 5000, 1500, null, 2, 1, true, false);
reset role;
select pg_temp.eq('a product with options shows its lowest price', (select price from public.products where id = 'variant-shirt'), 8000);
select pg_temp.eq('and the stock across them', (select stock from public.products where id = 'variant-shirt'), 3);
select id as small from public.product_variants where product_id = 'variant-shirt' and name = 'Small' \gset
select id as large from public.product_variants where product_id = 'variant-shirt' and name = 'Large' \gset

select set_config('request.jwt.claim.sub', :customer, true);
set local role authenticated;
select pg_temp.fails('a product with options needs one chosen',
  $$ select public.checkout_quote('[{"product_id":"variant-shirt","qty":1}]', 'standard') $$, 'choose an option');
select pg_temp.fails('an option belongs to its own product',
  format($$ select public.checkout_quote('[{"product_id":"risk-check-fabric","variant_id":"%s","qty":1}]', 'standard') $$, :'small'), 'product not found');
select pg_temp.eq('an option is charged at its own price',
  (public.checkout_quote(format('[{"product_id":"variant-shirt","variant_id":"%s","qty":1}]', :'large')::jsonb, 'standard')->>'items_total')::integer, 10000);
select pg_temp.fails('an option cannot be oversold',
  format($$ select public.checkout_quote('[{"product_id":"variant-shirt","variant_id":"%s","qty":2}]', 'standard') $$, :'large'), 'not enough stock');
select pg_temp.eq('customers cannot list coupons', (select count(*) from public.coupons), 0::bigint);
select pg_temp.eq('a coupon takes its percentage off the issuer''s goods, up to its cap',
  (public.checkout_quote(format('[{"product_id":"variant-shirt","variant_id":"%s","qty":2}]', :'small')::jsonb, 'standard', 'mama10')->>'discount')::integer, 1500);
select pg_temp.eq('a coupon for another seller''s goods does not apply',
  public.checkout_quote('[{"product_id":"palm-oil","qty":1}]', 'standard', 'MAMA10')->'coupon'->>'error', 'coupon_not_for_cart');
select pg_temp.fails('checkout refuses such a code rather than charge full price',
  $$ select public.place_order('[{"product_id":"palm-oil","qty":1}]', 'standard', '14 Test Street', '', 12400, 'MAMA10') $$, 'coupon_not_for_cart');
insert into t_ids select 'coupon_order', (public.place_order(
  format('[{"product_id":"variant-shirt","variant_id":"%s","qty":2}]', :'small')::jsonb, 'standard', '14 Test Street, Yaba', '+2348034129087', 15700, 'mama10'))[1];
select pg_temp.eq('a coupon is used once per customer',
  public.checkout_quote(format('[{"product_id":"variant-shirt","variant_id":"%s","qty":1}]', :'large')::jsonb, 'standard', 'MAMA10')->'coupon'->>'error',
  'coupon_already_used');
reset role;
select pg_temp.eq('the order records what was charged for the goods',
  (select items_total from public.orders where id = (select v from t_ids where k = 'coupon_order')), 14500);
select pg_temp.eq('and the discount beside it',
  (select discount from public.orders where id = (select v from t_ids where k = 'coupon_order')), 1500);
select pg_temp.eq('the option''s stock falls', (select stock from public.product_variants where id = :'small'), 0);
select pg_temp.eq('and the product''s stock with it', (select stock from public.products where id = 'variant-shirt'), 1);
select pg_temp.eq('the order line names the option',
  (select variant_name from public.order_items where order_id = (select v from t_ids where k = 'coupon_order')), 'Small');
select set_config('request.jwt.claim.sub', :mama, true);
set local role authenticated;
select public.dispatch_order((select v from t_ids where k = 'coupon_order'));
reset role;
select set_config('request.jwt.claim.sub', :customer, true);
set local role authenticated;
select public.confirm_order_received((select v from t_ids where k = 'coupon_order'));
reset role;
select pg_temp.eq('the seller funds the coupon: paid the discounted amount less commission',
  (select sum(balance_delta) from public.wallet_transactions where profile_id = :mama and order_id = (select v from t_ids where k = 'coupon_order')),
  (select (items_total - commission)::bigint from public.orders where id = (select v from t_ids where k = 'coupon_order')));
select pg_temp.eq('nothing is left in escrow for the order',
  (select sum(escrow_delta) from public.wallet_transactions where order_id = (select v from t_ids where k = 'coupon_order')), 0::bigint);

-- Cancelling before dispatch restores the option's stock and the coupon.
select set_config('request.jwt.claim.sub', :tunde, true);
set local role authenticated;
insert into t_ids select 'tunde_order', (public.place_order(
  format('[{"product_id":"variant-shirt","variant_id":"%s","qty":1}]', :'large')::jsonb, 'standard', '9 Other Street, Ikeja', '', 10200, 'MAMA10'))[1];
reset role;
select pg_temp.eq('a second customer can use the coupon', (select used_count from public.coupons where code = 'MAMA10'), 2);
select set_config('request.jwt.claim.sub', :femi, true);
set local role authenticated;
select pg_temp.eq('a coupon stops at its usage limit',
  public.checkout_quote('[{"product_id":"risk-check-fabric","qty":2}]', 'standard', 'MAMA10')->'coupon'->>'error', 'coupon_used_up');
reset role;
select set_config('request.jwt.claim.sub', :tunde, true);
set local role authenticated;
select public.cancel_order((select v from t_ids where k = 'tunde_order'));
reset role;
select pg_temp.eq('cancelling returns the option to stock', (select stock from public.product_variants where id = :'large'), 1);
select pg_temp.eq('and frees the coupon', (select used_count from public.coupons where code = 'MAMA10'), 1);
select pg_temp.eq('the cancelled order no longer counts against the customer',
  (select count(*) from public.coupon_redemptions where profile_id = :tunde), 0::bigint);

-- ==== 32. Riders and deliveries ===============================================
\set ngozi '''00000000-0000-0000-0000-000000000007'''
select set_config('request.jwt.claim.sub', :ngozi, true);
set local role authenticated;
select pg_temp.fails('a motorcycle needs a plate', $$ select public.apply_as_rider('motorcycle', '', null) $$, 'plate required');
select public.apply_as_rider('motorcycle', 'lag-123 xy', null);
select pg_temp.fails('an unapproved rider cannot go online', $$ select public.set_rider_online(true) $$, 'not an approved rider');
select pg_temp.fails('a rider cannot approve themselves',
  format($$ select public.admin_review_rider(%L, true, '') $$, :ngozi), 'admins only');
reset role;
select set_config('request.jwt.claim.sub', :admin, true);
set local role authenticated;
select public.admin_review_rider(:ngozi, true, '');
reset role;
update public.provider_profiles set lat = 6.51000, lng = 3.37000 where id = :mama;
update public.profiles set lat = 6.45000, lng = 3.39000 where id = :customer;
select set_config('request.jwt.claim.sub', :ngozi, true);
set local role authenticated;
select public.set_rider_online(true);
select public.update_rider_location(6.52, 3.37);

-- A seller's order: dispatched, collected, delivered against the code.
reset role;
select set_config('request.jwt.claim.sub', :customer, true);
set local role authenticated;
insert into t_ids select 'ride_order', (public.place_order('[{"product_id":"risk-check-fabric","qty":1}]', 'same-day', E'Ada\n14 Test Street, Yaba', '+2348034129087', 6800))[1];
reset role;
select pg_temp.eq('no delivery exists until the seller dispatches',
  (select count(*) from public.deliveries where order_id = (select v from t_ids where k = 'ride_order')), 0::bigint);
select set_config('request.jwt.claim.sub', :mama, true);
set local role authenticated;
select public.dispatch_order((select v from t_ids where k = 'ride_order'));
reset role;
select id as ride from public.deliveries where order_id = (select v from t_ids where k = 'ride_order') \gset
select code as ride_code from public.deliveries where id = :'ride' \gset
select pg_temp.eq('the rider earns their share of the delivery fee', (select rider_fee from public.deliveries where id = :'ride'), 1440);
select set_config('request.jwt.claim.sub', :mama, true);
set local role authenticated;
select pg_temp.fails('a seller cannot read the delivery code',
  format($$ select code from public.deliveries where id = %L $$, :'ride'), 'permission denied');
select pg_temp.eq('the seller is not shown the code by tracking either',
  public.delivery_tracking((select v from t_ids where k = 'ride_order'))->>'code', null);
reset role;
select set_config('request.jwt.claim.sub', :customer, true);
set local role authenticated;
select pg_temp.eq('the customer holds the code',
  public.delivery_tracking((select v from t_ids where k = 'ride_order'))->>'code', :'ride_code');
select pg_temp.fails('a customer is not a rider', format($$ select public.accept_delivery(%L) $$, :'ride'), 'not an approved rider');
reset role;
select set_config('request.jwt.claim.sub', :ngozi, true);
set local role authenticated;
select pg_temp.eq('an online rider sees the waiting delivery',
  (select count(*) from jsonb_array_elements(public.rider_available_deliveries()) job where job->>'id' = :'ride'), 1::bigint);
select pg_temp.eq('without the customer''s number',
  public.rider_available_deliveries()->0 ? 'contact_phone', false);
select public.accept_delivery(:'ride');
select pg_temp.eq('accepting gives an estimated arrival',
  (select eta_minutes > 0 from public.deliveries where id = :'ride'), true);
select pg_temp.fails('the code is useless before collection',
  format($$ select public.complete_delivery(%L, %L) $$, :'ride', :'ride_code'), 'collect the order first');
select public.mark_delivery_picked_up(:'ride');
select pg_temp.eq('the rider carrying it gets the customer''s number',
  public.delivery_tracking((select v from t_ids where k = 'ride_order'))->>'contact_phone', '+2348034129087');
select pg_temp.balance(:ngozi) as rider_before \gset
select public.complete_delivery(:'ride', '0000' || :'ride_code');
select pg_temp.eq('a wrong code delivers nothing',
  public.delivery_outcome(:'ride')->>'status', 'picked_up');
select pg_temp.eq('and is counted', (public.delivery_outcome(:'ride')->>'attempts_left')::integer, 4);
select public.complete_delivery(:'ride', :'ride_code');
select pg_temp.eq('the right code pays the rider', pg_temp.balance(:ngozi), (:rider_before + 1440)::bigint);
reset role;
select pg_temp.eq('and delivers the order, which pays the seller',
  (select status from public.orders where id = (select v from t_ids where k = 'ride_order')), 'delivered');
select pg_temp.eq('nothing is left in escrow for it',
  (select sum(escrow_delta) from public.wallet_transactions where order_id = (select v from t_ids where k = 'ride_order')), 0::bigint);
select set_config('request.jwt.claim.sub', :customer, true);
set local role authenticated;
select pg_temp.eq('a customer sees where the rider was only while the order is carried',
  public.delivery_tracking((select v from t_ids where k = 'ride_order'))->'rider'->>'lat', null);

-- A customer who confirms in the app after collection still pays the rider;
-- one who cancels before dispatch never creates a delivery.
insert into t_ids select 'ride_order2', (public.place_order('[{"product_id":"risk-check-fabric","qty":1}]', 'standard', E'Ada\n14 Test Street, Yaba', '+2348034129087', 6200))[1];
reset role;
select set_config('request.jwt.claim.sub', :mama, true);
set local role authenticated;
select public.dispatch_order((select v from t_ids where k = 'ride_order2'));
reset role;
select id as ride2 from public.deliveries where order_id = (select v from t_ids where k = 'ride_order2') \gset
select set_config('request.jwt.claim.sub', :ngozi, true);
set local role authenticated;
select public.accept_delivery(:'ride2');
select public.release_delivery(:'ride2');
select pg_temp.eq('a job handed back is no longer the rider''s to see',
  (select count(*) from public.deliveries where id = :'ride2'), 0::bigint);
reset role;
select pg_temp.eq('a rider can hand a job back before collecting it',
  (select status from public.deliveries where id = :'ride2'), 'awaiting_rider');
select set_config('request.jwt.claim.sub', :ngozi, true);
set local role authenticated;
select public.accept_delivery(:'ride2');
select public.mark_delivery_picked_up(:'ride2');
select pg_temp.fails('a collected order cannot be handed back',
  format($$ select public.release_delivery(%L) $$, :'ride2'), 'delivery already collected');
select pg_temp.balance(:ngozi) as rider_before2 \gset
reset role;
select set_config('request.jwt.claim.sub', :customer, true);
set local role authenticated;
select public.confirm_order_received((select v from t_ids where k = 'ride_order2'));
reset role;
select pg_temp.eq('confirming in the app closes the delivery', (select status from public.deliveries where id = :'ride2'), 'delivered');
select pg_temp.eq('and still pays the rider who carried it', pg_temp.balance(:ngozi), (:rider_before2 + 960)::bigint);
select pg_temp.eq('once', (select count(*) from public.wallet_transactions where profile_id = :ngozi and kind = 'delivery'), 2::bigint);

-- ==== 33. Push subscriptions and preferences ==================================
select set_config('request.jwt.claim.sub', :customer, true);
set local role authenticated;
select public.save_push_subscription('https://push.example/abc', 'BPublicKeyPublicKeyPublicKeyPublicKey', 'authsecret123', 'Chrome on Android');
select pg_temp.fails('a push address must be https',
  $$ select public.save_push_subscription('http://push.example/x', 'BPublicKeyPublicKeyPublicKeyPublicKey', 'authsecret123', '') $$, 'invalid push subscription');
select pg_temp.fails('the push keys cannot be read back, even by their owner',
  $$ select p256dh from public.push_subscriptions $$, 'permission denied');
select pg_temp.fails('users cannot ask who to push to',
  format($$ select public.push_targets(%L) $$, gen_random_uuid()), 'permission denied');
select pg_temp.fails('a language must be one on offer', $$ select public.save_preferences('fr', '{}', '{}') $$, 'invalid language');
select public.save_preferences('yo', '{message}', '{Tailoring}');
reset role;
select set_config('request.jwt.claim.sub', :tunde, true);
set local role authenticated;
select pg_temp.eq('other people''s preferences are private', (select count(*) from public.user_preferences), 0::bigint);
select public.save_push_subscription('https://push.example/abc', 'BPublicKeyPublicKeyPublicKeyPublicKey', 'authsecret123', 'Chrome on Android');
reset role;
select pg_temp.eq('a device signed in to by someone else pushes to them, not the last person',
  (select profile_id from public.push_subscriptions where endpoint = 'https://push.example/abc'), :tunde::uuid);
insert into public.notifications(profile_id, kind, title, body) values (:tunde, 'payment', 'Push fixture', 'Body') returning id \gset push_note_
set local role service_role;
select pg_temp.eq('the sender is given the keys for exactly that person''s devices',
  jsonb_array_length(public.push_targets(:'push_note_id')->'subscriptions'), 1);
select public.push_delivered('{}', '{https://push.example/abc}');
reset role;
select pg_temp.eq('a subscription the browser dropped is forgotten',
  (select count(*) from public.push_subscriptions where endpoint = 'https://push.example/abc'), 0::bigint);

-- ==== 34. Nearby listings and meet-up safety ==================================
select name as an_area, lat as area_lat, lng as area_lng from public.service_areas order by name limit 1 \gset
select set_config('request.jwt.claim.sub', :tunde, true);
set local role authenticated;
insert into public.classifieds(seller_id, title, price, category, location, description, area, lat, lng)
values (auth.uid(), 'Standing fan', 18000, 'Used goods', 'Near the market', 'Works well, three speeds, selling because I moved.', :'an_area', 0, 0)
returning id \gset fan_
reset role;
select pg_temp.eq('a listing sits at its area''s centre, whatever the poster sent',
  (select lat from public.classifieds where id = :'fan_id'), (:area_lat)::numeric);
select set_config('request.jwt.claim.sub', :customer, true);
set local role authenticated;
select pg_temp.eq('a search around that point finds it',
  (select count(*) from jsonb_array_elements(public.nearby_classifieds(:area_lat, :area_lng, 5, null)) ad where ad->>'id' = :'fan_id'), 1::bigint);
select pg_temp.eq('a search far away does not',
  (select count(*) from jsonb_array_elements(public.nearby_classifieds(:area_lat + 5, :area_lng + 5, 5, null)) ad where ad->>'id' = :'fan_id'), 0::bigint);

select pg_temp.fails('a meet-up needs a time in the future',
  format($$ select public.propose_meetup(%L, 'Ikeja City Mall, main entrance', now() - interval '1 hour') $$, :'fan_id'), 'invalid meeting time');
insert into t_ids select 'meetup', public.propose_meetup(:'fan_id', 'Ikeja City Mall, main entrance', now() + interval '2 days');
select pg_temp.fails('only the seller confirms a meet-up',
  format($$ select public.update_meetup(%L, 'confirm') $$, (select v from t_ids where k = 'meetup')), 'meet-up cannot be changed');
select public.start_location_share((select v from t_ids where k = 'meetup'), 30);
select public.update_location_share((select v from t_ids where k = 'meetup'), 6.6, 3.34);
select pg_temp.eq('you do not see your own position echoed as the other person''s',
  public.meetup_locations((select v from t_ids where k = 'meetup'))->'theirs', 'null'::jsonb);
select pg_temp.fails('shared positions cannot be read from the table',
  $$ select lat from public.location_shares $$, 'permission denied');
reset role;
select set_config('request.jwt.claim.sub', :tunde, true);
set local role authenticated;
select public.update_meetup((select v from t_ids where k = 'meetup'), 'confirm');
select pg_temp.eq('the other person sees the shared position',
  (public.meetup_locations((select v from t_ids where k = 'meetup'))->'theirs'->>'lat')::numeric, 6.6);
reset role;
select set_config('request.jwt.claim.sub', :mama, true);
set local role authenticated;
select pg_temp.fails('nobody else can see it',
  format($$ select public.meetup_locations(%L) $$, (select v from t_ids where k = 'meetup')), 'meet-up not found');
reset role;
update public.location_shares set expires_at = now() - interval '1 minute' where meetup_id = (select v from t_ids where k = 'meetup');
select set_config('request.jwt.claim.sub', :tunde, true);
set local role authenticated;
select pg_temp.eq('a share that has run out shows nothing',
  public.meetup_locations((select v from t_ids where k = 'meetup'))->'theirs', 'null'::jsonb);
reset role;
select set_config('request.jwt.claim.sub', :customer, true);
set local role authenticated;
select pg_temp.fails('and can no longer be updated',
  format($$ select public.update_location_share(%L, 6.61, 3.35) $$, (select v from t_ids where k = 'meetup')), 'location sharing has ended');

select public.save_trusted_contact('Chioma', '+2348051112222');
select pg_temp.fails('a trusted contact needs a full international number',
  $$ select public.save_trusted_contact('Bad', '0805') $$, '23514');
insert into t_ids select 'sos', public.raise_sos((select v from t_ids where k = 'meetup'), 6.6, 3.34, 'I feel unsafe');
select pg_temp.eq('pressing SOS again updates the alert instead of adding another',
  public.raise_sos(null, 6.61, 3.35, null), (select v from t_ids where k = 'sos'));
select set_config('request.method', 'POST', true);
select set_config('request.path', '/rpc/raise_sos', true);
reset role;
update public.profiles set suspended_at = now() where id = :customer;
select set_config('request.jwt.claim.sub', :customer, true);
set local role authenticated;
select public.check_request();
select pg_temp.eq('SOS is allowed through the API hook even for a suspended account', true, true);
reset role;
update public.profiles set suspended_at = null where id = :customer;
select set_config('request.method', '', true);
select set_config('request.path', '', true);
select pg_temp.eq('staff are told about an SOS',
  (select count(*) from public.notifications where profile_id = :admin and ref_type = 'admin_sos'), 1::bigint);
select set_config('request.jwt.claim.sub', :mama, true);
set local role authenticated;
select pg_temp.eq('other users cannot see an SOS', (select count(*) from public.sos_alerts), 0::bigint);
select pg_temp.fails('or close one',
  format($$ select public.admin_handle_sos(%L, 'done') $$, (select v from t_ids where k = 'sos')), 'admins only');
reset role;
select set_config('request.jwt.claim.sub', :admin, true);
set local role authenticated;
select public.admin_handle_sos((select v from t_ids where k = 'sos'), 'Called the customer; they are safe.');
reset role;
select pg_temp.eq('handling an SOS is recorded', (select status from public.sos_alerts where id = (select v from t_ids where k = 'sos')), 'handled');

-- ==== 35. Organisations, purchase orders and invoices =========================
insert into public.wallet_transactions(profile_id, label, kind, balance_delta) values (:customer, 'Fixture funds', 'adjustment', 250000);
select set_config('request.jwt.claim.sub', :customer, true);
set local role authenticated;
insert into t_ids select 'org', public.create_organization('Okoro Foods Ltd', 50000);
select public.set_organization_member((select v from t_ids where k = 'org'), :tunde, 'buyer');
reset role;
select set_config('request.jwt.claim.sub', :tunde, true);
set local role authenticated;
select pg_temp.fails('a buyer cannot add members',
  format($$ select public.set_organization_member(%L, %L, 'buyer') $$, (select v from t_ids where k = 'org'), :femi), 'organisation owners only');
insert into t_ids select 'bulk_rfq', public.post_rfq((select v from t_ids where k = 'org'), 'Rice and oil for the canteen', 'Monthly supply', '2 weeks', 400000, 3,
  '[{"description":"50kg rice","quantity":20,"unit":"bags"},{"description":"Vegetable oil 25L","quantity":5,"unit":"kegs"}]');
select pg_temp.eq('a bulk request keeps its lines',
  (select count(*) from public.rfq_items where rfq_id = (select v from t_ids where k = 'bulk_rfq')), 2::bigint);
reset role;
select set_config('request.jwt.claim.sub', :femi, true);
set local role authenticated;
select pg_temp.fails('a request for verified businesses refuses other suppliers',
  format($$ insert into public.rfq_quotes(rfq_id, supplier_id, price) values (%L, auth.uid(), 100000) $$, (select v from t_ids where k = 'bulk_rfq')),
  'supplier_not_verified');
select pg_temp.fails('outsiders cannot post requests for an organisation',
  format($$ select public.post_rfq(%L, 'Not ours', '', null, null, 0, null) $$, (select v from t_ids where k = 'org')), 'not a member of that organisation');
reset role;
select set_config('request.jwt.claim.sub', :mama, true);
set local role authenticated;
insert into public.rfq_quotes(rfq_id, supplier_id, price, lead_time)
values ((select v from t_ids where k = 'bulk_rfq'), auth.uid(), 120000, '5 days') returning id \gset bulk_quote_
reset role;
select set_config('request.jwt.claim.sub', :tunde, true);
set local role authenticated;
insert into t_ids select 'po', public.accept_rfq_quote(:'bulk_quote_id');
select pg_temp.eq('a purchase above the threshold waits for an approver',
  (select status from public.purchase_orders where id = (select v from t_ids where k = 'po')), 'pending_approval');
select pg_temp.fails('the buyer who raised it cannot approve it',
  format($$ select public.review_purchase_order(%L, true, '') $$, (select v from t_ids where k = 'po')), 'organisation approvers only');
reset role;
select pg_temp.eq('nothing is taken until it is approved',
  (select count(*) from public.wallet_transactions where purchase_order_id = (select v from t_ids where k = 'po')), 0::bigint);
select set_config('request.jwt.claim.sub', :customer, true);
set local role authenticated;
select pg_temp.balance(:customer) as owner_before \gset
select public.review_purchase_order((select v from t_ids where k = 'po'), true, 'Go ahead');
select pg_temp.eq('approval moves the money from the organisation''s wallet into escrow',
  pg_temp.balance(:customer), (:owner_before - 120000)::bigint);
select pg_temp.eq('and issues the supplier''s invoice',
  (select status from public.invoices where purchase_order_id = (select v from t_ids where k = 'po')), 'issued');
reset role;
select set_config('request.jwt.claim.sub', :tunde, true);
set local role authenticated;
select pg_temp.fails('a buyer cannot mark the supplier''s delivery',
  format($$ select public.mark_purchase_order_delivered(%L, null) $$, (select v from t_ids where k = 'po')), 'purchase order not found');
reset role;
select set_config('request.jwt.claim.sub', :mama, true);
set local role authenticated;
select pg_temp.fails('a supplier cannot pay themselves',
  format($$ select public.confirm_purchase_order(%L) $$, (select v from t_ids where k = 'po')), 'purchase order not found');
select public.mark_purchase_order_delivered((select v from t_ids where k = 'po'), null);
reset role;
select set_config('request.jwt.claim.sub', :tunde, true);
set local role authenticated;
select public.hold_purchase_order((select v from t_ids where k = 'po'), 'Two bags were torn and under weight.');
select pg_temp.fails('a held payment cannot simply be released',
  format($$ select public.confirm_purchase_order(%L) $$, (select v from t_ids where k = 'po')), 'purchase order cannot be changed');
reset role;
select set_config('request.jwt.claim.sub', :mama, true);
set local role authenticated;
select pg_temp.fails('nor decided by the supplier',
  format($$ select public.admin_resolve_purchase_order(%L, 'release', '') $$, (select v from t_ids where k = 'po')), 'admins only');
reset role;
select set_config('request.jwt.claim.sub', :admin, true);
set local role authenticated;
select public.admin_resolve_purchase_order((select v from t_ids where k = 'po'), 'release', 'Delivery photos show the full order.');
reset role;
select pg_temp.eq('staff releasing a held order pays the supplier less commission',
  (select sum(balance_delta) from public.wallet_transactions where profile_id = :mama and purchase_order_id = (select v from t_ids where k = 'po')),
  (select (amount - commission)::bigint from public.purchase_orders where id = (select v from t_ids where k = 'po')));
select pg_temp.eq('nothing is left in escrow for it',
  (select sum(escrow_delta) from public.wallet_transactions where purchase_order_id = (select v from t_ids where k = 'po')), 0::bigint);
select pg_temp.eq('and the invoice is paid',
  (select status from public.invoices where purchase_order_id = (select v from t_ids where k = 'po')), 'paid');

-- Within the threshold a buyer commits the organisation alone; cancelling refunds it.
select set_config('request.jwt.claim.sub', :tunde, true);
set local role authenticated;
insert into t_ids select 'small_rfq', public.post_rfq((select v from t_ids where k = 'org'), 'Napkins', '', null, null, 0, null);
reset role;
select set_config('request.jwt.claim.sub', :mama, true);
set local role authenticated;
insert into public.rfq_quotes(rfq_id, supplier_id, price) values ((select v from t_ids where k = 'small_rfq'), auth.uid(), 30000) returning id \gset small_quote_
reset role;
select pg_temp.balance(:customer) as owner_before_small \gset
select set_config('request.jwt.claim.sub', :tunde, true);
set local role authenticated;
insert into t_ids select 'small_po', public.accept_rfq_quote(:'small_quote_id');
select pg_temp.eq('a purchase within the threshold is funded at once',
  (select status from public.purchase_orders where id = (select v from t_ids where k = 'small_po')), 'funded');
reset role;
select set_config('request.jwt.claim.sub', :mama, true);
set local role authenticated;
select public.cancel_purchase_order((select v from t_ids where k = 'small_po'));
reset role;
select pg_temp.eq('a supplier who cancels before delivery refunds the organisation in full',
  pg_temp.balance(:customer), (:owner_before_small)::bigint);
select pg_temp.eq('and voids the invoice',
  (select status from public.invoices where purchase_order_id = (select v from t_ids where k = 'small_po')), 'void');

select set_config('request.jwt.claim.sub', :customer, true);
set local role authenticated;
select public.set_organization_supplier((select v from t_ids where k = 'org'), :mama, 'blocked', 'Cancelled an order');
insert into t_ids select 'blocked_rfq', public.post_rfq((select v from t_ids where k = 'org'), 'Cleaning supplies', '', null, null, 0, null);
reset role;
select set_config('request.jwt.claim.sub', :mama, true);
set local role authenticated;
select pg_temp.fails('a blocked supplier cannot quote on the organisation''s requests',
  format($$ insert into public.rfq_quotes(rfq_id, supplier_id, price) values (%L, auth.uid(), 9000) $$, (select v from t_ids where k = 'blocked_rfq')),
  'supplier_blocked');
reset role;
select set_config('request.jwt.claim.sub', :tunde, true);
set local role authenticated;
select pg_temp.eq('the dashboard totals what the organisation has paid suppliers',
  (public.procurement_summary((select v from t_ids where k = 'org'))->>'spent')::integer, 120000);
reset role;
select set_config('request.jwt.claim.sub', :femi, true);
set local role authenticated;
select pg_temp.fails('outsiders cannot read an organisation''s spend',
  format($$ select public.procurement_summary(%L) $$, (select v from t_ids where k = 'org')), 'not a member of that organisation');
select pg_temp.eq('or its purchase orders', (select count(*) from public.purchase_orders), 0::bigint);
select pg_temp.eq('or its invoices', (select count(*) from public.invoices), 0::bigint);
reset role;
select
  (select coalesce(sum(b.released_fee + b.commission), 0) from public.bookings b
    where exists (select 1 from public.wallet_transactions w where w.booking_id = b.id and w.kind = 'release' and w.created_at = now()))
  + (select coalesce(sum(o.commission), 0) from public.orders o
    where o.seller_id is not null and o.status = 'delivered' and exists (select 1 from public.wallet_transactions w
      where w.order_id = o.id and w.kind = 'release' and w.created_at = now()))
  + (select coalesce(sum(commission), 0) from public.purchase_orders where status = 'completed') as fees_with_pos \gset
select set_config('request.jwt.claim.sub', :admin, true);
set local role authenticated;
select pg_temp.eq('reported fees include wholesale commission and still reconcile',
  (public.admin_analytics(now(), now() + interval '1 second')->'period'->>'marketplace_fees')::bigint, :fees_with_pos::bigint);
reset role;

-- ==== 36. Lessons, quizzes, certificates and internships ======================
select set_config('request.jwt.claim.sub', :tunde, true);
set local role authenticated;
select pg_temp.fails('course material cannot be read from the table',
  $$ select body from public.course_lessons limit 1 $$, 'permission denied');
select pg_temp.eq('someone not enrolled sees the lesson list without the material',
  public.course_content('pattern-cutting-basics')->0->'body', 'null'::jsonb);
select pg_temp.fails('only content staff write courses',
  $$ select public.admin_save_course(null, 'Free money course', 'General', 'Me', '', 0, 70, 'live', null, null) $$, 'admins only');
reset role;
select set_config('request.jwt.claim.sub', :admin, true);
set local role authenticated;
select public.admin_save_course(null, 'Food hygiene for caterers', 'Catering', 'FindWork Academy', 'Keep customers safe.', 0, 60, 'live',
  '[{"title":"Clean hands","minutes":5,"body":"Wash for twenty seconds before handling food."},{"title":"Safe temperatures","minutes":8,"video_url":"https://videos.example/temperatures"}]',
  '[{"prompt":"How long should you wash your hands?","options":["Five seconds","Twenty seconds"],"correct_index":1},{"prompt":"Hot food is kept above which temperature?","options":["63°C","20°C","5°C"],"correct_index":0}]') as hygiene \gset
reset role;
select set_config('request.jwt.claim.sub', :tunde, true);
set local role authenticated;
select pg_temp.fails('the quiz answers are never readable',
  $$ select correct_index from public.quiz_questions limit 1 $$, 'permission denied');
select public.enroll_in_course(:'hygiene');
select pg_temp.eq('an enrolled learner gets the material',
  public.course_content(:'hygiene')->0->>'body', 'Wash for twenty seconds before handling food.');
select pg_temp.fails('the quiz waits until the lessons are done',
  format($$ select public.submit_quiz(%L, '{1,0}') $$, :'hygiene'), 'finish the lessons first');
select public.complete_lesson((select id from public.course_lessons where course_id = :'hygiene' and position = 1));
select public.complete_lesson((select id from public.course_lessons where course_id = :'hygiene' and position = 2));
reset role;
select pg_temp.eq('finishing the lessons of a course with a quiz does not itself earn the certificate',
  (select count(*) from public.certificates where profile_id = :tunde), 0::bigint);
select set_config('request.jwt.claim.sub', :tunde, true);
set local role authenticated;
select pg_temp.eq('a failed attempt says how many were right, not which',
  public.submit_quiz(:'hygiene', '{0,2}') - 'pass_mark', '{"score": 0, "passed": false, "correct": 0, "total": 2}'::jsonb);
select pg_temp.eq('a pass is recorded', (public.submit_quiz(:'hygiene', '{1,0}')->>'passed')::boolean, true);
select code as cert_code from public.certificates where profile_id = :tunde \gset
select pg_temp.eq('a pass earns one certificate', (select count(*) from public.certificates where profile_id = auth.uid()), 1::bigint);
reset role;
set local role anon;
select public.verify_certificate(lower(:'cert_code'))->>'course_title' as verified_title,
  public.verify_certificate('FW-NOTREAL000') is null as fake_unknown \gset
reset role;
select pg_temp.eq('anyone can check a certificate by its code, without signing in', :'verified_title'::text, 'Food hygiene for caterers'::text);
select pg_temp.eq('a made-up code verifies nothing', :'fake_unknown'::boolean, true);

-- Internships: posted by an identified employer, applied to once, decided by the employer.
select set_config('request.jwt.claim.sub', :tunde, true);
set local role authenticated;
select public.save_skills('{Sewing, " pattern cutting ", Sewing}');
select pg_temp.fails('an unverified account cannot post an internship',
  $$ select public.post_internship('Tunde Ventures', 'Workshop intern', 'Help out.', '{sewing}', null, 'Yaba', '3 months', 20000, null) $$,
  'verification required to post');
reset role;
select set_config('request.jwt.claim.sub', :mama, true);
set local role authenticated;
insert into t_ids select 'internship', public.post_internship('Mama Nkechi Styles', 'Tailoring intern', 'Learn finishing and fitting in a busy shop.',
  '{Sewing, "Pattern cutting", Embroidery}', null, 'Surulere', '3 months', 30000, null);
select pg_temp.fails('an employer cannot apply to their own internship',
  format($$ select public.apply_to_internship(%L, 'I would like to apply to my own listing please.') $$, (select v from t_ids where k = 'internship')),
  'cannot apply to your own internship');
reset role;
select set_config('request.jwt.claim.sub', :tunde, true);
set local role authenticated;
select pg_temp.eq('matching shows how much of what is asked for the person has',
  (select (row->'match'->>'score')::integer from jsonb_array_elements(public.internship_matches()) row
    where row->>'id' = (select v::text from t_ids where k = 'internship')), 60);
insert into t_ids select 'application', public.apply_to_internship((select v from t_ids where k = 'internship'), 'I sew at home and want to learn finishing properly.');
select pg_temp.fails('one application per internship',
  format($$ select public.apply_to_internship(%L, 'Applying a second time for the same place.') $$, (select v from t_ids where k = 'internship')), '23505');
select pg_temp.fails('an applicant cannot accept themselves',
  format($$ select public.update_internship_application(%L, 'accepted') $$, (select v from t_ids where k = 'application')), 'application not found');
reset role;
select set_config('request.jwt.claim.sub', :femi, true);
set local role authenticated;
select pg_temp.eq('other people cannot read an application', (select count(*) from public.internship_applications), 0::bigint);
reset role;
select set_config('request.jwt.claim.sub', :mama, true);
set local role authenticated;
select pg_temp.eq('the employer sees the applicant''s matched skills',
  (select cardinality(matched_skills) from public.internship_applications where id = (select v from t_ids where k = 'application')), 2);
select public.update_internship_application((select v from t_ids where k = 'application'), 'accepted');
select pg_temp.fails('a decided application stays decided',
  format($$ select public.update_internship_application(%L, 'rejected') $$, (select v from t_ids where k = 'application')), 'application already decided');
reset role;
select pg_temp.eq('the applicant is told',
  (select count(*) from public.notifications where profile_id = :tunde and title = 'Your application was accepted'), 1::bigint);

-- ==== 37. Stories, reels and livestream selling ===============================
insert into storage.objects(bucket_id, name, owner, metadata) values
  ('social-media', :mama || '/reel.mp4', :mama, '{"mimetype":"video/mp4","size":4096}'),
  ('social-media', :mama || '/story.jpg', :mama, '{"mimetype":"image/jpeg","size":2048}'),
  ('social-media', :mama || '/draft.jpg', :mama, '{"mimetype":"image/jpeg","size":2048}');
select set_config('request.jwt.claim.sub', :customer, true);
set local role authenticated;
select pg_temp.fails('only sellers post', format($$ select public.publish_post('story', %L, '', null) $$, :customer || '/x.jpg'), 'provider not found');
reset role;
select set_config('request.jwt.claim.sub', :mama, true);
set local role authenticated;
select pg_temp.fails('a reel must be a video',
  format($$ select public.publish_post('reel', %L, 'A photo', null) $$, :mama || '/story.jpg'), 'unsupported media type');
select pg_temp.fails('a post can only tag the seller''s own product',
  format($$ select public.publish_post('reel', %L, 'Mine?', 'palm-oil') $$, :mama || '/reel.mp4'), 'product not found');
insert into t_ids select 'reel', public.publish_post('reel', :mama || '/reel.mp4', 'New fabric just in', 'risk-check-fabric');
insert into t_ids select 'story', public.publish_post('story', :mama || '/story.jpg', 'Open till six', null);
select public.record_post_view((select v from t_ids where k = 'reel'));
reset role;
select pg_temp.eq('an author watching their own post is not counted',
  (select views from public.social_posts where id = (select v from t_ids where k = 'reel')), 0);
select set_config('request.jwt.claim.sub', :customer, true);
set local role authenticated;
select public.record_post_view((select v from t_ids where k = 'reel'));
select public.record_post_view((select v from t_ids where k = 'reel'));
select pg_temp.eq('a viewer is counted once', (select views from public.social_posts where id = (select v from t_ids where k = 'reel')), 1);
select pg_temp.eq('liking a post counts', (public.toggle_post_like((select v from t_ids where k = 'reel'))->>'likes')::integer, 1);
select pg_temp.eq('liking again takes it back', (public.toggle_post_like((select v from t_ids where k = 'reel'))->>'likes')::integer, 0);
select pg_temp.eq('the feed carries the tagged product',
  (select row->'product'->>'id' from jsonb_array_elements(public.social_feed('reel', null)) row where row->>'id' = (select v::text from t_ids where k = 'reel')),
  'risk-check-fabric');
select pg_temp.eq('viewers can open published media',
  (select count(*) from storage.objects where bucket_id = 'social-media' and name = :mama || '/reel.mp4'), 1::bigint);
select pg_temp.eq('but not a seller''s unpublished uploads',
  (select count(*) from storage.objects where bucket_id = 'social-media' and name = :mama || '/draft.jpg'), 0::bigint);
reset role;
update public.social_posts set expires_at = now() - interval '1 minute' where id = (select v from t_ids where k = 'story');
select set_config('request.jwt.claim.sub', :customer, true);
set local role authenticated;
select pg_temp.eq('a story disappears after its day',
  (select count(*) from jsonb_array_elements(public.social_feed('story', null)) row where row->>'id' = (select v::text from t_ids where k = 'story')), 0::bigint);
select pg_temp.eq('and so does its media',
  (select count(*) from storage.objects where bucket_id = 'social-media' and name = :mama || '/story.jpg'), 0::bigint);
insert into public.reports(reporter_id, target_type, target_id, reason) values (auth.uid(), 'post', (select v::text from t_ids where k = 'reel'), 'Misleading');
reset role;
select set_config('request.jwt.claim.sub', :admin, true);
set local role authenticated;
select public.admin_resolve_report((select id from public.reports where target_type = 'post' limit 1), 'remove');
reset role;
select set_config('request.jwt.claim.sub', :customer, true);
set local role authenticated;
select pg_temp.eq('a post a moderator removes leaves the feed',
  (select count(*) from jsonb_array_elements(public.social_feed('reel', null)) row where row->>'id' = (select v::text from t_ids where k = 'reel')), 0::bigint);

-- A stream: scheduled, started, chatted in, a product pinned, ended.
insert into public.favourites(profile_id, provider_id) values (auth.uid(), :mama) on conflict do nothing;
reset role;
select set_config('request.jwt.claim.sub', :mama, true);
set local role authenticated;
select pg_temp.fails('a stream needs a secure link to the video',
  $$ select public.schedule_stream('Friday sale', 'http://example.com/live', null, '{}') $$, 'invalid stream link');
select pg_temp.fails('a stream can only sell the seller''s own goods',
  $$ select public.schedule_stream('Friday sale', 'https://video.example/live', null, '{palm-oil}') $$, 'product not found');
insert into t_ids select 'stream', public.schedule_stream('Friday fabric sale', 'https://video.example/live.m3u8', now() + interval '1 hour', '{risk-check-fabric}');
reset role;
select set_config('request.jwt.claim.sub', :customer, true);
set local role authenticated;
select pg_temp.fails('nobody chats before the stream is live',
  format($$ select public.send_stream_message(%L, 'Hello') $$, (select v from t_ids where k = 'stream')), 'stream is not live');
select pg_temp.fails('a viewer cannot start someone else''s stream',
  format($$ select public.update_stream(%L, 'start', null) $$, (select v from t_ids where k = 'stream')), 'stream not found');
reset role;
select set_config('request.jwt.claim.sub', :mama, true);
set local role authenticated;
select public.update_stream((select v from t_ids where k = 'stream'), 'start', null);
select public.update_stream((select v from t_ids where k = 'stream'), 'pin', 'risk-check-fabric');
reset role;
select pg_temp.eq('going live tells the people who saved the seller',
  (select count(*) from public.notifications where profile_id = :customer and ref_type = 'stream'), 1::bigint);
select set_config('request.jwt.claim.sub', :customer, true);
set local role authenticated;
insert into t_ids select 'stream_message', public.send_stream_message((select v from t_ids where k = 'stream'), 'How much for two yards?');
select pg_temp.fails('chat is paced', format($$ select public.send_stream_message(%L, 'And three?') $$, (select v from t_ids where k = 'stream')), 'slow down');
select pg_temp.eq('a viewer is counted as watching', public.stream_heartbeat((select v from t_ids where k = 'stream')), 1);
select pg_temp.fails('a viewer cannot delete chat',
  format($$ select public.remove_stream_message(%L) $$, (select v from t_ids where k = 'stream_message')), 'message not found');
reset role;
select set_config('request.jwt.claim.sub', :mama, true);
set local role authenticated;
select public.remove_stream_message((select v from t_ids where k = 'stream_message'));
select public.update_stream((select v from t_ids where k = 'stream'), 'end', null);
reset role;
select pg_temp.eq('the seller can clear a message and end the stream',
  (select status || ':' || (select count(*) from public.stream_messages where stream_id = s.id) from public.live_streams s where id = (select v from t_ids where k = 'stream')), 'ended:0');

-- ==== 38. Matching, chat context and behaviour analytics ======================
select category as mama_trade, coalesce(area, '') as mama_area from public.provider_profiles where id = :mama \gset
select set_config('request.jwt.claim.sub', :customer, true);
set local role authenticated;
insert into public.job_posts(customer_id, title, description, budget, category, area)
values (auth.uid(), 'A job in their trade', 'Matching fixture', 500000, :'mama_trade', nullif(:'mama_area', ''))
returning id \gset match_job_
select pg_temp.eq('a provider in the job''s trade is matched on it, in full',
  (select (row->'match'->>'skill')::integer from jsonb_array_elements(public.match_providers_for_job(:'match_job_id')) row where row->>'id' = '00000000-0000-0000-0000-000000000005'), 40);
select pg_temp.eq('every match explains itself and adds up',
  (select count(*) from jsonb_array_elements(public.match_providers_for_job(:'match_job_id')) row
    where (row->'match'->>'score')::integer <> (row->'match'->>'skill')::integer + (row->'match'->>'location')::integer
      + (row->'match'->>'budget')::integer + (row->'match'->>'availability')::integer + (row->'match'->>'reputation')::integer), 0::bigint);
select public.invite_provider_to_job(:'match_job_id', :mama);
select public.invite_provider_to_job(:'match_job_id', :mama);
reset role;
select pg_temp.eq('an invitation is sent once',
  (select count(*) from public.notifications where profile_id = :mama and ref_type = 'open_job' and ref_id = :'match_job_id'), 1::bigint);
select set_config('request.jwt.claim.sub', :tunde, true);
set local role authenticated;
select pg_temp.fails('only the customer who posted a job sees its matches',
  format($$ select public.match_providers_for_job(%L) $$, :'match_job_id'), 'not your job');
reset role;
select set_config('request.jwt.claim.sub', :mama, true);
set local role authenticated;
select pg_temp.eq('the provider sees that job among their recommendations, marked as an invitation',
  (select (row->>'invited')::boolean from jsonb_array_elements(public.recommended_jobs()) row where row->>'id' = :'match_job_id'), true);
reset role;
select set_config('request.jwt.claim.sub', :customer, true);
set local role authenticated;
select pg_temp.eq('recommendations never include a product''s own seller''s view of it',
  (select count(*) from jsonb_array_elements(public.recommended_products('risk-check-fabric')) row where row->>'id' = 'risk-check-fabric'), 0::bigint);
select public.recommended_providers() is not null as has_recommendations \gset

-- A chat shows the open order between the two people, and nobody else's.
select public.get_or_create_thread(:mama) as ctx_thread \gset
select pg_temp.eq('a chat knows nothing is open when nothing is',
  public.thread_context(:'ctx_thread')->'order', 'null'::jsonb);
insert into t_ids select 'ctx_order', (public.place_order('[{"product_id":"risk-check-fabric","qty":1}]', 'standard', E'Ada\n14 Test Street', '+2348034129087', 6200))[1];
select pg_temp.eq('and shows the open order between the two',
  public.thread_context(:'ctx_thread')->'order'->>'id', (select v::text from t_ids where k = 'ctx_order'));
reset role;
select set_config('request.jwt.claim.sub', :tunde, true);
set local role authenticated;
select pg_temp.fails('an outsider cannot read a chat''s context',
  format($$ select public.thread_context(%L) $$, :'ctx_thread'), 'thread not found');

-- Activity is recorded by route shape, respects an opt-out, and is staff-only to read.
select public.track_events('session-aaaa-1111', '[{"name":"page_view","path":"/provider/:id"},{"name":"page_view","path":"/book/:id/time"},{"name":"DROP TABLE","path":"/x"}]');
reset role;
select pg_temp.eq('well-formed events are recorded and malformed ones dropped',
  (select count(*) from public.activity_events where profile_id = :tunde), 2::bigint);
select set_config('request.jwt.claim.sub', :tunde, true);
set local role authenticated;
select pg_temp.fails('events cannot be read by users', $$ select count(*) from public.activity_events $$, 'permission denied');
select pg_temp.fails('or the engagement report', $$ select public.admin_engagement(now() - interval '1 day', now() + interval '1 day') $$, 'admins only');
select public.set_analytics_consent(false);
select public.track_events('session-aaaa-1111', '[{"name":"page_view","path":"/home"}]');
reset role;
select pg_temp.eq('opting out stops recording and erases what was kept',
  (select count(*) from public.activity_events where profile_id = :tunde), 0::bigint);
select set_config('request.jwt.claim.sub', :customer, true);
set local role authenticated;
select public.track_events('session-bbbb-2222', '[{"name":"page_view","path":"/provider/:id"},{"name":"page_view","path":"/product/:id"},{"name":"page_view","path":"/checkout"}]');
reset role;
select set_config('request.jwt.claim.sub', :admin, true);
set local role authenticated;
select pg_temp.eq('the funnel counts people, by the shape of the route',
  (public.admin_engagement(now() - interval '1 day', now() + interval '1 day')->'booking_funnel'->>'viewed_a_provider')::integer, 1);
select pg_temp.eq('one account''s activity can be looked up by staff',
  (public.admin_user_activity(:customer)->>'page_views')::integer, 3);
select pg_temp.eq('and shows an opt-out as such', (public.admin_user_activity(:tunde)->>'opted_out')::boolean, true);
reset role;

-- ==== 39. The assistant is metered, and a case file is staff-only =============
select set_config('request.jwt.claim.sub', :customer, true);
set local role authenticated;
select pg_temp.fails('users cannot grant themselves assistant use',
  format($$ select public.assistant_allow(%L, 'support') $$, :customer), 'permission denied');
select pg_temp.fails('a participant cannot pull the staff case file',
  format($$ select public.dispute_case_file(%L) $$, :'response_case_id'), 'admins only');
reset role;
set local role service_role;
select pg_temp.eq('a request within the allowance is let through', public.assistant_allow(:customer, 'support'), true);
reset role;
insert into public.assistant_usage(profile_id, task) select :customer, 'command' from generate_series(1, 59);
set local role service_role;
select pg_temp.eq('the sixty-first request in a day is refused', public.assistant_allow(:customer, 'translate'), false);
select pg_temp.eq('staff case summaries are not capped', public.assistant_allow(:customer, 'dispute'), true);
reset role;
select set_config('request.jwt.claim.sub', :admin, true);
set local role authenticated;
select pg_temp.eq('dispute staff get the claim and both sides'' responses',
  jsonb_array_length(public.dispute_case_file(:'response_case_id')->'responses'), 1);
reset role;

reset role;
select 'ALL BUSINESS RULE CHECKS PASSED' as result;
rollback;
