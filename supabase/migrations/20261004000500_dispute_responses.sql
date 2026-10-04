-- PRD: both participants and moderators can give their account of a dispute.
-- New response attachments are explicitly shared with participants. Original
-- evidence keeps its existing uploader/admin access rules.
create table public.dispute_responses (
  id uuid primary key,
  dispute_id uuid not null references public.disputes(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  author_role text not null check (author_role in ('claimant','respondent','moderator')),
  body text not null check (char_length(body) <= 2000),
  evidence_paths text[] not null default '{}',
  created_at timestamptz not null default now(),
  check (cardinality(evidence_paths) <= 4),
  check (char_length(trim(body)) > 0 or cardinality(evidence_paths) > 0)
);
create index dispute_responses_case on public.dispute_responses(dispute_id, created_at, id);
alter table public.dispute_responses enable row level security;
revoke all on public.dispute_responses from anon, authenticated;
grant select on public.dispute_responses to authenticated;
create policy "Participants read case responses" on public.dispute_responses for select to authenticated using (
  exists(select 1 from public.disputes d where d.id = dispute_id
    and (d.raised_by = auth.uid() or d.against_id = auth.uid() or public.is_admin()))
);
create policy "Participants read shared response evidence" on storage.objects for select to authenticated using (
  bucket_id = 'dispute-evidence' and exists(
    select 1 from public.dispute_responses r where storage.objects.name = any(r.evidence_paths)
  )
);

create function public.respond_to_dispute(p_id uuid, p_dispute_id uuid, p_body text, p_evidence_paths text[])
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_dispute public.disputes;
  v_existing public.dispute_responses;
  v_role text;
  v_body text := trim(coalesce(p_body,''));
  v_paths text[] := coalesce(p_evidence_paths,'{}');
  v_other uuid;
  v_path text;
begin
  if auth.uid() is null or not exists(select 1 from public.profiles where id = auth.uid() and deleted_at is null) then
    raise exception 'not authenticated';
  end if;
  select * into v_dispute from public.disputes where id = p_dispute_id for update;
  if v_dispute.id is null then raise exception 'dispute not found'; end if;
  v_role := case when auth.uid() = v_dispute.raised_by then 'claimant'
    when auth.uid() = v_dispute.against_id then 'respondent'
    when public.is_admin() then 'moderator' else null end;
  if v_role is null then raise exception 'not a dispute participant'; end if;
  select * into v_existing from public.dispute_responses where id = p_id;
  if found then
    if v_existing.dispute_id = p_dispute_id and v_existing.author_id = auth.uid()
      and v_existing.body = v_body and v_existing.evidence_paths = v_paths then return v_existing.id; end if;
    raise exception 'invalid response';
  end if;
  if v_dispute.status <> 'open' then raise exception 'dispute already resolved'; end if;
  if p_id is null or char_length(v_body) > 2000 or cardinality(v_paths) > 4
    or (char_length(v_body) = 0 and cardinality(v_paths) = 0) then raise exception 'invalid response'; end if;
  foreach v_path in array v_paths loop
    if v_path is null or split_part(v_path,'/',1) <> auth.uid()::text or not exists(
      select 1 from storage.objects where bucket_id = 'dispute-evidence' and name = v_path
        and metadata->>'mimetype' in ('image/jpeg','image/png','image/webp','image/gif')
        and (metadata->>'size')::bigint between 1 and 8388608
    ) then raise exception 'invalid response evidence'; end if;
  end loop;
  insert into public.dispute_responses(id,dispute_id,author_id,author_role,body,evidence_paths)
  values(p_id,p_dispute_id,auth.uid(),v_role,v_body,v_paths);
  for v_other in select distinct recipient from (
    select v_dispute.raised_by as recipient union select v_dispute.against_id
  ) recipients where recipient is not null and recipient <> auth.uid() loop
    perform public.notify(v_other,'dispute','New dispute response','Open the dispute to read the response.','dispute',p_dispute_id::text);
  end loop;
  -- The operations queue polls open cases; avoid fanning out private content
  -- into notifications or opening another chat outside the case record.
  return p_id;
end;
$$;
revoke all on function public.respond_to_dispute(uuid, uuid, text, text[]) from public, anon;
grant execute on function public.respond_to_dispute(uuid, uuid, text, text[]) to authenticated;
