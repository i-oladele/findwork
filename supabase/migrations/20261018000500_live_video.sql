-- PRD Livestream Selling, "Live streaming": FindWork carries the video.
--
-- A seller can now broadcast from their phone's camera inside FindWork, and
-- viewers watch in the selling room, through LiveKit. The pasted link stays
-- as the other choice, for sellers who broadcast with another app.
--
-- The livekit-token Edge Function decides who may join a stream's room, and
-- how: the seller may publish their camera from when the stream is created
-- until it ends; anyone else may only watch, and only while it is live.

alter table public.live_streams
  add column video text not null default 'link' check (video in ('link', 'livekit')),
  alter column playback_url drop not null,
  drop constraint live_streams_playback_url_check,
  add constraint live_streams_playback_url_check check (
    (video = 'link' and playback_url ~ '^https://' and char_length(playback_url) <= 500)
    or (video = 'livekit' and playback_url is null));

drop function public.schedule_stream(text, text, timestamptz, text[]);
create function public.schedule_stream(p_title text, p_playback_url text, p_scheduled_for timestamptz, p_product_ids text[], p_video text default 'link')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_product text; v_position smallint := 0;
begin
  perform 1 from public.profiles where id = auth.uid() and deleted_at is null and suspended_at is null for update;
  if not found or not exists(select 1 from public.provider_profiles where id = auth.uid()) then raise exception 'provider not found'; end if;
  if coalesce(p_video, 'link') not in ('link', 'livekit') then raise exception 'invalid stream link'; end if;
  if coalesce(p_video, 'link') = 'link' and coalesce(p_playback_url, '') !~ '^https://' then raise exception 'invalid stream link'; end if;
  if cardinality(coalesce(p_product_ids, '{}')) > 20 then raise exception 'too many products'; end if;
  if (select count(*) from public.live_streams where seller_id = auth.uid() and status in ('scheduled', 'live')) >= 5 then
    raise exception 'too many streams';
  end if;
  insert into public.live_streams(seller_id, title, playback_url, scheduled_for, video)
  values (auth.uid(), trim(p_title), case when coalesce(p_video, 'link') = 'link' then trim(p_playback_url) end, p_scheduled_for, coalesce(p_video, 'link'))
  returning id into v_id;
  foreach v_product in array coalesce(p_product_ids, '{}') loop
    v_position := v_position + 1;
    if not exists(select 1 from public.products where id = v_product and seller_id = auth.uid() and status = 'live') then
      raise exception 'product not found';
    end if;
    insert into public.stream_products(stream_id, product_id, position) values (v_id, v_product, v_position) on conflict do nothing;
  end loop;
  return v_id;
end;
$$;
revoke all on function public.schedule_stream(text, text, timestamptz, text[], text) from public, anon;
grant execute on function public.schedule_stream(text, text, timestamptz, text[], text) to authenticated;

-- Service role only, from livekit-token: may this person join this room,
-- and may they broadcast? Null when they may not join at all.
create function public.stream_access(p_stream_id uuid, p_profile_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select case
    when s.id is null or s.video <> 'livekit' then null
    when s.seller_id = p_profile_id and s.status in ('scheduled', 'live') and not public.is_suspended(p_profile_id)
      then jsonb_build_object('room', 'stream-' || s.id, 'publish', true, 'status', s.status, 'name', pp.business_name)
    when s.status = 'live' and not public.is_suspended(s.seller_id)
      and exists(select 1 from public.profiles p where p.id = p_profile_id and p.deleted_at is null)
      then jsonb_build_object('room', 'stream-' || s.id, 'publish', false, 'status', s.status,
        'name', (select split_part(full_name, ' ', 1) from public.profiles where id = p_profile_id))
    else null end
  from public.live_streams s left join public.provider_profiles pp on pp.id = s.seller_id
  where s.id = p_stream_id;
$$;
revoke all on function public.stream_access(uuid, uuid) from public, anon, authenticated;
grant execute on function public.stream_access(uuid, uuid) to service_role;
