-- PLAYABLE 0.8.2: authorize the expanded Brasília map without changing the
-- online protocol or weakening the existing authenticated/RLS boundary.

update public.online_worlds
set map_version = 'brasilia-0.8.2', protocol_version = 1, updated_at = now()
where id = 'city:brasilia:public:1';

create or replace function public.join_online_world(
  p_world_id text, p_public_player_id text, p_driver_name text, p_avatar_id text,
  p_fleet_public_id text, p_fleet_name text, p_fleet_tag text, p_fleet_color text, p_fleet_emblem_id text,
  p_chunk_id text, p_authorized_chunks text[], p_vehicle_id text, p_map_version text, p_protocol_version integer
) returns jsonb language plpgsql security definer set search_path = pg_catalog, extensions as $$
declare v_user uuid := auth.uid(); v_session uuid; v_public_session text; v_is_anonymous boolean;
begin
  if v_user is null then raise exception using errcode='28000', message='AUTH_REQUIRED'; end if;
  if not public.online_rate_limit('join-world', 12, interval '1 minute') then raise exception using errcode='P0001', message='RATE_LIMITED'; end if;
  if p_world_id <> 'city:brasilia:public:1' or p_map_version <> 'brasilia-0.8.2' or p_protocol_version <> 1 then raise exception using errcode='P0001', message='VERSION_MISMATCH'; end if;
  if p_public_player_id !~ '^rbp_[a-z0-9]{8,32}$' or p_driver_name !~ '^[[:alnum:]À-ÿ ]{3,20}$' or p_driver_name ~ '[<>]' then raise exception using errcode='P0001', message='PUBLIC_PROFILE_INVALID'; end if;
  if p_chunk_id !~ '^-?[0-9]+_-?[0-9]+$' or coalesce(array_length(p_authorized_chunks,1),0) > 9 or exists (select 1 from unnest(p_authorized_chunks) c where c !~ '^-?[0-9]+_-?[0-9]+$') then raise exception using errcode='P0001', message='CHUNKS_INVALID'; end if;
  if exists (select 1 from public.public_profiles where user_id=v_user and driver_name<>p_driver_name and name_changed_at > now()-interval '24 hours') then raise exception using errcode='P0001', message='NAME_COOLDOWN'; end if;
  insert into public.public_profiles(user_id, public_player_id, driver_name, avatar_id, status)
  values(v_user,p_public_player_id,p_driver_name,p_avatar_id,'ONLINE')
  on conflict(user_id) do update set public_player_id=excluded.public_player_id, driver_name=excluded.driver_name,
    avatar_id=excluded.avatar_id, status='ONLINE', name_changed_at=case when public.public_profiles.driver_name<>excluded.driver_name then now() else public.public_profiles.name_changed_at end, updated_at=now();
  insert into public.fleet_public_profiles(fleet_public_id,owner_user_id,name,tag,color,emblem_id,status)
  values(p_fleet_public_id,v_user,p_fleet_name,p_fleet_tag,p_fleet_color,p_fleet_emblem_id,'ACTIVE')
  on conflict(owner_user_id) do update set name=excluded.name,tag=excluded.tag,color=excluded.color,emblem_id=excluded.emblem_id,status='ACTIVE',updated_at=now();
  v_public_session := 'rbs_' || encode(extensions.gen_random_bytes(12),'hex');
  v_is_anonymous := coalesce((auth.jwt()->>'is_anonymous')::boolean,false);
  insert into public.online_sessions(public_session_id,user_id,public_player_id,world_id,current_chunk,authorized_chunks,vehicle_id,map_version,protocol_version,auth_is_anonymous)
  values(v_public_session,v_user,p_public_player_id,p_world_id,p_chunk_id,array(select distinct unnest(array[p_chunk_id]||p_authorized_chunks)),p_vehicle_id,p_map_version,p_protocol_version,v_is_anonymous)
  returning id into v_session;
  insert into public.online_preferences(user_id) values(v_user) on conflict(user_id) do nothing;
  return jsonb_build_object('sessionId',v_public_session,'publicPlayerId',p_public_player_id,'serverTime',now(),'anonymous',v_is_anonymous);
end $$;

revoke all on function public.join_online_world(text,text,text,text,text,text,text,text,text,text,text[],text,text,integer) from public;
grant execute on function public.join_online_world(text,text,text,text,text,text,text,text,text,text,text[],text,text,integer) to authenticated;
