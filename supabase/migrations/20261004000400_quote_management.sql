-- PRD proposal management: revisions and withdrawal, with optimistic version
-- checks so a stale customer acceptance can never pay newly edited terms.
alter table public.sent_quotes drop constraint sent_quotes_status_check;
alter table public.sent_quotes add constraint sent_quotes_status_check check (status in ('sent','accepted','declined','withdrawn'));
alter table public.sent_quotes add column revision integer not null default 1 check (revision > 0);

create table public.quote_revisions (
  quote_id uuid not null references public.sent_quotes(id) on delete cascade,
  revision integer not null,
  price integer not null,
  days integer not null,
  start_day text,
  message text,
  status text not null,
  recorded_at timestamptz not null default now(),
  primary key(quote_id, revision)
);
alter table public.quote_revisions enable row level security;
revoke all on public.quote_revisions from anon, authenticated;
grant select on public.quote_revisions to authenticated;
create policy "Quote participants read revisions" on public.quote_revisions for select to authenticated
  using (exists(select 1 from public.sent_quotes q where q.id = quote_id));
insert into public.quote_revisions(quote_id, revision, price, days, start_day, message, status)
select id, revision, price, days, start_day, message, status from public.sent_quotes;

create function private.record_quote_revision()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.quote_revisions(quote_id, revision, price, days, start_day, message, status)
  values(new.id, new.revision, new.price, new.days, new.start_day, new.message, new.status);
  return new;
end;
$$;
create trigger quote_revision_record after insert or update on public.sent_quotes
  for each row execute function private.record_quote_revision();

create function private.guard_quote_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_job public.job_posts;
begin
  -- Every quote mutation locks the job before a quote row. This also closes
  -- the insertion/acceptance race and cross-quote acceptance deadlock.
  select * into v_job from public.job_posts where id = new.job_id for update;
  if v_job.id is null or v_job.status <> 'open' then raise exception 'job is closed'; end if;
  if coalesce(char_length(new.message),0) > 2000 or coalesce(char_length(new.start_day),0) > 100 then
    raise exception 'quote text too long';
  end if;
  return new;
end;
$$;
create trigger quote_insert_guard before insert on public.sent_quotes for each row execute function private.guard_quote_insert();

create function private.editable_quote(p_quote_id uuid, p_expected_revision integer)
returns public.sent_quotes language plpgsql security definer set search_path = public as $$
declare v_quote public.sent_quotes; v_job public.job_posts;
begin
  if auth.uid() is null or not exists(select 1 from public.profiles where id = auth.uid() and deleted_at is null) then
    raise exception 'not authenticated';
  end if;
  select * into v_quote from public.sent_quotes where id = p_quote_id;
  if v_quote.id is null or v_quote.provider_id <> auth.uid() then raise exception 'quote not found'; end if;
  select * into v_job from public.job_posts where id = v_quote.job_id for update;
  select * into v_quote from public.sent_quotes where id = p_quote_id for update;
  if v_job.status <> 'open' or v_quote.status not in ('sent','withdrawn') then raise exception 'job is closed'; end if;
  if p_expected_revision is distinct from v_quote.revision then raise exception 'quote_changed'; end if;
  return v_quote;
end;
$$;
revoke all on function private.editable_quote(uuid, integer) from public, anon, authenticated;

create function public.revise_job_quote(p_quote_id uuid, p_expected_revision integer, p_price integer, p_days integer, p_start_day text, p_message text)
returns void language plpgsql security definer set search_path = public as $$
declare v_quote public.sent_quotes; v_job public.job_posts;
begin
  v_quote := private.editable_quote(p_quote_id, p_expected_revision);
  if coalesce(char_length(p_message),0) > 2000 or coalesce(char_length(p_start_day),0) > 100 then raise exception 'quote text too long'; end if;
  update public.sent_quotes set price = p_price, days = p_days, start_day = nullif(trim(p_start_day),''),
    message = nullif(trim(p_message),''), status = 'sent', revision = revision + 1 where id = p_quote_id;
  update public.job_posts set quote_count = (select count(*) from public.sent_quotes where job_id = v_quote.job_id and status <> 'withdrawn')
    where id = v_quote.job_id returning * into v_job;
  perform public.notify(v_job.customer_id, 'quote', 'A quote was updated', v_job.title || ' · review the latest terms before accepting.', 'job', v_job.id::text);
end;
$$;

create function public.withdraw_job_quote(p_quote_id uuid, p_expected_revision integer)
returns void language plpgsql security definer set search_path = public as $$
declare v_quote public.sent_quotes; v_job public.job_posts;
begin
  v_quote := private.editable_quote(p_quote_id, p_expected_revision);
  if v_quote.status = 'withdrawn' then return; end if;
  update public.sent_quotes set status = 'withdrawn', revision = revision + 1 where id = p_quote_id;
  update public.job_posts set quote_count = (select count(*) from public.sent_quotes where job_id = v_quote.job_id and status <> 'withdrawn')
    where id = v_quote.job_id returning * into v_job;
  perform public.notify(v_job.customer_id, 'quote', 'A quote was withdrawn', v_job.title, 'job', v_job.id::text);
end;
$$;

drop function public.accept_job_quote(uuid, timestamptz);
create function public.accept_job_quote(p_quote_id uuid, p_start_at timestamptz, p_expected_revision integer)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_quote public.sent_quotes; v_job public.job_posts; v_booking_id uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into v_quote from public.sent_quotes where id = p_quote_id;
  if v_quote.id is null then raise exception 'quote not found'; end if;
  select * into v_job from public.job_posts where id = v_quote.job_id for update;
  if v_job.customer_id <> auth.uid() then raise exception 'not your job'; end if;
  select * into v_quote from public.sent_quotes where id = p_quote_id for update;
  if v_job.status <> 'open' then raise exception 'job is closed'; end if;
  if v_quote.status <> 'sent' then raise exception 'quote unavailable'; end if;
  if p_expected_revision is distinct from v_quote.revision then raise exception 'quote_changed'; end if;
  v_booking_id := private.create_booking(v_quote.provider_id, null, v_job.title, v_quote.price, p_start_at, 60, 'active');
  update public.sent_quotes set status = 'accepted', revision = revision + 1 where id = p_quote_id;
  update public.sent_quotes set status = 'declined', revision = revision + 1 where job_id = v_job.id and id <> p_quote_id and status = 'sent';
  update public.job_posts set status = 'closed' where id = v_job.id;
  perform public.notify(v_quote.provider_id, 'quote', 'Your quote was accepted',
    v_job.title || ' · ₦' || to_char(v_quote.price, 'FM999,999,999') || ' is in escrow', 'booking_request', v_booking_id::text);
  return v_booking_id;
end;
$$;
revoke all on function public.revise_job_quote(uuid, integer, integer, integer, text, text) from public, anon;
revoke all on function public.withdraw_job_quote(uuid, integer) from public, anon;
revoke all on function public.accept_job_quote(uuid, timestamptz, integer) from public, anon;
grant execute on function public.revise_job_quote(uuid, integer, integer, integer, text, text) to authenticated;
grant execute on function public.withdraw_job_quote(uuid, integer) to authenticated;
grant execute on function public.accept_job_quote(uuid, timestamptz, integer) to authenticated;
