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
  (select monday from t_when) + interval '4 days');
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
  public.checkout_quote('[{"product_id":"ankara-wax-print","qty":2}]', 'standard'),
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
  public.checkout_quote('[{"product_id":"ada-lace","qty":1},{"product_id":"palm-oil","qty":1}]', 'standard'),
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

reset role;
select 'ALL BUSINESS RULE CHECKS PASSED' as result;
rollback;
