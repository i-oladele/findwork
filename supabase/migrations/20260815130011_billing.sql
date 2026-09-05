create table public.subscription_plans (
  id text primary key,
  name text not null,
  price integer not null,
  features text[] not null default '{}'
);

alter table public.subscription_plans enable row level security;

create policy "Plans are viewable by authenticated users"
  on public.subscription_plans for select
  to authenticated
  using (true);

create table public.subscriptions (
  profile_id uuid primary key references public.profiles (id),
  plan text not null references public.subscription_plans (id) default 'free',
  since timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

create policy "Users see their own subscription"
  on public.subscriptions for select
  to authenticated
  using (profile_id = auth.uid());

-- No insert/update policy: subscribe_plan (migration 11) is SECURITY
-- DEFINER so a plan change and its wallet charge happen atomically.
