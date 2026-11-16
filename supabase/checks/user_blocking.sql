-- Run after all migrations and seed on staging/CI, never production.
-- All writes roll back. Exercise authorization at the database boundary.
begin;
create function pg_temp.assert_true(label text, value boolean) returns void language plpgsql as $$
begin
  if value is distinct from true then raise exception 'FAIL %', label; end if;
  raise notice 'ok %', label;
end $$;
create function pg_temp.must_fail(label text, statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if position(expected in sqlerrm) > 0 or sqlstate = expected then
      raise notice 'ok %', label; return;
    end if;
    raise exception 'FAIL %: %', label, sqlerrm;
  end;
  raise exception 'FAIL %: statement succeeded', label;
end $$;
grant execute on all functions in schema pg_temp to authenticated, service_role;
insert into public.social_posts(author_id, kind, media_path, mime, caption)
values ('00000000-0000-0000-0000-000000000002', 'reel', 'blocking-check-only', 'video/mp4', 'Blocking fixture')
returning id as post_id \gset
insert into public.live_streams(seller_id, title, playback_url, video, status, started_at)
values ('00000000-0000-0000-0000-000000000002', 'Blocking fixture', null, 'livekit', 'live', now())
returning id as stream_id \gset
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
set local role authenticated;
select public.get_or_create_thread('00000000-0000-0000-0000-000000000002') as thread_id \gset
insert into public.user_blocks(blocker_id, blocked_id)
values (auth.uid(), '00000000-0000-0000-0000-000000000002');
select pg_temp.assert_true('own block is visible', public.users_blocked(auth.uid(), '00000000-0000-0000-0000-000000000002'));
select pg_temp.assert_true('blocked author is absent from feed RPC', public.social_feed('reel', '00000000-0000-0000-0000-000000000002') = '[]'::jsonb);
select pg_temp.assert_true('blocked social media cannot be signed', not public.can_read_social_media('blocking-check-only'));
select pg_temp.assert_true('blocked post is hidden from direct table reads', (select count(*) = 0 from public.social_posts where id = :'post_id'));
select pg_temp.assert_true('blocked seller stream is hidden', (select count(*) = 0 from public.live_streams where id = :'stream_id'));
select pg_temp.must_fail('blocked viewer cannot post through stream RPC', format($$select public.send_stream_message(%L, 'Blocked')$$, :'stream_id'), 'messaging blocked');
reset role;
set local role service_role;
select pg_temp.assert_true('service video grant refuses blocked viewer', public.stream_access(:'stream_id', '00000000-0000-0000-0000-000000000001') is null);
reset role;
set local role authenticated;

select pg_temp.must_fail('cannot block as someone else', $$insert into public.user_blocks(blocker_id, blocked_id) values ('00000000-0000-0000-0000-000000000003', auth.uid())$$, '42501');
select pg_temp.must_fail('cannot block yourself', $$insert into public.user_blocks(blocker_id, blocked_id) values (auth.uid(), auth.uid())$$, '23514');
select pg_temp.must_fail('blocker cannot reopen the conversation', $$select public.get_or_create_thread('00000000-0000-0000-0000-000000000002')$$, 'messaging blocked');
select pg_temp.must_fail('blocker cannot send to an existing thread', format($$insert into public.chat_messages(thread_id, sender_id, text) values (%L, auth.uid(), 'Blocked')$$, :'thread_id'), 'messaging blocked');
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
set local role authenticated;
select pg_temp.assert_true('recipient sees relationship is blocked', public.users_blocked(auth.uid(), '00000000-0000-0000-0000-000000000001'));
select pg_temp.assert_true('recipient cannot enumerate blockers', (select count(*) = 0 from public.user_blocks));
delete from public.user_blocks where blocked_id = auth.uid();
select pg_temp.assert_true('recipient cannot remove someone else block', public.users_blocked(auth.uid(), '00000000-0000-0000-0000-000000000001'));
select pg_temp.must_fail('recipient cannot send to an existing thread', format($$insert into public.chat_messages(thread_id, sender_id, text) values (%L, auth.uid(), 'Blocked')$$, :'thread_id'), 'messaging blocked');
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
set local role authenticated;
select pg_temp.assert_true('third parties cannot inspect others blocks', not public.users_blocked('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002'));
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
set local role authenticated;
delete from public.user_blocks where blocker_id = auth.uid() and blocked_id = '00000000-0000-0000-0000-000000000002';
select pg_temp.assert_true('unblock restores relationship', not public.users_blocked(auth.uid(), '00000000-0000-0000-0000-000000000002'));
insert into public.chat_messages(thread_id, sender_id, text) values (:'thread_id', auth.uid(), 'Unblocked');
reset role;
rollback;
