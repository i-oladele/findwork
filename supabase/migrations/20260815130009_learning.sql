-- Courses are catalog data (seed/admin-managed); enrollments are per-user.
create table public.courses (
  id text primary key,
  title text not null,
  category text not null,
  kind text not null check (kind in ('course', 'internship')),
  price integer not null default 0,
  instructor text not null,
  rating numeric(2, 1) not null default 0,
  description text not null,
  created_at timestamptz not null default now()
);

alter table public.courses enable row level security;

create policy "Courses are viewable by authenticated users"
  on public.courses for select
  to authenticated
  using (true);

create table public.course_lessons (
  id uuid primary key default gen_random_uuid(),
  course_id text not null references public.courses (id) on delete cascade,
  title text not null,
  minutes integer not null default 0,
  position integer not null
);

alter table public.course_lessons enable row level security;

create policy "Course lessons are viewable by authenticated users"
  on public.course_lessons for select
  to authenticated
  using (true);

create table public.enrollments (
  profile_id uuid not null references public.profiles (id),
  course_id text not null references public.courses (id),
  progress integer not null default 0 check (progress between 0 and 100),
  enrolled_at timestamptz not null default now(),
  primary key (profile_id, course_id)
);

alter table public.enrollments enable row level security;

create policy "Users see their own enrollments"
  on public.enrollments for select
  to authenticated
  using (profile_id = auth.uid());

-- No insert/update policy: enroll_in_course / advance_progress (migration 11)
-- run as SECURITY DEFINER so progress math can't be forged from the client.
