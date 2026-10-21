-- PRD AI Job Matching, "Availability matching": a provider's 10 points for
-- availability now come from their calendar, not only from whether they are
-- taking bookings. A job can say the day it is needed by; the score counts
-- the working days the provider still has room on before then.
--
-- Still a fixed, explainable rule. A day "has room" when the provider works
-- that weekday and has less than six hours booked in it (09:00 to 18:00,
-- Lagos time), so at least three hours are free.

alter table public.job_posts
  add column needed_on date,
  add constraint job_posts_needed_on_check check (needed_on is null or needed_on <= (created_at at time zone 'Africa/Lagos')::date + 365);
grant update (needed_on) on public.job_posts to authenticated;

-- The working days with room between two Lagos dates (at most 31 of them).
create function private.free_days(p_provider_id uuid, p_from date, p_to date)
returns date[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(d.day order by d.day), '{}')
  from (select generate_series(p_from, least(p_to, p_from + 30), interval '1 day')::date as day) d
  left join public.provider_availability a on a.provider_id = p_provider_id
  where case extract(isodow from d.day)::int
          when 1 then coalesce(a.monday, true) when 2 then coalesce(a.tuesday, true) when 3 then coalesce(a.wednesday, true)
          when 4 then coalesce(a.thursday, true) when 5 then coalesce(a.friday, true) when 6 then coalesce(a.saturday, true)
          else coalesce(a.sunday, false) end
    and coalesce((
      select sum(extract(epoch from upper(r) - lower(r))) / 3600
      from (select b.slot_range * tstzrange((d.day + time '09:00') at time zone 'Africa/Lagos', (d.day + time '18:00') at time zone 'Africa/Lagos', '[)') as r
            from public.bookings b
            where b.provider_id = p_provider_id and b.status in ('pending', 'active')
              and b.slot_range && tstzrange((d.day + time '09:00') at time zone 'Africa/Lagos', (d.day + time '18:00') at time zone 'Africa/Lagos', '[)')) x
    ), 0) < 6;
$$;
revoke all on function private.free_days(uuid, date, date) from public, anon, authenticated;

-- Out of 100: trade 40, distance 25, budget 15, availability 10, reputation 10.
-- Availability: with a day needed, 10 for two or more free working days
-- before it, 6 for one, 0 for none; without one, 10 if free in the next
-- week and 4 if not. Nobody who has stopped taking bookings scores here.
create or replace function private.job_match(p_job public.job_posts, p_provider public.provider_profiles)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_skill integer; v_location integer; v_budget integer; v_availability integer; v_reputation integer;
  v_area public.service_areas; v_km numeric;
  v_today date := (now() at time zone 'Africa/Lagos')::date;
  v_by date;
  v_free date[] := '{}';
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

  -- A date already past is treated as no date: the customer still needs it done.
  v_by := case when p_job.needed_on >= v_today then p_job.needed_on end;
  if not p_provider.taking_bookings then
    v_availability := 0;
  elsif v_by is not null then
    -- The month before the day needed is what matters; earlier days are too far ahead to promise.
    v_free := private.free_days(p_provider.id, greatest(v_today, v_by - 30), v_by);
    v_availability := case when cardinality(v_free) >= 2 then 10 when cardinality(v_free) = 1 then 6 else 0 end;
  else
    v_free := private.free_days(p_provider.id, v_today, v_today + 6);
    v_availability := case when cardinality(v_free) > 0 then 10 else 4 end;
  end if;

  v_reputation := round(p_provider.rating / 5.0 * 6) + case when p_provider.trust_score >= 60 then 4 when p_provider.trust_score >= 30 then 2 else 0 end;

  return jsonb_build_object(
    'score', v_skill + v_location + v_budget + v_availability + v_reputation,
    'skill', v_skill, 'location', v_location, 'budget', v_budget, 'availability', v_availability, 'reputation', v_reputation, 'km', v_km,
    'taking_bookings', p_provider.taking_bookings, 'needed_on', v_by, 'free_days', cardinality(v_free), 'next_free', v_free[1]);
end;
$$;
revoke all on function private.job_match(public.job_posts, public.provider_profiles) from public, anon, authenticated;

-- Each provider's match is now worked out once, not three times.
create or replace function public.match_providers_for_job(p_job_id uuid)
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
        'match', m.match,
        'quoted', exists(select 1 from public.sent_quotes q where q.job_id = j.id and q.provider_id = pp.id),
        'invited', exists(select 1 from public.job_invites i where i.job_id = j.id and i.provider_id = pp.id)) as row
      from public.provider_profiles pp join public.profiles p on p.id = pp.id
      cross join lateral (select private.job_match(j, pp) as match) m
      where pp.id <> j.customer_id and p.deleted_at is null and p.suspended_at is null
        -- The same test as the trade points, so the calendar is only read for providers in the trade.
        and ((j.category is not null and lower(j.category) = lower(pp.category))
          or position(lower(pp.category) in lower(j.title || ' ' || j.description)) > 0)
      order by (m.match->>'score')::integer desc limit 20
    ) rows), '[]'::jsonb);
end;
$$;
