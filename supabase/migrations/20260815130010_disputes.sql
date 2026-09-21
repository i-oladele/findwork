create table public.disputes (
  id uuid primary key default gen_random_uuid(),
  raised_by uuid not null references public.profiles (id),
  ref_id text not null,
  ref_type text not null check (ref_type in ('order', 'booking')),
  reason text not null,
  status text not null default 'open' check (status in ('open', 'resolved')),
  opened_at timestamptz not null default now()
);

alter table public.disputes enable row level security;

create policy "Users see disputes they raised"
  on public.disputes for select
  to authenticated
  using (raised_by = auth.uid());

create policy "A user can open a dispute"
  on public.disputes for insert
  to authenticated
  with check (raised_by = auth.uid());
