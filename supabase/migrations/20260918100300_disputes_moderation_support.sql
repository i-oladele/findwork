-- Disputes that actually hold money, a way for a human to settle them,
-- reporting for listings and messages, and a support inbox.
--
-- Before this a dispute was a note: anyone could open one against any id,
-- the escrow it named could still be released or cancelled out from under
-- it, and nobody could resolve it.

-- ---------------------------------------------------------------------------
-- Disputes
-- ---------------------------------------------------------------------------

alter table public.disputes
  add column against_id uuid references public.profiles (id),
  add column evidence_paths text[] not null default '{}',
  add column outcome text check (outcome in ('release', 'refund', 'dismissed')),
  add column resolution_note text,
  add column resolved_by uuid references public.profiles (id),
  add column resolved_at timestamptz;

create index disputes_ref_idx on public.disputes (ref_type, ref_id) where status = 'open';

-- Disputes are opened through open_dispute, which checks the caller is a
-- party to what they are disputing.
drop policy "A user can open a dispute" on public.disputes;
revoke insert, update, delete on public.disputes from anon, authenticated;

drop policy "Users see disputes they raised" on public.disputes;
create policy "Both parties and admins see a dispute"
  on public.disputes for select
  to authenticated
  using (raised_by = auth.uid() or against_id = auth.uid() or public.is_admin());

create function public.open_dispute(
  p_ref_type text,
  p_ref_id uuid,
  p_reason text,
  p_evidence_paths text[] default '{}'
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_booking public.bookings;
  v_order public.orders;
  v_against uuid;
  v_label text;
  v_id uuid;
begin
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'reason required';
  end if;

  if p_ref_type = 'booking' then
    select * into v_booking from public.bookings where id = p_ref_id;
    if v_booking is null or auth.uid() not in (v_booking.customer_id, v_booking.provider_id) then
      raise exception 'booking not found';
    end if;
    -- Once escrow has been released or refunded there is nothing to hold.
    if v_booking.status not in ('pending', 'active') then
      raise exception 'booking is closed';
    end if;
    v_against := case when auth.uid() = v_booking.customer_id then v_booking.provider_id else v_booking.customer_id end;
    v_label := v_booking.service;
  elsif p_ref_type = 'order' then
    select * into v_order from public.orders where id = p_ref_id;
    if v_order is null or v_order.customer_id <> auth.uid() then
      raise exception 'order not found';
    end if;
    if v_order.status in ('cancelled', 'returned') then
      raise exception 'order is closed';
    end if;
    v_label := 'Order #' || upper(left(p_ref_id::text, 8));
  else
    raise exception 'invalid dispute type';
  end if;

  if private.open_dispute_exists(p_ref_type, p_ref_id::text) then
    raise exception 'dispute_open';
  end if;

  -- Evidence must sit in the caller's own folder of the private bucket.
  if exists (
    select 1 from unnest(p_evidence_paths) as p(path)
    where split_part(path, '/', 1) <> auth.uid()::text
  ) then
    raise exception 'invalid evidence path';
  end if;

  insert into public.disputes (raised_by, against_id, ref_id, ref_type, reason, evidence_paths)
  values (auth.uid(), v_against, p_ref_id::text, p_ref_type, trim(p_reason), coalesce(p_evidence_paths, '{}'))
  returning id into v_id;

  if v_against is not null then
    perform public.notify(v_against, 'dispute', 'A dispute was opened', v_label || ' · the payment is on hold', 'dispute', v_id::text);
  end if;
  perform private.notify_admins('dispute', 'New dispute', v_label, 'admin_dispute', v_id::text);

  return v_id;
end;
$$;

-- Settles a dispute. For a booking, 'release' pays the provider and
-- 'refund' returns escrow to the customer; for an order, 'refund' credits
-- the customer and marks it returned. 'dismissed' lifts the hold without
-- moving money, leaving both sides free to complete or cancel as normal.
create function public.resolve_dispute(p_dispute_id uuid, p_outcome text, p_note text)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_dispute public.disputes;
  v_booking public.bookings;
  v_order public.orders;
  v_title text;
begin
  if not public.is_admin() then
    raise exception 'admins only';
  end if;
  if p_outcome not in ('release', 'refund', 'dismissed') then
    raise exception 'invalid outcome';
  end if;

  select * into v_dispute from public.disputes where id = p_dispute_id for update;
  if v_dispute is null then
    raise exception 'dispute not found';
  end if;
  if v_dispute.status <> 'open' then
    raise exception 'dispute already resolved';
  end if;

  -- Close first: release/refund below refuse to run while it is open.
  update public.disputes
  set status = 'resolved', outcome = p_outcome, resolution_note = nullif(trim(p_note), ''),
      resolved_by = auth.uid(), resolved_at = now()
  where id = p_dispute_id;

  if v_dispute.ref_type = 'booking' then
    select * into v_booking from public.bookings where id = v_dispute.ref_id::uuid for update;
    if p_outcome = 'release' then
      if v_booking.status <> 'active' then
        raise exception 'only an accepted booking can be released';
      end if;
      perform private.release_booking(v_booking);
    elsif p_outcome = 'refund' then
      perform private.refund_booking(v_booking, auth.uid(), 'Refund · dispute on ' || v_booking.service);
    end if;
  else
    select * into v_order from public.orders where id = v_dispute.ref_id::uuid for update;
    if p_outcome = 'refund' then
      perform private.refund_order(v_order, 'returned', 'Refund · order #' || upper(left(v_order.id::text, 8)));
    elsif p_outcome = 'release' then
      raise exception 'orders can only be refunded or dismissed';
    end if;
  end if;

  v_title := case p_outcome
    when 'release' then 'Dispute resolved: payment released'
    when 'refund' then 'Dispute resolved: refunded'
    else 'Dispute closed'
  end;

  perform public.notify(v_dispute.raised_by, 'dispute', v_title, coalesce(p_note, ''), 'dispute', p_dispute_id::text);
  if v_dispute.against_id is not null then
    perform public.notify(v_dispute.against_id, 'dispute', v_title, coalesce(p_note, ''), 'dispute', p_dispute_id::text);
  end if;
end;
$$;

-- Admins can open dispute evidence; the raiser already can via the owner policy.
create policy "Admins read dispute evidence"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'dispute-evidence' and public.is_admin());

-- ---------------------------------------------------------------------------
-- Reports (moderation)
-- ---------------------------------------------------------------------------

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id),
  target_type text not null check (target_type in ('classified', 'message', 'profile', 'job', 'rfq')),
  target_id text not null,
  reason text not null,
  details text,
  status text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  resolved_by uuid references public.profiles (id),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (reporter_id, target_type, target_id)
);

alter table public.reports enable row level security;

create policy "Anyone signed in can report"
  on public.reports for insert
  to authenticated
  with check (reporter_id = auth.uid() and status = 'open');

create policy "Reporters and admins see reports"
  on public.reports for select
  to authenticated
  using (reporter_id = auth.uid() or public.is_admin());

revoke update, delete on public.reports from anon, authenticated;
revoke insert on public.reports from anon, authenticated;
grant insert (reporter_id, target_type, target_id, reason, details) on public.reports to authenticated;

create function private.on_report_filed()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  perform private.notify_admins('system', 'New report', new.target_type || ': ' || new.reason, 'admin_report', new.id::text);
  return new;
end;
$$;

create trigger reports_after_insert
  after insert on public.reports
  for each row execute procedure private.on_report_filed();

-- 'remove' takes the reported content down; profiles are flagged for a human
-- to act on in the Supabase dashboard (suspension is an auth-level action).
create function public.admin_resolve_report(p_report_id uuid, p_action text)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_report public.reports;
begin
  if not public.is_admin() then
    raise exception 'admins only';
  end if;
  if p_action not in ('remove', 'dismiss') then
    raise exception 'invalid action';
  end if;

  select * into v_report from public.reports where id = p_report_id for update;
  if v_report is null then
    raise exception 'report not found';
  end if;

  if p_action = 'remove' then
    case v_report.target_type
      when 'classified' then delete from public.classifieds where id = v_report.target_id::uuid;
      when 'message' then delete from public.chat_messages where id = v_report.target_id::uuid;
      when 'job' then update public.job_posts set status = 'closed' where id = v_report.target_id::uuid;
      when 'rfq' then update public.rfqs set status = 'closed' where id = v_report.target_id::uuid;
      else null;
    end case;
  end if;

  -- Every report on the same target is settled together.
  update public.reports
  set status = case when p_action = 'remove' then 'actioned' else 'dismissed' end,
      resolved_by = auth.uid(), resolved_at = now()
  where target_type = v_report.target_type and target_id = v_report.target_id and status = 'open';
end;
$$;

-- ---------------------------------------------------------------------------
-- Support inbox
-- ---------------------------------------------------------------------------

create table public.support_requests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id),
  topic text not null check (topic in ('payments', 'bookings', 'orders', 'account', 'bug', 'other')),
  message text not null,
  status text not null default 'open' check (status in ('open', 'closed')),
  reply text,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

alter table public.support_requests enable row level security;

create policy "Users open their own support requests"
  on public.support_requests for insert
  to authenticated
  with check (profile_id = auth.uid());

create policy "Users and admins see support requests"
  on public.support_requests for select
  to authenticated
  using (profile_id = auth.uid() or public.is_admin());

revoke insert, update, delete on public.support_requests from anon, authenticated;
grant insert (profile_id, topic, message) on public.support_requests to authenticated;

create function private.on_support_request()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  perform private.notify_admins('support', 'Support: ' || new.topic, left(new.message, 140), 'admin_support', new.id::text);
  return new;
end;
$$;

create trigger support_requests_after_insert
  after insert on public.support_requests
  for each row execute procedure private.on_support_request();

create function public.admin_reply_support(p_request_id uuid, p_reply text)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_request public.support_requests;
begin
  if not public.is_admin() then
    raise exception 'admins only';
  end if;

  update public.support_requests
  set reply = nullif(trim(p_reply), ''), status = 'closed', closed_at = now()
  where id = p_request_id
  returning * into v_request;

  if v_request is null then
    raise exception 'request not found';
  end if;

  perform public.notify(v_request.profile_id, 'support', 'Support replied', left(coalesce(p_reply, ''), 140), 'support', p_request_id::text);
end;
$$;

-- ---------------------------------------------------------------------------
-- Provider verification (manual until a KYC vendor is integrated)
-- ---------------------------------------------------------------------------

create function public.admin_set_provider_verified(p_provider_id uuid, p_verified boolean)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'admins only';
  end if;

  update public.provider_profiles set verified = p_verified where id = p_provider_id;
  if not found then
    raise exception 'provider not found';
  end if;

  if p_verified then
    perform public.notify(p_provider_id, 'system', 'You are verified',
      'Customers now see the Verified badge on your profile.', 'provider', p_provider_id::text);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- RFQs and classifieds
-- ---------------------------------------------------------------------------

alter table public.rfq_quotes
  add column lead_time text,
  add constraint rfq_quotes_one_per_supplier unique (rfq_id, supplier_id),
  add constraint rfq_quotes_price_positive check (price > 0);

drop policy "A supplier can submit an RFQ quote" on public.rfq_quotes;

create policy "A supplier can quote on someone else's open RFQ"
  on public.rfq_quotes for insert
  to authenticated
  with check (
    supplier_id = auth.uid()
    and exists (
      select 1 from public.rfqs r
      where r.id = rfq_quotes.rfq_id and r.status in ('open', 'quoted') and r.buyer_id <> auth.uid()
    )
  );

revoke insert, update, delete on public.rfq_quotes from anon, authenticated;
grant insert (rfq_id, supplier_id, price, message, lead_time) on public.rfq_quotes to authenticated;

create policy "A buyer can update their own RFQ"
  on public.rfqs for update
  to authenticated
  using (buyer_id = auth.uid())
  with check (buyer_id = auth.uid());

revoke update on public.rfqs from anon, authenticated;
grant update (title, description, quantity, budget_max, deadline, status) on public.rfqs to authenticated;

create function private.on_rfq_quote()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_rfq public.rfqs;
begin
  update public.rfqs set status = 'quoted' where id = new.rfq_id and status = 'open';
  select * into v_rfq from public.rfqs where id = new.rfq_id;
  perform public.notify(v_rfq.buyer_id, 'quote', 'New quote on ' || v_rfq.title,
    '₦' || to_char(new.price, 'FM999,999,999'), 'rfq', new.rfq_id::text);
  return new;
end;
$$;

create trigger rfq_quotes_after_insert
  after insert on public.rfq_quotes
  for each row execute procedure private.on_rfq_quote();

create or replace function public.accept_rfq_quote(p_quote_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_quote public.rfq_quotes;
  v_rfq public.rfqs;
begin
  select * into v_quote from public.rfq_quotes where id = p_quote_id;
  if v_quote is null then
    raise exception 'quote not found';
  end if;
  select * into v_rfq from public.rfqs where id = v_quote.rfq_id for update;
  if v_rfq.buyer_id <> auth.uid() then
    raise exception 'not your RFQ';
  end if;
  if v_rfq.status = 'closed' then
    raise exception 'RFQ is closed';
  end if;

  update public.rfq_quotes set accepted = (id = p_quote_id) where rfq_id = v_rfq.id;
  update public.rfqs set status = 'closed' where id = v_rfq.id;

  perform public.notify(v_quote.supplier_id, 'quote', 'Your quote was accepted',
    v_rfq.title || ' · the buyer will be in touch', 'rfq', v_rfq.id::text);
end;
$$;

alter table public.classifieds
  add column photo_urls text[] not null default '{}',
  add constraint classifieds_price_positive check (price > 0);

create index classifieds_created_idx on public.classifieds (created_at desc);
