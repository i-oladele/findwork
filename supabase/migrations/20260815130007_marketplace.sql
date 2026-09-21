-- Services marketplace: customers post jobs, providers send quotes.
create table public.job_posts (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles (id),
  title text not null,
  description text not null,
  budget integer not null,
  needed_by text,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now()
);

alter table public.job_posts enable row level security;

create policy "Job posts are browsable by authenticated users"
  on public.job_posts for select
  to authenticated
  using (true);

create policy "A customer can post a job"
  on public.job_posts for insert
  to authenticated
  with check (customer_id = auth.uid());

create table public.sent_quotes (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.job_posts (id) on delete cascade,
  provider_id uuid not null references public.profiles (id),
  price integer not null,
  days integer not null,
  start_day text,
  message text,
  created_at timestamptz not null default now()
);

alter table public.sent_quotes enable row level security;

create policy "Job owner and quoting provider see a quote"
  on public.sent_quotes for select
  to authenticated
  using (
    provider_id = auth.uid()
    or exists (select 1 from public.job_posts jp where jp.id = sent_quotes.job_id and jp.customer_id = auth.uid())
  );

create policy "A provider can send a quote"
  on public.sent_quotes for insert
  to authenticated
  with check (provider_id = auth.uid());

-- Incoming hire requests to a provider, before they become a paid booking.
-- No direct insert policy: today's app only lets a provider respond to a
-- request (accept/decline via the respond_to_request RPC in migration 11);
-- requests themselves are seeded, matching current frontend behavior.
create table public.provider_requests (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.provider_profiles (id),
  customer_id uuid not null references public.profiles (id),
  service text not null,
  requested_at text,
  price integer not null,
  status text not null default 'new' check (status in ('new', 'accepted', 'declined')),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.provider_requests enable row level security;

create policy "Provider sees requests made to them"
  on public.provider_requests for select
  to authenticated
  using (provider_id = auth.uid());

create policy "Customer sees requests they made"
  on public.provider_requests for select
  to authenticated
  using (customer_id = auth.uid());

-- B2B: buyers post a request for quotation, suppliers respond.
create table public.rfqs (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references public.profiles (id),
  title text not null,
  description text not null,
  quantity text,
  budget_max integer,
  deadline text,
  status text not null default 'open' check (status in ('open', 'quoted', 'closed')),
  created_at timestamptz not null default now()
);

alter table public.rfqs enable row level security;

create policy "RFQs are browsable by authenticated users"
  on public.rfqs for select
  to authenticated
  using (true);

create policy "A buyer can post an RFQ"
  on public.rfqs for insert
  to authenticated
  with check (buyer_id = auth.uid());

create table public.rfq_quotes (
  id uuid primary key default gen_random_uuid(),
  rfq_id uuid not null references public.rfqs (id) on delete cascade,
  supplier_id uuid not null references public.profiles (id),
  price integer not null,
  message text,
  accepted boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.rfq_quotes enable row level security;

create policy "Buyer and quoting supplier see an RFQ quote"
  on public.rfq_quotes for select
  to authenticated
  using (
    supplier_id = auth.uid()
    or exists (select 1 from public.rfqs r where r.id = rfq_quotes.rfq_id and r.buyer_id = auth.uid())
  );

create policy "A supplier can submit an RFQ quote"
  on public.rfq_quotes for insert
  to authenticated
  with check (supplier_id = auth.uid());
