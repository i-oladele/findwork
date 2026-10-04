-- PRD Online Courses: lesson content and video, quizzes and certificates.
-- PRD Internship Matching: real listings, applications an employer reviews,
-- and matching on skills.
--
-- This is the machinery. The lessons themselves still have to be written:
-- a lesson with nothing in it can no longer be completed, so a course only
-- counts once someone has authored it.

create or replace function public.staff_can(p_area text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select case staff_role
      when 'admin' then true
      when 'moderator' then p_area in ('console', 'lookup', 'disputes', 'moderation', 'verification', 'users', 'risk', 'content')
      when 'finance' then p_area in ('console', 'lookup', 'finance', 'analytics', 'risk')
      when 'support' then p_area in ('console', 'lookup', 'support', 'orders', 'logistics')
      else false end
    from public.profiles where id = auth.uid() and deleted_at is null and suspended_at is null), false);
$$;

-- ---------------------------------------------------------------------------
-- 1. Course content
-- ---------------------------------------------------------------------------

alter table public.courses
  add column status text not null default 'live' check (status in ('draft', 'live')),
  -- The quiz score, out of 100, that earns the certificate.
  add column pass_mark smallint not null default 70 check (pass_mark between 1 and 100);
drop policy "Courses are viewable by authenticated users" on public.courses;
create policy "Live courses are viewable; drafts by content staff" on public.courses for select to authenticated
  using (status = 'live' or public.staff_can('content'));

alter table public.course_lessons
  add column video_path text,
  -- A link to a video hosted elsewhere, when it was not uploaded here.
  add column video_url text check (video_url is null or video_url ~ '^https://');

-- What a lesson contains is for people enrolled on the course. Anyone may
-- see the list of lessons; the material comes from course_content.
revoke select on public.course_lessons from anon, authenticated;
grant select (id, course_id, title, minutes, position) on public.course_lessons to authenticated;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('course-media', 'course-media', false, 104857600, array['video/mp4', 'video/webm'])
on conflict (id) do nothing;
create policy "Content staff write course media" on storage.objects for all to authenticated
  using (bucket_id = 'course-media' and public.staff_can('content'))
  with check (bucket_id = 'course-media' and public.staff_can('content'));
-- A policy runs as the person asking, who may not read video_path directly,
-- so the check goes through a function that can.
create function public.can_read_course_media(p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.course_lessons l join public.enrollments e on e.course_id = l.course_id
    where l.video_path = p_name and e.profile_id = auth.uid());
$$;
revoke all on function public.can_read_course_media(text) from public, anon;
grant execute on function public.can_read_course_media(text) to authenticated;
create policy "Enrolled learners read course media" on storage.objects for select to authenticated
  using (bucket_id = 'course-media' and public.can_read_course_media(name));

create function private.lesson_has_content(l public.course_lessons)
returns boolean language sql immutable as $$
  select char_length(trim(coalesce(l.body, ''))) > 0 or l.video_path is not null or l.video_url is not null;
$$;

-- A course's lessons. The material itself is included only for someone
-- enrolled on it, and for content staff.
create function public.course_content(p_course_id text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_open boolean;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  v_open := public.staff_can('content')
    or exists(select 1 from public.enrollments where profile_id = auth.uid() and course_id = p_course_id);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', l.id, 'course_id', l.course_id, 'title', l.title, 'minutes', l.minutes, 'position', l.position,
      'has_content', private.lesson_has_content(l),
      'body', case when v_open then l.body end,
      'video_path', case when v_open then l.video_path end,
      'video_url', case when v_open then l.video_url end) order by l.position)
    from public.course_lessons l where l.course_id = p_course_id), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Quizzes and certificates
-- ---------------------------------------------------------------------------

create table public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  course_id text not null references public.courses(id) on delete cascade,
  position smallint not null check (position > 0),
  prompt text not null check (char_length(trim(prompt)) between 5 and 500),
  options text[] not null check (cardinality(options) between 2 and 6),
  correct_index smallint not null,
  unique (course_id, position),
  check (correct_index between 0 and cardinality(options) - 1)
);
alter table public.quiz_questions enable row level security;
revoke all on public.quiz_questions from anon, authenticated;
-- Never the answer.
grant select (id, course_id, position, prompt, options) on public.quiz_questions to authenticated;
create policy "Quiz questions are for the enrolled and content staff" on public.quiz_questions for select to authenticated
  using (public.staff_can('content') or exists(select 1 from public.enrollments e where e.course_id = quiz_questions.course_id and e.profile_id = auth.uid()));

create table public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  course_id text not null references public.courses(id) on delete cascade,
  score smallint not null check (score between 0 and 100),
  passed boolean not null,
  created_at timestamptz not null default now()
);
create index quiz_attempts_owner on public.quiz_attempts(profile_id, course_id, created_at desc);
alter table public.quiz_attempts enable row level security;
revoke all on public.quiz_attempts from anon, authenticated;
grant select on public.quiz_attempts to authenticated;
create policy "Learners read their own attempts" on public.quiz_attempts for select to authenticated
  using (profile_id = auth.uid() or public.staff_can('content'));

create table public.certificates (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  course_id text not null references public.courses(id),
  -- What someone types to check it is real.
  code text not null unique,
  holder_name text not null,
  course_title text not null,
  score smallint,
  issued_at timestamptz not null default now(),
  unique (profile_id, course_id)
);
alter table public.certificates enable row level security;
revoke all on public.certificates from anon, authenticated;
grant select on public.certificates to authenticated;
-- A certificate is something to show: any signed-in user may see who holds what.
create policy "Certificates are visible to signed-in users" on public.certificates for select to authenticated using (true);

create function private.issue_certificate(p_profile_id uuid, p_course_id text, p_score smallint)
returns void language plpgsql security definer set search_path = public as $$
declare v_name text; v_title text; v_new integer;
begin
  select full_name into v_name from public.profiles where id = p_profile_id;
  select title into v_title from public.courses where id = p_course_id;
  insert into public.certificates(profile_id, course_id, code, holder_name, course_title, score)
  values (p_profile_id, p_course_id, 'FW-' || upper(substr(md5(gen_random_uuid()::text), 1, 10)), coalesce(nullif(v_name, ''), 'FindWork learner'), v_title, p_score)
  on conflict (profile_id, course_id) do nothing;
  get diagnostics v_new = row_count;
  if v_new = 1 then
    perform public.notify(p_profile_id, 'system', 'You earned a certificate', v_title, 'certificate', p_course_id);
  end if;
end;
$$;
revoke all on function private.issue_certificate(uuid, text, smallint) from public, anon, authenticated;

-- Completing a lesson needs the lesson to have something in it. Finishing a
-- course with no quiz earns the certificate; one with a quiz needs a pass.
create or replace function public.complete_lesson(p_lesson_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_lesson public.course_lessons;
  v_total integer;
  v_done integer;
  v_progress integer;
begin
  select * into v_lesson from public.course_lessons where id = p_lesson_id;
  if v_lesson.id is null then raise exception 'lesson not found'; end if;
  if not exists (select 1 from public.enrollments where profile_id = auth.uid() and course_id = v_lesson.course_id) then
    raise exception 'not enrolled';
  end if;
  if not private.lesson_has_content(v_lesson) then raise exception 'lesson has no content'; end if;

  insert into public.lesson_completions (profile_id, lesson_id) values (auth.uid(), p_lesson_id) on conflict do nothing;

  select count(*) into v_total from public.course_lessons where course_id = v_lesson.course_id;
  select count(*) into v_done
  from public.lesson_completions lc join public.course_lessons cl on cl.id = lc.lesson_id
  where lc.profile_id = auth.uid() and cl.course_id = v_lesson.course_id;
  v_progress := round(100.0 * v_done / greatest(v_total, 1));
  update public.enrollments set progress = v_progress where profile_id = auth.uid() and course_id = v_lesson.course_id;

  if v_progress = 100 and not exists(select 1 from public.quiz_questions where course_id = v_lesson.course_id) then
    perform private.issue_certificate(auth.uid(), v_lesson.course_id, null);
  end if;
  return v_progress;
end;
$$;

-- p_answers: the chosen option for each question, in question order.
create function public.submit_quiz(p_course_id text, p_answers integer[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_enrollment public.enrollments;
  v_course public.courses;
  v_total integer;
  v_correct integer;
  v_score smallint;
  v_passed boolean;
begin
  select * into v_enrollment from public.enrollments where profile_id = auth.uid() and course_id = p_course_id for update;
  if v_enrollment.profile_id is null then raise exception 'not enrolled'; end if;
  if v_enrollment.progress < 100 then raise exception 'finish the lessons first'; end if;
  select * into v_course from public.courses where id = p_course_id;
  select count(*) into v_total from public.quiz_questions where course_id = p_course_id;
  if v_total = 0 then raise exception 'course has no quiz'; end if;
  if p_answers is null or cardinality(p_answers) <> v_total then raise exception 'answer every question'; end if;
  if (select count(*) from public.quiz_attempts where profile_id = auth.uid() and course_id = p_course_id
      and created_at > now() - interval '24 hours') >= 3 then
    raise exception 'too many quiz attempts';
  end if;
  select count(*) into v_correct from (
    select q.correct_index, row_number() over (order by q.position) as n from public.quiz_questions q where q.course_id = p_course_id
  ) keyed where p_answers[keyed.n] = keyed.correct_index;
  v_score := round(100.0 * v_correct / v_total);
  v_passed := v_score >= v_course.pass_mark;
  insert into public.quiz_attempts(profile_id, course_id, score, passed) values (auth.uid(), p_course_id, v_score, v_passed);
  if v_passed then perform private.issue_certificate(auth.uid(), p_course_id, v_score); end if;
  -- How many were right, never which: a retake must be earned.
  return jsonb_build_object('score', v_score, 'passed', v_passed, 'correct', v_correct, 'total', v_total, 'pass_mark', v_course.pass_mark);
end;
$$;

-- Anyone, signed in or not, can check a certificate by its code.
create function public.verify_certificate(p_code text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('code', c.code, 'holder_name', c.holder_name, 'course_title', c.course_title, 'score', c.score, 'issued_at', c.issued_at)
  from public.certificates c where c.code = upper(trim(p_code));
$$;

-- Authoring, for content staff. p_lessons: [{id?, title, minutes, body, video_path, video_url}];
-- p_questions: [{prompt, options, correct_index}]. Lessons left out are removed.
create function public.admin_save_course(
  p_id text, p_title text, p_category text, p_instructor text, p_description text, p_price integer,
  p_pass_mark integer, p_status text, p_lessons jsonb, p_questions jsonb
) returns text language plpgsql security definer set search_path = public as $$
declare v_item jsonb; v_position smallint := 0; v_keep uuid[] := '{}'; v_id text := nullif(trim(coalesce(p_id, '')), ''); v_lesson uuid;
begin
  if not public.staff_can('content') then raise exception 'admins only'; end if;
  if char_length(trim(coalesce(p_title, ''))) not between 3 and 160 or coalesce(p_price, 0) < 0
     or coalesce(p_pass_mark, 70) not between 1 and 100 or coalesce(p_status, 'draft') not in ('draft', 'live') then
    raise exception 'invalid course';
  end if;
  if v_id is null then
    v_id := trim(both '-' from regexp_replace(lower(trim(p_title)), '[^a-z0-9]+', '-', 'g')) || '-' || substr(md5(gen_random_uuid()::text), 1, 5);
    insert into public.courses(id, title, category, kind, price, instructor, description, pass_mark, status)
    values (v_id, trim(p_title), coalesce(nullif(trim(p_category), ''), 'General'), 'course', coalesce(p_price, 0),
      coalesce(nullif(trim(p_instructor), ''), 'FindWork'), coalesce(trim(p_description), ''), coalesce(p_pass_mark, 70), coalesce(p_status, 'draft'));
  else
    update public.courses set title = trim(p_title), category = coalesce(nullif(trim(p_category), ''), category), price = coalesce(p_price, 0),
      instructor = coalesce(nullif(trim(p_instructor), ''), instructor), description = coalesce(trim(p_description), ''),
      pass_mark = coalesce(p_pass_mark, 70), status = coalesce(p_status, status)
    where id = v_id;
    if not found then raise exception 'course not found'; end if;
  end if;

  if p_lessons is not null then
    if jsonb_typeof(p_lessons) <> 'array' or jsonb_array_length(p_lessons) > 100 then raise exception 'invalid course'; end if;
    for v_item in select * from jsonb_array_elements(p_lessons) loop
      if nullif(v_item->>'id', '') is not null then v_keep := v_keep || (v_item->>'id')::uuid; end if;
    end loop;
    delete from public.course_lessons where course_id = v_id and id <> all (v_keep);
    -- Positions are rewritten below; move the survivors out of the way first.
    update public.course_lessons set position = position + 1000 where course_id = v_id;
    for v_item in select * from jsonb_array_elements(p_lessons) loop
      v_position := v_position + 1;
      if char_length(trim(coalesce(v_item->>'title', ''))) not between 2 and 160 then raise exception 'invalid course'; end if;
      v_lesson := nullif(v_item->>'id', '')::uuid;
      if v_lesson is not null then
        update public.course_lessons set title = trim(v_item->>'title'), minutes = coalesce((v_item->>'minutes')::integer, 0), position = v_position,
          body = nullif(trim(coalesce(v_item->>'body', '')), ''), video_path = nullif(v_item->>'video_path', ''), video_url = nullif(trim(coalesce(v_item->>'video_url', '')), '')
        where id = v_lesson and course_id = v_id;
      else
        insert into public.course_lessons(course_id, title, minutes, position, body, video_path, video_url)
        values (v_id, trim(v_item->>'title'), coalesce((v_item->>'minutes')::integer, 0), v_position,
          nullif(trim(coalesce(v_item->>'body', '')), ''), nullif(v_item->>'video_path', ''), nullif(trim(coalesce(v_item->>'video_url', '')), ''));
      end if;
    end loop;
  end if;

  if p_questions is not null then
    if jsonb_typeof(p_questions) <> 'array' or jsonb_array_length(p_questions) > 50 then raise exception 'invalid course'; end if;
    delete from public.quiz_questions where course_id = v_id;
    v_position := 0;
    for v_item in select * from jsonb_array_elements(p_questions) loop
      v_position := v_position + 1;
      insert into public.quiz_questions(course_id, position, prompt, options, correct_index)
      values (v_id, v_position, trim(v_item->>'prompt'),
        (select array_agg(trim(o)) from jsonb_array_elements_text(v_item->'options') o), (v_item->>'correct_index')::smallint);
    end loop;
  end if;
  return v_id;
end;
$$;

-- The quiz with its answers, for the author's editor only.
create function public.admin_course_quiz(p_course_id text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.staff_can('content') then raise exception 'admins only'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('prompt', prompt, 'options', options, 'correct_index', correct_index) order by position)
    from public.quiz_questions where course_id = p_course_id), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Internships
-- ---------------------------------------------------------------------------

alter table public.user_preferences add column skills text[] not null default '{}' check (cardinality(skills) <= 30);

create function public.save_skills(p_skills text[])
returns void language plpgsql security definer set search_path = public as $$
declare v_skills text[];
begin
  perform 1 from public.profiles where id = auth.uid() and deleted_at is null;
  if not found then raise exception 'not authenticated'; end if;
  select coalesce(array_agg(distinct s), '{}') into v_skills
  from (select lower(trim(x)) as s from unnest(coalesce(p_skills, '{}')) x) cleaned where char_length(s) between 2 and 40;
  if cardinality(v_skills) > 30 then raise exception 'too many choices'; end if;
  insert into public.user_preferences(profile_id, skills) values (auth.uid(), v_skills)
  on conflict (profile_id) do update set skills = excluded.skills, updated_at = now();
end;
$$;

create table public.internships (
  id uuid primary key default gen_random_uuid(),
  employer_id uuid not null references public.profiles(id),
  company text not null check (char_length(trim(company)) between 2 and 160),
  title text not null check (char_length(trim(title)) between 3 and 160),
  description text not null check (char_length(description) <= 4000),
  skills text[] not null default '{}' check (cardinality(skills) <= 15),
  area text references public.service_areas(name),
  location text,
  duration text,
  -- Monthly, in naira; null when unpaid, which the listing says plainly.
  stipend integer check (stipend is null or stipend >= 0),
  closes_on date,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now()
);
create index internships_open on public.internships(status, created_at desc);
alter table public.internships enable row level security;
revoke all on public.internships from anon, authenticated;
grant select on public.internships to authenticated;
create policy "Open internships are browsable; an employer sees their own" on public.internships for select to authenticated
  using ((status = 'open' and not public.is_suspended(employer_id)) or employer_id = auth.uid() or public.staff_can('moderation'));

create table public.internship_applications (
  id uuid primary key default gen_random_uuid(),
  internship_id uuid not null references public.internships(id) on delete cascade,
  applicant_id uuid not null references public.profiles(id) on delete cascade,
  cover_note text not null check (char_length(trim(cover_note)) between 20 and 2000),
  -- How much of what the internship asks for the applicant showed, at the time they applied.
  match_score smallint not null default 0 check (match_score between 0 and 100),
  matched_skills text[] not null default '{}',
  status text not null default 'submitted' check (status in ('submitted', 'shortlisted', 'accepted', 'rejected', 'withdrawn')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  unique (internship_id, applicant_id)
);
create index internship_applications_applicant on public.internship_applications(applicant_id, created_at desc);
alter table public.internship_applications enable row level security;
revoke all on public.internship_applications from anon, authenticated;
grant select on public.internship_applications to authenticated;
create policy "Applicant and employer read an application" on public.internship_applications for select to authenticated
  using (applicant_id = auth.uid() or exists(select 1 from public.internships i where i.id = internship_id and i.employer_id = auth.uid()));

-- What someone can show: the skills they listed, what they are certified
-- in, and their trade if they are a provider.
create function private.profile_skills(p_profile_id uuid)
returns text[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct s), '{}') from (
    select unnest(skills) as s from public.user_preferences where profile_id = p_profile_id
    union select lower(co.category) from public.certificates ce join public.courses co on co.id = ce.course_id where ce.profile_id = p_profile_id
    union select lower(category) from public.provider_profiles where id = p_profile_id
  ) all_skills where s is not null;
$$;
revoke all on function private.profile_skills(uuid) from public, anon, authenticated;

-- The share of the listed skills the person has, with ten points for being
-- in the same area. An internship that lists no skills matches on area only.
create function private.internship_match(p_internship public.internships, p_profile_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_have text[] := private.profile_skills(p_profile_id); v_matched text[]; v_score integer; v_area text;
begin
  select coalesce(array_agg(w), '{}') into v_matched from unnest(p_internship.skills) w where lower(w) = any(v_have);
  select area into v_area from public.profiles where id = p_profile_id;
  v_score := case when cardinality(p_internship.skills) = 0 then 50
    else round(90.0 * cardinality(v_matched) / cardinality(p_internship.skills)) end
    + case when p_internship.area is not null and p_internship.area = v_area then 10 else 0 end;
  return jsonb_build_object('score', least(100, v_score), 'matched', v_matched, 'same_area', p_internship.area is not null and p_internship.area = v_area);
end;
$$;
revoke all on function private.internship_match(public.internships, uuid) from public, anon, authenticated;

create function public.post_internship(
  p_company text, p_title text, p_description text, p_skills text[], p_area text, p_location text,
  p_duration text, p_stipend integer, p_closes_on date
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_skills text[];
begin
  perform 1 from public.profiles where id = auth.uid() and deleted_at is null and suspended_at is null;
  if not found then raise exception 'not authenticated'; end if;
  -- An employer is someone FindWork has identified.
  if private.verification_tier(auth.uid()) < 2 then raise exception 'verification required to post'; end if;
  select coalesce(array_agg(distinct s), '{}') into v_skills
  from (select lower(trim(x)) as s from unnest(coalesce(p_skills, '{}')) x) cleaned where char_length(s) between 2 and 40;
  if (select count(*) from public.internships where employer_id = auth.uid() and status = 'open') >= 20 then raise exception 'too many open internships'; end if;
  insert into public.internships(employer_id, company, title, description, skills, area, location, duration, stipend, closes_on)
  values (auth.uid(), trim(p_company), trim(p_title), coalesce(trim(p_description), ''), v_skills, p_area, nullif(trim(p_location), ''),
    nullif(trim(p_duration), ''), p_stipend, p_closes_on)
  returning id into v_id;
  return v_id;
end;
$$;

create function public.close_internship(p_internship_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.internships set status = 'closed' where id = p_internship_id and employer_id = auth.uid();
$$;

create function public.apply_to_internship(p_internship_id uuid, p_cover_note text)
returns uuid language plpgsql security definer set search_path = public as $$
declare i public.internships; v_match jsonb; v_id uuid;
begin
  perform 1 from public.profiles where id = auth.uid() and deleted_at is null and suspended_at is null;
  if not found then raise exception 'not authenticated'; end if;
  select * into i from public.internships where id = p_internship_id;
  if i.id is null or i.status <> 'open' or (i.closes_on is not null and i.closes_on < (now() at time zone 'Africa/Lagos')::date) then
    raise exception 'internship is closed';
  end if;
  if i.employer_id = auth.uid() then raise exception 'cannot apply to your own internship'; end if;
  if char_length(trim(coalesce(p_cover_note, ''))) not between 20 and 2000 then raise exception 'cover note required'; end if;
  v_match := private.internship_match(i, auth.uid());
  insert into public.internship_applications(internship_id, applicant_id, cover_note, match_score, matched_skills)
  values (p_internship_id, auth.uid(), trim(p_cover_note), (v_match->>'score')::smallint,
    (select coalesce(array_agg(m), '{}') from jsonb_array_elements_text(v_match->'matched') m))
  returning id into v_id;
  perform public.notify(i.employer_id, 'system', 'New internship application', i.title, 'internship', i.id::text);
  return v_id;
end;
$$;

-- The employer shortlists, accepts or rejects; the applicant may withdraw.
create function public.update_internship_application(p_application_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare a public.internship_applications; i public.internships;
begin
  select * into a from public.internship_applications where id = p_application_id for update;
  if a.id is null then raise exception 'application not found'; end if;
  select * into i from public.internships where id = a.internship_id;
  if p_status = 'withdrawn' then
    if a.applicant_id <> auth.uid() then raise exception 'application not found'; end if;
    if a.status in ('accepted', 'rejected', 'withdrawn') then raise exception 'application already decided'; end if;
  elsif p_status in ('shortlisted', 'accepted', 'rejected') then
    if i.employer_id <> auth.uid() then raise exception 'application not found'; end if;
    if a.status in ('accepted', 'rejected', 'withdrawn') then raise exception 'application already decided'; end if;
  else
    raise exception 'invalid status';
  end if;
  update public.internship_applications set status = p_status,
    decided_at = case when p_status in ('accepted', 'rejected', 'withdrawn') then now() end where id = p_application_id;
  if p_status <> 'withdrawn' then
    perform public.notify(a.applicant_id, 'system',
      case p_status when 'shortlisted' then 'You were shortlisted' when 'accepted' then 'Your application was accepted' else 'An application was not successful' end,
      i.title || ' · ' || i.company, 'internship', i.id::text);
  end if;
end;
$$;

-- Open internships with how well each fits the caller, best first.
create function public.internship_matches()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  return coalesce((
    select jsonb_agg(row order by (row->'match'->>'score')::integer desc, row->>'created_at' desc)
    from (
      select to_jsonb(i) || jsonb_build_object(
        'match', private.internship_match(i, auth.uid()),
        'applied', exists(select 1 from public.internship_applications a where a.internship_id = i.id and a.applicant_id = auth.uid())) as row
      from public.internships i
      where i.status = 'open' and i.employer_id <> auth.uid() and not public.is_suspended(i.employer_id)
        and (i.closes_on is null or i.closes_on >= (now() at time zone 'Africa/Lagos')::date)
      order by i.created_at desc limit 200
    ) rows), '[]'::jsonb);
end;
$$;

revoke all on function public.course_content(text) from public, anon;
revoke all on function public.submit_quiz(text, integer[]) from public, anon;
revoke all on function public.admin_save_course(text, text, text, text, text, integer, integer, text, jsonb, jsonb) from public, anon;
revoke all on function public.admin_course_quiz(text) from public, anon;
revoke all on function public.save_skills(text[]) from public, anon;
revoke all on function public.post_internship(text, text, text, text[], text, text, text, integer, date) from public, anon;
revoke all on function public.close_internship(uuid) from public, anon;
revoke all on function public.apply_to_internship(uuid, text) from public, anon;
revoke all on function public.update_internship_application(uuid, text) from public, anon;
revoke all on function public.internship_matches() from public, anon;
revoke all on function public.verify_certificate(text) from public;
grant execute on function public.course_content(text) to authenticated;
grant execute on function public.submit_quiz(text, integer[]) to authenticated;
grant execute on function public.admin_save_course(text, text, text, text, text, integer, integer, text, jsonb, jsonb) to authenticated;
grant execute on function public.admin_course_quiz(text) to authenticated;
grant execute on function public.save_skills(text[]) to authenticated;
grant execute on function public.post_internship(text, text, text, text[], text, text, text, integer, date) to authenticated;
grant execute on function public.close_internship(uuid) to authenticated;
grant execute on function public.apply_to_internship(uuid, text) to authenticated;
grant execute on function public.update_internship_application(uuid, text) to authenticated;
grant execute on function public.internship_matches() to authenticated;
grant execute on function public.verify_certificate(text) to anon, authenticated;
