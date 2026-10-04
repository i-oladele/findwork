-- PRD AI Job Matching and the recommendation links from listings, products
-- and jobs; behaviour analytics for onboarding, bookings and user
-- management; and what a chat is about.
--
-- The matching here is a fixed, explainable score: each match says how many
-- points came from the trade, the distance, the budget, availability and
-- reputation. It is not a learned model, and nothing here calls one.

-- ---------------------------------------------------------------------------
-- 1. Matching jobs and providers
-- ---------------------------------------------------------------------------

alter table public.job_posts
  add column category text,
  add column area text references public.service_areas(name);
grant update (category, area) on public.job_posts to authenticated;

-- Out of 100: trade 40, distance 25, budget 15, availability 10, reputation 10.
create function private.job_match(p_job public.job_posts, p_provider public.provider_profiles)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_skill integer; v_location integer; v_budget integer; v_availability integer; v_reputation integer;
  v_area public.service_areas; v_km numeric;
begin
  v_skill := case
    when p_job.category is not null and lower(p_job.category) = lower(p_provider.category) then 40
    when position(lower(p_provider.category) in lower(p_job.title || ' ' || p_job.description)) > 0 then 28
    else 0 end;

  if p_job.area is not null and p_job.area = p_provider.area then
    v_location := 25; v_km := 0;
  else
    select * into v_area from public.service_areas where name = p_job.area;
    if v_area.name is null or p_provider.lat is null then
      -- Nothing to measure: neither good nor bad.
      v_location := 8;
    else
      v_km := round(private.km_between(v_area.lat, v_area.lng, p_provider.lat, p_provider.lng)::numeric, 1);
      v_location := case when v_km <= 5 then 20 when v_km <= 15 then 12 when v_km <= 30 then 6 else 0 end;
    end if;
  end if;

  v_budget := case when p_provider.price <= p_job.budget then 15 when p_provider.price <= p_job.budget * 1.25 then 8 else 0 end;
  v_availability := case when p_provider.taking_bookings then 10 else 0 end;
  v_reputation := round(p_provider.rating / 5.0 * 6) + case when p_provider.trust_score >= 60 then 4 when p_provider.trust_score >= 30 then 2 else 0 end;

  return jsonb_build_object(
    'score', v_skill + v_location + v_budget + v_availability + v_reputation,
    'skill', v_skill, 'location', v_location, 'budget', v_budget, 'availability', v_availability, 'reputation', v_reputation, 'km', v_km);
end;
$$;
revoke all on function private.job_match(public.job_posts, public.provider_profiles) from public, anon, authenticated;

-- For the customer who posted a job: the providers that fit it best.
create function public.match_providers_for_job(p_job_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare j public.job_posts;
begin
  select * into j from public.job_posts where id = p_job_id;
  if j.id is null or j.customer_id <> auth.uid() then raise exception 'not your job'; end if;
  return coalesce((
    select jsonb_agg(row order by (row->'match'->>'score')::integer desc, row->>'business_name')
    from (
      select jsonb_build_object(
        'id', pp.id, 'business_name', pp.business_name, 'category', pp.category, 'area', pp.area, 'price', pp.price, 'price_unit', pp.price_unit,
        'rating', pp.rating, 'reviews', pp.reviews, 'verified', pp.verified, 'trust_score', pp.trust_score, 'photo', pp.photo_urls[1],
        'match', private.job_match(j, pp),
        'quoted', exists(select 1 from public.sent_quotes q where q.job_id = j.id and q.provider_id = pp.id),
        'invited', exists(select 1 from public.job_invites i where i.job_id = j.id and i.provider_id = pp.id)) as row
      from public.provider_profiles pp join public.profiles p on p.id = pp.id
      where pp.id <> j.customer_id and p.deleted_at is null and p.suspended_at is null
        and (private.job_match(j, pp)->>'skill')::integer > 0
      order by (private.job_match(j, pp)->>'score')::integer desc limit 20
    ) rows), '[]'::jsonb);
end;
$$;

create table public.job_invites (
  job_id uuid not null references public.job_posts(id) on delete cascade,
  provider_id uuid not null references public.provider_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (job_id, provider_id)
);
alter table public.job_invites enable row level security;
revoke all on public.job_invites from anon, authenticated;

create function public.invite_provider_to_job(p_job_id uuid, p_provider_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare j public.job_posts; v_new integer;
begin
  select * into j from public.job_posts where id = p_job_id;
  if j.id is null or j.customer_id <> auth.uid() then raise exception 'not your job'; end if;
  if j.status <> 'open' then raise exception 'job is closed'; end if;
  if (select count(*) from public.job_invites where job_id = p_job_id) >= 10 then raise exception 'too many invites'; end if;
  insert into public.job_invites(job_id, provider_id) values (p_job_id, p_provider_id) on conflict do nothing;
  get diagnostics v_new = row_count;
  if v_new = 1 then
    perform public.notify(p_provider_id, 'quote', 'You were invited to quote', j.title || ' · budget ₦' || to_char(j.budget, 'FM999,999,999'), 'open_job', j.id::text);
  end if;
end;
$$;

-- For a provider: the open jobs that fit them best.
create function public.recommended_jobs()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare pp public.provider_profiles;
begin
  select * into pp from public.provider_profiles where id = auth.uid();
  if pp.id is null then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(row order by (row->'match'->>'score')::integer desc, row->>'created_at' desc)
    from (
      select to_jsonb(j) || jsonb_build_object('match', private.job_match(j, pp),
        'invited', exists(select 1 from public.job_invites i where i.job_id = j.id and i.provider_id = pp.id)) as row
      from public.job_posts j
      where j.status = 'open' and j.customer_id <> pp.id and not public.is_suspended(j.customer_id)
        and not exists(select 1 from public.sent_quotes q where q.job_id = j.id and q.provider_id = pp.id)
      order by j.created_at desc limit 100
    ) rows), '[]'::jsonb);
end;
$$;

-- For Home: providers in the trades this person said they came for or has
-- booked before, nearer and better-regarded first.
create function public.recommended_providers()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_me public.profiles; v_wanted text[];
begin
  select * into v_me from public.profiles where id = auth.uid();
  if v_me.id is null then raise exception 'not authenticated'; end if;
  select coalesce(array_agg(distinct lower(c)), '{}') into v_wanted from (
    select unnest(interests) as c from public.user_preferences where profile_id = auth.uid()
    union select pp.category from public.bookings b join public.provider_profiles pp on pp.id = b.provider_id where b.customer_id = auth.uid()
  ) wanted;
  return coalesce((
    select jsonb_agg(row order by (row->>'score')::numeric desc)
    from (
      select jsonb_build_object(
        'id', pp.id, 'business_name', pp.business_name, 'category', pp.category, 'area', pp.area, 'price', pp.price, 'price_unit', pp.price_unit,
        'rating', pp.rating, 'reviews', pp.reviews, 'verified', pp.verified, 'trust_score', pp.trust_score, 'photo', pp.photo_urls[1],
        'reason', case when lower(pp.category) = any(v_wanted) then 'Matches what you look for'
          when pp.area is not null and pp.area = v_me.area then 'Near you' else 'Well reviewed' end,
        'score', (case when lower(pp.category) = any(v_wanted) then 40 else 0 end)
          + (case when pp.area is not null and pp.area = v_me.area then 25
                  when v_me.lat is not null and pp.lat is not null and private.km_between(v_me.lat, v_me.lng, pp.lat, pp.lng) <= 15 then 12 else 0 end)
          + pp.rating * 4 + least(pp.reviews, 10) + pp.trust_score / 10.0) as row
      from public.provider_profiles pp join public.profiles p on p.id = pp.id
      where pp.id <> auth.uid() and pp.taking_bookings and p.deleted_at is null and p.suspended_at is null
    ) rows limit 12), '[]'::jsonb);
end;
$$;

-- Products bought by the same customers as this one, then more from its
-- seller. With no product given, what sells most.
create function public.recommended_products(p_product_id text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(ranked) - 'weight' - 'reason_rank' order by ranked.reason_rank, ranked.weight desc)
    from (
      select distinct on (p.id) p.id, p.name, p.price, p.vendor, p.seller_id, p.image_url, p.photo_urls, p.stock, s.weight, s.reason, s.reason_rank
      from (
        -- Bought together.
        select oi2.product_id, count(distinct o2.customer_id)::numeric as weight, 'Bought with this' as reason, 1 as reason_rank
        from public.order_items oi join public.orders o on o.id = oi.order_id
        join public.orders o2 on o2.customer_id = o.customer_id
        join public.order_items oi2 on oi2.order_id = o2.id
        where p_product_id is not null and oi.product_id = p_product_id and oi2.product_id <> p_product_id
        group by oi2.product_id
        union all
        select p2.id, 1, 'More from this seller', 2
        from public.products p1 join public.products p2 on p2.seller_id is not distinct from p1.seller_id and p2.id <> p1.id
        where p_product_id is not null and p1.id = p_product_id
        union all
        select oi.product_id, count(*)::numeric, 'Popular', 3
        from public.order_items oi join public.orders o on o.id = oi.order_id
        where o.placed_at > now() - interval '60 days' and (p_product_id is null or oi.product_id <> p_product_id)
        group by oi.product_id
      ) s join public.products p on p.id = s.product_id
      where p.status = 'live' and (p.stock is null or p.stock > 0) and p.seller_id is distinct from auth.uid()
        and (p.seller_id is null or not public.is_suspended(p.seller_id))
      order by p.id, s.reason_rank, s.weight desc
    ) ranked limit 8), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. What a conversation is about
-- ---------------------------------------------------------------------------

-- The live booking, order, purchase order and dispute between the two
-- people in a chat, so the conversation has its context beside it.
create function public.thread_context(p_thread_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_other uuid;
begin
  if not public.is_thread_participant(p_thread_id) then raise exception 'thread not found'; end if;
  select profile_id into v_other from public.thread_participants where thread_id = p_thread_id and profile_id <> auth.uid() limit 1;
  if v_other is null then return '{}'::jsonb; end if;
  return jsonb_build_object(
    'booking', (select jsonb_build_object('id', b.id, 'service', b.service, 'status', b.status, 'start_at', b.start_at, 'mine', b.customer_id = auth.uid())
      from public.bookings b
      where ((b.customer_id = auth.uid() and b.provider_id = v_other) or (b.customer_id = v_other and b.provider_id = auth.uid()))
        and b.status in ('pending', 'active') order by b.start_at limit 1),
    'order', (select jsonb_build_object('id', o.id, 'status', o.status, 'total', o.total, 'mine', o.customer_id = auth.uid())
      from public.orders o
      where ((o.customer_id = auth.uid() and o.seller_id = v_other) or (o.customer_id = v_other and o.seller_id = auth.uid()))
        and o.status in ('placed', 'dispatched') order by o.placed_at desc limit 1),
    'purchase_order', (select jsonb_build_object('id', po.id, 'number', po.number, 'status', po.status, 'amount', po.amount)
      from public.purchase_orders po
      where ((po.buyer_id = auth.uid() and po.supplier_id = v_other) or (po.buyer_id = v_other and po.supplier_id = auth.uid()))
        and po.status in ('pending_approval', 'funded', 'delivered', 'on_hold') order by po.created_at desc limit 1),
    'dispute', (select jsonb_build_object('id', d.id, 'ref_type', d.ref_type, 'reason', left(d.reason, 80))
      from public.disputes d
      where ((d.raised_by = auth.uid() and d.against_id = v_other) or (d.raised_by = v_other and d.against_id = auth.uid()))
        and d.status = 'open' order by d.opened_at desc limit 1));
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Behaviour analytics
-- ---------------------------------------------------------------------------

-- People may turn this off; nothing is recorded for them afterwards.
alter table public.user_preferences add column analytics boolean not null default true;

create or replace function public.save_preferences(p_language text, p_muted_kinds text[], p_interests text[])
returns void language plpgsql security definer set search_path = public as $$
begin
  perform 1 from public.profiles where id = auth.uid() and deleted_at is null;
  if not found then raise exception 'not authenticated'; end if;
  if p_language is null or p_language not in ('en', 'pcm', 'yo', 'ig', 'ha') then raise exception 'invalid language'; end if;
  if cardinality(coalesce(p_interests, '{}')) > 20 or cardinality(coalesce(p_muted_kinds, '{}')) > 20 then raise exception 'too many choices'; end if;
  insert into public.user_preferences(profile_id, language, muted_kinds, interests)
  values (auth.uid(), p_language, coalesce(p_muted_kinds, '{}'), coalesce(p_interests, '{}'))
  on conflict (profile_id) do update
    set language = excluded.language, muted_kinds = excluded.muted_kinds, interests = excluded.interests, updated_at = now();
end;
$$;

create function public.set_analytics_consent(p_allowed boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  insert into public.user_preferences(profile_id, analytics) values (auth.uid(), coalesce(p_allowed, true))
  on conflict (profile_id) do update set analytics = excluded.analytics, updated_at = now();
  -- Turning it off also removes what was already recorded.
  if not coalesce(p_allowed, true) then delete from public.activity_events where profile_id = auth.uid(); end if;
end;
$$;

-- Which screens were opened and which actions taken. The path is the
-- route's shape ("/provider/:id"), never the id itself, and no free text.
create table public.activity_events (
  id bigint generated always as identity primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  session_id text not null check (char_length(session_id) between 8 and 64),
  name text not null check (name ~ '^[a-z_]{2,40}$'),
  path text not null default '' check (char_length(path) <= 120),
  created_at timestamptz not null default now()
);
create index activity_events_time on public.activity_events(created_at);
create index activity_events_owner on public.activity_events(profile_id, created_at desc);
alter table public.activity_events enable row level security;
revoke all on public.activity_events from anon, authenticated;

-- p_events: [{name, path}], at most 50 at a time.
create function public.track_events(p_session_id text, p_events jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  if exists(select 1 from public.user_preferences where profile_id = auth.uid() and not analytics) then return; end if;
  if p_session_id is null or char_length(p_session_id) not between 8 and 64 or p_events is null
     or jsonb_typeof(p_events) <> 'array' or jsonb_array_length(p_events) > 50 then return; end if;
  insert into public.activity_events(profile_id, session_id, name, path)
  select auth.uid(), p_session_id, e->>'name', left(coalesce(e->>'path', ''), 120)
  from jsonb_array_elements(p_events) e
  where coalesce(e->>'name', '') ~ '^[a-z_]{2,40}$';
end;
$$;

-- Events are kept for six months.
create function private.purge_activity_events()
returns integer language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  delete from public.activity_events where created_at < now() - interval '180 days';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function private.purge_activity_events() from public, anon, authenticated;
do $$
begin
  if exists(select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('purge-activity-events', '10 3 * * *', 'select private.purge_activity_events()');
  else
    raise notice 'Schedule private.purge_activity_events() daily.';
  end if;
end;
$$;

-- Engagement, bookings and marketplace breakdowns for a period.
create function public.admin_engagement(p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_result jsonb;
begin
  if not public.staff_can('analytics') then raise exception 'admins only'; end if;
  if p_from is null or p_to is null or p_to <= p_from or p_to - p_from > interval '366 days' then raise exception 'invalid report range'; end if;
  with ev as (
    select * from public.activity_events where created_at >= p_from and created_at < p_to
  ), views as (
    select * from ev where name = 'page_view'
  ), bk as (
    select b.*, pp.category, pp.area from public.bookings b join public.provider_profiles pp on pp.id = b.provider_id
    where b.created_at >= p_from and b.created_at < p_to
  ), od as (
    select * from public.orders where placed_at >= p_from and placed_at < p_to
  ), cohort as (
    -- Accounts old enough, within the period, to have had a second week.
    select id, created_at from public.profiles where created_at >= p_from and created_at < least(p_to, now()) - interval '7 days'
  )
  select jsonb_build_object(
    'sessions', (select count(distinct session_id) from ev),
    'page_views', (select count(*) from views),
    'people', (select count(distinct profile_id) from ev),
    'top_screens', coalesce((select jsonb_agg(jsonb_build_object('path', path, 'views', n, 'people', people) order by n desc)
      from (select path, count(*) n, count(distinct profile_id) people from views group by path order by 2 desc limit 15) t), '[]'::jsonb),
    'segments', jsonb_build_object(
      'providers', (select count(distinct e.profile_id) from ev e join public.provider_profiles pp on pp.id = e.profile_id),
      'riders', (select count(distinct e.profile_id) from ev e join public.rider_profiles r on r.id = e.profile_id and r.status = 'approved'),
      'business_buyers', (select count(distinct e.profile_id) from ev e join public.organization_members m on m.profile_id = e.profile_id),
      'verified', (select count(distinct e.profile_id) from ev e join public.profiles p on p.id = e.profile_id and p.verification_tier >= 2)),
    'booking_funnel', jsonb_build_object(
      'viewed_a_provider', (select count(distinct profile_id) from views where path = '/provider/:id'),
      'picked_a_time', (select count(distinct profile_id) from views where path = '/book/:id/time'),
      'reached_payment', (select count(distinct profile_id) from views where path = '/book/:id/pay'),
      'booked', (select count(distinct customer_id) from bk)),
    'shopping_funnel', jsonb_build_object(
      'viewed_a_product', (select count(distinct profile_id) from views where path = '/product/:id'),
      'opened_the_cart', (select count(distinct profile_id) from views where path = '/cart'),
      'reached_checkout', (select count(distinct profile_id) from views where path = '/checkout'),
      'ordered', (select count(distinct customer_id) from od)),
    'retention', jsonb_build_object(
      'new_accounts', (select count(*) from cohort),
      'back_after_a_week', (select count(*) from cohort c where exists(
        select 1 from public.activity_events e where e.profile_id = c.id and e.created_at >= c.created_at + interval '7 days'))),
    'bookings', jsonb_build_object(
      'created', (select count(*) from bk),
      'completed', (select count(*) from bk where status = 'done'),
      'cancelled', (select count(*) from bk where status = 'cancelled'),
      'average_value', coalesce((select round(avg(price)) from bk), 0),
      'rescheduled', (select count(distinct r.booking_id) from public.booking_reschedules r where r.created_at >= p_from and r.created_at < p_to),
      'by_category', coalesce((select jsonb_agg(jsonb_build_object('category', category, 'bookings', n, 'value', value) order by value desc)
        from (select category, count(*) n, sum(price) value from bk group by category) t), '[]'::jsonb),
      'by_area', coalesce((select jsonb_agg(jsonb_build_object('area', coalesce(area, 'Not set'), 'bookings', n) order by n desc)
        from (select area, count(*) n from bk group by area order by 2 desc limit 12) t), '[]'::jsonb)),
    'marketplace', jsonb_build_object(
      'orders_value', coalesce((select sum(total) from od), 0),
      'discounts_given', coalesce((select sum(discount) from od), 0),
      'top_sellers', coalesce((select jsonb_agg(jsonb_build_object('seller', seller, 'orders', n, 'value', value) order by value desc)
        from (select coalesce(seller_name, 'FindWork') seller, count(*) n, sum(items_total) value from od group by 1 order by 3 desc limit 10) t), '[]'::jsonb),
      'wholesale_value', coalesce((select sum(amount) from public.purchase_orders where status = 'completed' and closed_at >= p_from and closed_at < p_to), 0),
      'deliveries_completed', (select count(*) from public.deliveries where delivered_at >= p_from and delivered_at < p_to),
      'rider_payouts', coalesce((select sum(balance_delta) from public.wallet_transactions where kind = 'delivery' and created_at >= p_from and created_at < p_to), 0))
  ) into v_result;
  return v_result;
end;
$$;

-- One account's recorded activity over the last 30 days, for staff.
create function public.admin_user_activity(p_profile_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.staff_can('lookup') then raise exception 'admins only'; end if;
  return (
    with ev as (select * from public.activity_events where profile_id = p_profile_id and created_at > now() - interval '30 days')
    select jsonb_build_object(
      'recorded', exists(select 1 from ev),
      'opted_out', coalesce((select not analytics from public.user_preferences where profile_id = p_profile_id), false),
      'sessions', (select count(distinct session_id) from ev),
      'page_views', (select count(*) from ev where name = 'page_view'),
      'last_seen', (select max(created_at) from ev),
      'top_screens', coalesce((select jsonb_agg(jsonb_build_object('path', path, 'views', n) order by n desc)
        from (select path, count(*) n from ev where name = 'page_view' group by path order by 2 desc limit 8) t), '[]'::jsonb),
      'days', coalesce((select jsonb_agg(jsonb_build_object('date', day, 'events', n) order by day)
        from (select (created_at at time zone 'Africa/Lagos')::date as day, count(*) n from ev group by 1) t), '[]'::jsonb)));
end;
$$;

revoke all on function public.match_providers_for_job(uuid) from public, anon;
revoke all on function public.invite_provider_to_job(uuid, uuid) from public, anon;
revoke all on function public.recommended_jobs() from public, anon;
revoke all on function public.recommended_providers() from public, anon;
revoke all on function public.recommended_products(text) from public, anon;
revoke all on function public.thread_context(uuid) from public, anon;
revoke all on function public.set_analytics_consent(boolean) from public, anon;
revoke all on function public.track_events(text, jsonb) from public, anon;
revoke all on function public.admin_engagement(timestamptz, timestamptz) from public, anon;
revoke all on function public.admin_user_activity(uuid) from public, anon;
grant execute on function public.match_providers_for_job(uuid) to authenticated;
grant execute on function public.invite_provider_to_job(uuid, uuid) to authenticated;
grant execute on function public.recommended_jobs() to authenticated;
grant execute on function public.recommended_providers() to authenticated;
grant execute on function public.recommended_products(text) to authenticated;
grant execute on function public.thread_context(uuid) to authenticated;
grant execute on function public.set_analytics_consent(boolean) to authenticated;
grant execute on function public.track_events(text, jsonb) to authenticated;
grant execute on function public.admin_engagement(timestamptz, timestamptz) to authenticated;
grant execute on function public.admin_user_activity(uuid) to authenticated;

-- Recording activity must work for an account in any state, without ever
-- being the reason a request fails.
create or replace function public.check_request()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_method text := coalesce(current_setting('request.method', true), '');
  v_path text := coalesce(current_setting('request.path', true), '');
begin
  if auth.uid() is null then return; end if;
  if v_path = '/rpc/raise_sos' then return; end if;
  if private.session_aal() <> 'aal2' and private.has_verified_factor(auth.uid()) then
    raise exception 'mfa_required';
  end if;
  if v_method in ('GET', 'HEAD', 'OPTIONS') then return; end if;
  if v_path in ('/rpc/get_my_profile', '/rpc/wallet_summary', '/rpc/is_admin', '/rpc/staff_can', '/rpc/chat_inbox',
      '/rpc/mark_notification_read', '/rpc/record_sign_in', '/rpc/track_events', '/support_requests') then
    return;
  end if;
  if exists(select 1 from public.profiles where id = auth.uid() and suspended_at is not null) then
    raise exception 'account_suspended';
  end if;
end;
$$;
