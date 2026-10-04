-- PRD AI Voice Assistant, and the assistant's links to support, learning,
-- translation and dispute moderation. The model call happens in the
-- assistant Edge Function; the database only meters it, so one account
-- cannot run up the bill.

create table public.assistant_usage (
  id bigint generated always as identity primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  task text not null check (task in ('command', 'support', 'translate', 'lesson', 'dispute')),
  created_at timestamptz not null default now()
);
create index assistant_usage_owner on public.assistant_usage(profile_id, created_at desc);
alter table public.assistant_usage enable row level security;
revoke all on public.assistant_usage from anon, authenticated;

-- Service role only: records one use and says whether it is within the
-- day's allowance (60 requests in 24 hours; staff summaries are not capped).
create function public.assistant_allow(p_profile_id uuid, p_task text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  perform 1 from public.profiles where id = p_profile_id and deleted_at is null and suspended_at is null for update;
  if not found then return false; end if;
  if p_task <> 'dispute' and (select count(*) from public.assistant_usage
      where profile_id = p_profile_id and created_at > now() - interval '24 hours') >= 60 then
    return false;
  end if;
  insert into public.assistant_usage(profile_id, task) values (p_profile_id, p_task);
  return true;
end;
$$;
revoke all on function public.assistant_allow(uuid, text) from public, anon, authenticated;
grant execute on function public.assistant_allow(uuid, text) to service_role;

-- What the dispute summary reads: the case as its participants and staff
-- already see it. Callable only by dispute staff.
create function public.dispute_case_file(p_dispute_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare d public.disputes;
begin
  if not public.staff_can('disputes') then raise exception 'admins only'; end if;
  select * into d from public.disputes where id = p_dispute_id;
  if d.id is null then raise exception 'dispute not found'; end if;
  return jsonb_build_object(
    'about', d.ref_type, 'status', d.status, 'opened_at', d.opened_at, 'claim', d.reason,
    'evidence_photos', cardinality(d.evidence_paths),
    'amount', case d.ref_type
      when 'booking' then (select escrow_held from public.bookings where id::text = d.ref_id)
      else (select total from public.orders where id::text = d.ref_id) end,
    'item', case d.ref_type
      when 'booking' then (select service || ', booked for ' || to_char(start_at at time zone 'Africa/Lagos', 'DD Mon YYYY HH24:MI') || ', status ' || status from public.bookings where id::text = d.ref_id)
      else (select 'order placed ' || to_char(placed_at at time zone 'Africa/Lagos', 'DD Mon YYYY') || ', status ' || status from public.orders where id::text = d.ref_id) end,
    'responses', coalesce((select jsonb_agg(jsonb_build_object('from', r.author_role, 'at', r.created_at, 'text', r.body, 'photos', cardinality(r.evidence_paths)) order by r.created_at)
      from public.dispute_responses r where r.dispute_id = d.id), '[]'::jsonb));
end;
$$;
revoke all on function public.dispute_case_file(uuid) from public, anon;
grant execute on function public.dispute_case_file(uuid) to authenticated;
