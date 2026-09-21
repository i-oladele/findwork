-- A proposal never releases the original slot or moves money. Only the other
-- participant can approve it; the exclusion constraint arbitrates slot races.
create table public.booking_reschedules (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  requested_by uuid not null references public.profiles(id),
  previous_start_at timestamptz not null,
  proposed_start_at timestamptz not null,
  reason text not null default '' check (length(reason) <= 500),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'withdrawn', 'expired')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (isfinite(proposed_start_at) and proposed_start_at <> previous_start_at)
);
create unique index booking_reschedules_one_pending
  on public.booking_reschedules(booking_id) where status = 'pending';
create index booking_reschedules_history on public.booking_reschedules(booking_id, created_at desc);
alter table public.booking_reschedules enable row level security;
revoke all on public.booking_reschedules from public, anon, authenticated;
grant select on public.booking_reschedules to authenticated;
create policy "Booking participants and admins read schedule history"
  on public.booking_reschedules for select to authenticated using (
    exists (select 1 from public.bookings b where b.id = booking_id
      and (auth.uid() in (b.customer_id, b.provider_id) or public.is_admin()))
  );

create function private.validate_reschedule(p_booking public.bookings, p_start_at timestamptz)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_available boolean;
begin
  if p_booking.status not in ('pending', 'active') then
    raise exception 'booking cannot be rescheduled';
  end if;
  if p_booking.start_at <= now() then raise exception 'booking already started'; end if;
  if private.open_dispute_exists('booking', p_booking.id::text) then raise exception 'dispute_open'; end if;
  if p_start_at is null or not isfinite(p_start_at) or p_start_at <= now() then
    raise exception 'cannot book a time in the past';
  end if;
  if p_start_at > now() + interval '90 days' then raise exception 'too far ahead'; end if;
  if p_start_at = p_booking.start_at then raise exception 'choose a different time'; end if;
  if not exists (
    select 1 from public.provider_profiles p join public.profiles u on u.id = p.id
    where p.id = p_booking.provider_id and p.taking_bookings and u.deleted_at is null
  ) then raise exception 'provider is not taking bookings'; end if;

  select case extract(isodow from p_start_at at time zone 'Africa/Lagos')::int
    when 1 then monday when 2 then tuesday when 3 then wednesday
    when 4 then thursday when 5 then friday when 6 then saturday else sunday end
  into v_available from public.provider_availability where provider_id = p_booking.provider_id;
  if not coalesce(v_available, true) then raise exception 'provider is closed that day'; end if;

  if exists (
    select 1 from public.bookings b
    where b.provider_id = p_booking.provider_id and b.id <> p_booking.id
      and b.status in ('pending', 'active')
      and b.slot_range && tstzrange(p_start_at,
        p_start_at + make_interval(mins => p_booking.duration_minutes), '[)')
  ) then raise exception using errcode = '23P01', message = 'slot already booked'; end if;
end;
$$;

create function public.request_booking_reschedule(p_booking_id uuid, p_start_at timestamptz, p_reason text default '')
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_booking public.bookings;
  v_id uuid;
  v_other uuid;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'booking not found'; end if;
  if auth.uid() is null or auth.uid() not in (v_booking.customer_id, v_booking.provider_id) then
    raise exception 'not your booking';
  end if;
  perform private.validate_reschedule(v_booking, p_start_at);
  if length(coalesce(p_reason, '')) > 500 then raise exception 'reason too long'; end if;

  update public.booking_reschedules set status = 'expired', responded_at = now()
    where booking_id = p_booking_id and status = 'pending' and proposed_start_at <= now();
  if exists (select 1 from public.booking_reschedules where booking_id = p_booking_id and status = 'pending') then
    raise exception 'reschedule already pending';
  end if;
  insert into public.booking_reschedules(booking_id, requested_by, previous_start_at, proposed_start_at, reason)
    values (p_booking_id, auth.uid(), v_booking.start_at, p_start_at, trim(coalesce(p_reason, '')))
    returning id into v_id;
  v_other := case when auth.uid() = v_booking.customer_id then v_booking.provider_id else v_booking.customer_id end;
  perform public.notify(v_other, 'booking', 'New time proposed',
    v_booking.service || ' · ' || to_char(p_start_at at time zone 'Africa/Lagos', 'Dy DD Mon, HH24:MI'),
    'booking_reschedule', p_booking_id::text);
  return v_id;
end;
$$;

create function public.respond_booking_reschedule(p_request_id uuid, p_action text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_request public.booking_reschedules;
  v_booking public.bookings;
  v_other uuid;
  v_title text;
begin
  -- Lock the booking before its requests, just like cancellation/completion.
  select * into v_request from public.booking_reschedules where id = p_request_id;
  if not found then raise exception 'reschedule not found'; end if;
  select * into v_booking from public.bookings where id = v_request.booking_id for update;
  if not found then raise exception 'booking not found'; end if;
  if auth.uid() is null or auth.uid() not in (v_booking.customer_id, v_booking.provider_id) then
    raise exception 'not your booking';
  end if;
  select * into v_request from public.booking_reschedules where id = p_request_id for update;
  if v_request.status <> 'pending' then raise exception 'reschedule already answered'; end if;
  if p_action is null or p_action not in ('accept', 'decline', 'withdraw') then
    raise exception 'invalid reschedule action';
  end if;
  if (p_action = 'withdraw' and v_request.requested_by <> auth.uid())
    or (p_action <> 'withdraw' and v_request.requested_by = auth.uid()) then
    raise exception 'only the other participant can respond';
  end if;

  if p_action = 'accept' then
    if v_request.previous_start_at <> v_booking.start_at then raise exception 'reschedule already answered'; end if;
    perform private.validate_reschedule(v_booking, v_request.proposed_start_at);
    update public.booking_reschedules set status = 'accepted', responded_at = now() where id = p_request_id;
    -- The database exclusion constraint also catches competing transactions.
    update public.bookings set start_at = v_request.proposed_start_at where id = v_booking.id;
    v_title := 'Booking rescheduled';
  else
    update public.booking_reschedules
      set status = case when p_action = 'decline' then 'declined' else 'withdrawn' end, responded_at = now()
      where id = p_request_id;
    v_title := case when p_action = 'decline' then 'New time declined' else 'New time withdrawn' end;
  end if;
  v_other := case when auth.uid() = v_booking.customer_id then v_booking.provider_id else v_booking.customer_id end;
  perform public.notify(v_other, 'booking', v_title, v_booking.service, 'booking_reschedule', v_booking.id::text);
  if p_action = 'accept' then
    perform public.notify(auth.uid(), 'booking', v_title, v_booking.service, 'booking_reschedule', v_booking.id::text);
  end if;
end;
$$;

-- The picker can ignore this booking's current slot without revealing other
-- customers' identities or letting a caller ignore an unrelated booking.
create function public.reschedule_busy_slots(p_booking_id uuid, p_from timestamptz, p_to timestamptz)
returns table (start_at timestamptz, end_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare v_booking public.bookings;
begin
  select * into v_booking from public.bookings where id = p_booking_id;
  if not found then raise exception 'booking not found'; end if;
  if auth.uid() is null or auth.uid() not in (v_booking.customer_id, v_booking.provider_id) then
    raise exception 'not your booking';
  end if;
  return query select lower(b.slot_range), upper(b.slot_range) from public.bookings b
    where b.provider_id = v_booking.provider_id and b.id <> p_booking_id
      and b.status in ('pending', 'active') and b.slot_range && tstzrange(p_from, p_to, '[)');
end;
$$;

create function private.expire_booking_reschedules()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('done', 'cancelled') or new.start_at <> old.start_at then
    update public.booking_reschedules set status = 'expired', responded_at = now()
      where booking_id = new.id and status = 'pending';
  end if;
  return new;
end;
$$;
create trigger bookings_expire_reschedules after update of status, start_at on public.bookings
  for each row execute function private.expire_booking_reschedules();

revoke all on function public.request_booking_reschedule(uuid, timestamptz, text) from public, anon;
revoke all on function public.respond_booking_reschedule(uuid, text) from public, anon;
revoke all on function public.reschedule_busy_slots(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.request_booking_reschedule(uuid, timestamptz, text) to authenticated;
grant execute on function public.respond_booking_reschedule(uuid, text) to authenticated;
grant execute on function public.reschedule_busy_slots(uuid, timestamptz, timestamptz) to authenticated;
