-- The staff analyst (PRD Real-Time Analytics, "Integrated with AI Analytics
-- Engine") is metered like the other assistant jobs. Like dispute
-- summaries, it is staff-only and not capped: the assistant function reads
-- the reports as the caller, so nobody without analytics access gets an
-- answer.

alter table public.assistant_usage drop constraint assistant_usage_task_check;
alter table public.assistant_usage add constraint assistant_usage_task_check
  check (task in ('command', 'support', 'translate', 'lesson', 'dispute', 'analytics'));

create or replace function public.assistant_allow(p_profile_id uuid, p_task text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  perform 1 from public.profiles where id = p_profile_id and deleted_at is null and suspended_at is null for update;
  if not found then return false; end if;
  if p_task not in ('dispute', 'analytics') and (select count(*) from public.assistant_usage
      where profile_id = p_profile_id and created_at > now() - interval '24 hours') >= 60 then
    return false;
  end if;
  insert into public.assistant_usage(profile_id, task) values (p_profile_id, p_task);
  return true;
end;
$$;
revoke all on function public.assistant_allow(uuid, text) from public, anon, authenticated;
grant execute on function public.assistant_allow(uuid, text) to service_role;
