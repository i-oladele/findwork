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

select pg_temp.balance(auth.uid()) as before_order \gset
insert into t_ids
select 'o1', (public.place_order('[{"product_id":"ankara-wax-print","qty":2}]', 'standard', '14 Herbert Macaulay Way', '08034129087'))[1];
select pg_temp.eq('order total is catalog price x qty + delivery',
  (select total from public.orders where id = (select v from t_ids where k = 'o1')), 9800 * 2 + 1200);
select public.cancel_order((select v from t_ids where k = 'o1'));
select pg_temp.eq('cancelled order refunded', pg_temp.balance(auth.uid()), :before_order::bigint);

insert into t_ids
select 'o2', (public.place_order('[{"product_id":"palm-oil","qty":1}]', 'same-day', '14 Herbert Macaulay Way', ''))[1];
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
select public.subscribe_plan('pro');
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

reset role;
select 'ALL BUSINESS RULE CHECKS PASSED' as result;
rollback;
