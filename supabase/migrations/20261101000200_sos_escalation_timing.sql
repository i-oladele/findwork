-- SOS escalation, faster: agreed on 1 November 2026 in place of the first
-- proposal of 3 and 10 minutes.
--
-- An SOS nobody has taken goes to the primary again, the backup and every
-- admin after 2 minutes; to every admin and moderator after 5 minutes, and
-- again every 5 minutes until someone takes it. Otherwise as in
-- 20261101000100_sos_on_call.

create or replace function private.escalate_sos()
returns integer language plpgsql security definer set search_path = public as $$
declare a record; v_count integer := 0; v_minutes integer; v_backup uuid;
begin
  for a in
    select s.id, s.profile_id, s.assigned_to, s.escalation_level, s.created_at, p.full_name
    from public.sos_alerts s join public.profiles p on p.id = s.profile_id
    where s.status = 'open' and s.acknowledged_at is null and (
      (s.escalation_level = 0 and s.created_at <= now() - interval '2 minutes')
      or (s.escalation_level = 1 and s.created_at <= now() - interval '5 minutes')
      or (s.escalation_level >= 2 and s.escalated_at <= now() - interval '5 minutes'))
    order by s.created_at
    for update of s skip locked
  loop
    v_minutes := floor(extract(epoch from now() - a.created_at) / 60);
    if a.escalation_level = 0 then
      v_backup := private.sos_on_call('backup');
      insert into public.notifications(profile_id, kind, title, body, ref_type, ref_id)
      select p.id, 'system', 'SOS not taken after ' || v_minutes || ' minutes: ' || private.sos_title(a.full_name),
        'Nobody has pressed "I''m on it". If you can, take it now.', 'admin_sos', a.id::text
      from public.profiles p
      where p.deleted_at is null and p.suspended_at is null
        and (p.id = a.assigned_to or p.id = v_backup or p.staff_role = 'admin') and private.sos_staff(p.id)
        and p.id <> a.profile_id;
    else
      insert into public.notifications(profile_id, kind, title, body, ref_type, ref_id)
      select p.id, 'system', 'SOS still not taken after ' || v_minutes || ' minutes: ' || private.sos_title(a.full_name),
        'Whoever sees this first, take it now.', 'admin_sos', a.id::text
      from public.profiles p
      where p.deleted_at is null and p.suspended_at is null and p.staff_role in ('admin', 'moderator')
        and p.id <> a.profile_id;
    end if;
    update public.sos_alerts set escalation_level = escalation_level + 1, escalated_at = now() where id = a.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke all on function private.escalate_sos() from public, anon, authenticated;
