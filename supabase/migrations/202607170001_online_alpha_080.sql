-- Rota Brasil Tycoon 0.8.0 — Online Alpha.
-- Movimento é efêmero em Realtime Broadcast. Nenhuma tabela abaixo recebe frames.

create extension if not exists pgcrypto;

create table if not exists public.online_worlds (
  id text primary key check (id ~ '^city:[a-z0-9-]+:public:[0-9]+$'),
  city_id text not null,
  map_version text not null,
  protocol_version smallint not null check (protocol_version > 0),
  status text not null default 'ONLINE' check (status in ('ONLINE','MAINTENANCE','CLOSED')),
  maximum_sessions integer not null default 1000 check (maximum_sessions between 2 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.online_worlds (id, city_id, map_version, protocol_version)
values ('city:brasilia:public:1', 'brasilia', 'brasilia-0.7.0', 1)
on conflict (id) do update set map_version = excluded.map_version, protocol_version = excluded.protocol_version, updated_at = now();

create table if not exists public.public_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  public_player_id text not null unique check (public_player_id ~ '^rbp_[a-z0-9]{8,32}$'),
  driver_name text not null check (char_length(driver_name) between 3 and 20 and driver_name !~ '[<>]'),
  avatar_id text not null check (avatar_id in ('driver-amber','driver-blue','driver-green','driver-violet')),
  status text not null default 'OFFLINE' check (status in ('ONLINE','OFFLINE','HIDDEN')),
  name_changed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists public_profiles_driver_name_lower_idx on public.public_profiles(lower(driver_name));

create table if not exists public.fleet_public_profiles (
  fleet_public_id text primary key check (fleet_public_id ~ '^rbf_[a-z0-9]{8,32}$'),
  owner_user_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 3 and 20 and name !~ '[<>]'),
  tag text not null check (tag ~ '^[A-Z0-9]{2,5}$'),
  color text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  emblem_id text not null check (emblem_id in ('road-star','capital-wheel','cerrado-route')),
  public_vehicle_count smallint not null default 0 check (public_vehicle_count between 0 and 99),
  status text not null default 'OFFLINE' check (status in ('ACTIVE','OFFLINE')),
  updated_at timestamptz not null default now()
);

create table if not exists public.online_sessions (
  id uuid primary key default gen_random_uuid(),
  public_session_id text not null unique check (public_session_id ~ '^rbs_[a-z0-9]{8,40}$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  public_player_id text not null references public.public_profiles(public_player_id) on delete cascade,
  world_id text not null references public.online_worlds(id) on delete restrict,
  current_chunk text not null check (current_chunk ~ '^-?[0-9]+_-?[0-9]+$'),
  authorized_chunks text[] not null default '{}',
  vehicle_id text not null check (char_length(vehicle_id) between 5 and 64),
  map_version text not null,
  protocol_version smallint not null,
  auth_is_anonymous boolean not null default false,
  status text not null default 'ONLINE' check (status in ('ONLINE','RECONNECTING','OFFLINE')),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '60 seconds',
  created_at timestamptz not null default now()
);

create table if not exists public.vehicle_control_leases (
  vehicle_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references public.online_sessions(id) on delete cascade,
  acquired_at timestamptz not null default now(),
  expires_at timestamptz not null,
  heartbeat_at timestamptz not null default now(),
  state_version bigint not null check (state_version > 0)
);

create table if not exists public.player_last_locations (
  user_id uuid primary key references auth.users(id) on delete cascade,
  public_player_id text not null references public.public_profiles(public_player_id) on delete cascade,
  world_id text not null references public.online_worlds(id) on delete restrict,
  chunk_id text not null,
  region text not null,
  local_x numeric(9,2) not null,
  local_y numeric(9,2) not null,
  layer smallint not null default 0,
  heading numeric(8,5) not null default 0,
  checkpoint_reason text not null check (checkpoint_reason in ('REGION','CHECKPOINT','EXIT','DISCONNECT','RIDE')),
  updated_at timestamptz not null default now()
);

create table if not exists public.fleet_public_deployments (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  fleet_public_id text not null references public.fleet_public_profiles(fleet_public_id) on delete cascade,
  public_deployment_id text not null unique check (public_deployment_id ~ '^rbd_[a-z0-9]{8,40}$'),
  shift_id text not null,
  vehicle_id text not null,
  driver_public_name text not null check (char_length(driver_public_name) between 3 and 20 and driver_public_name !~ '[<>]'),
  vehicle_model text not null check (vehicle_model in ('Hatch 1998','Sedan 2012')),
  region text not null,
  chunk_id text not null check (chunk_id ~ '^-?[0-9]+_-?[0-9]+$'),
  corridors text[] not null default '{}',
  deterministic_seed text not null,
  public_state text not null default 'ACTIVE' check (public_state in ('ACTIVE','FINISHED','CANCELLED')),
  version smallint not null default 1,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  unique (owner_user_id, shift_id)
);

create table if not exists public.online_incidents (
  id uuid primary key default gen_random_uuid(),
  public_incident_id text not null unique check (public_incident_id ~ '^inc_[a-z0-9-]{8,64}$'),
  reporter_user_id uuid not null references auth.users(id) on delete cascade,
  reporter_session_id uuid not null references public.online_sessions(id) on delete cascade,
  world_id text not null references public.online_worlds(id) on delete restrict,
  chunk_id text not null,
  incident_type text not null check (incident_type in ('COLLISION','IMPOSSIBLE_SNAPSHOT','PAYLOAD','ABUSE')),
  subject_public_player_id text,
  payload jsonb not null default '{}',
  server_validated boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.online_blocks (
  blocker_user_id uuid not null references auth.users(id) on delete cascade,
  blocked_public_player_id text not null references public.public_profiles(public_player_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_user_id, blocked_public_player_id)
);

create table if not exists public.online_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  mode text not null default 'ONLINE' check (mode in ('ONLINE','SOLO')),
  show_names boolean not null default true,
  show_fleets boolean not null default true,
  show_players_on_map boolean not null default true,
  remote_sounds boolean not null default true,
  visual_limit smallint not null default 24 check (visual_limit between 0 and 50),
  public_presence boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.online_rate_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  window_started_at timestamptz not null,
  attempts integer not null default 0,
  primary key (user_id, action, window_started_at)
);

create index if not exists online_sessions_user_idx on public.online_sessions(user_id, last_seen_at desc);
create index if not exists online_sessions_world_chunk_idx on public.online_sessions(world_id, current_chunk, expires_at desc);
create index if not exists online_sessions_public_player_idx on public.online_sessions(public_player_id, expires_at desc);
create index if not exists online_sessions_public_session_idx on public.online_sessions(public_session_id);
create index if not exists leases_user_expires_idx on public.vehicle_control_leases(user_id, expires_at);
create index if not exists leases_session_idx on public.vehicle_control_leases(session_id);
create index if not exists deployments_chunk_ends_idx on public.fleet_public_deployments(chunk_id, ends_at) where public_state = 'ACTIVE';
create index if not exists deployments_fleet_idx on public.fleet_public_deployments(fleet_public_id, ends_at desc);
create index if not exists incidents_reporter_created_idx on public.online_incidents(reporter_user_id, created_at desc);
create index if not exists blocks_blocked_idx on public.online_blocks(blocked_public_player_id);

alter table public.online_worlds enable row level security;
alter table public.public_profiles enable row level security;
alter table public.online_sessions enable row level security;
alter table public.vehicle_control_leases enable row level security;
alter table public.player_last_locations enable row level security;
alter table public.fleet_public_profiles enable row level security;
alter table public.fleet_public_deployments enable row level security;
alter table public.online_incidents enable row level security;
alter table public.online_blocks enable row level security;
alter table public.online_preferences enable row level security;
alter table public.online_rate_limits enable row level security;

create policy online_worlds_authenticated_read on public.online_worlds for select to authenticated using (true);
create policy public_profiles_own_read on public.public_profiles for select to authenticated using ((select auth.uid()) = user_id);
create policy public_profiles_own_insert on public.public_profiles for insert to authenticated with check ((select auth.uid()) = user_id);
create policy public_profiles_own_update on public.public_profiles for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy online_sessions_own_read on public.online_sessions for select to authenticated using ((select auth.uid()) = user_id);
create policy leases_own_read on public.vehicle_control_leases for select to authenticated using ((select auth.uid()) = user_id);
create policy locations_own_read on public.player_last_locations for select to authenticated using ((select auth.uid()) = user_id);
create policy fleet_public_profiles_own_read on public.fleet_public_profiles for select to authenticated using ((select auth.uid()) = owner_user_id);
create policy deployments_own_read on public.fleet_public_deployments for select to authenticated using ((select auth.uid()) = owner_user_id);
create policy incidents_own_read on public.online_incidents for select to authenticated using ((select auth.uid()) = reporter_user_id);
create policy blocks_own_all on public.online_blocks for all to authenticated using ((select auth.uid()) = blocker_user_id) with check ((select auth.uid()) = blocker_user_id);
create policy preferences_own_all on public.online_preferences for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

revoke all on public.online_sessions, public.vehicle_control_leases, public.online_rate_limits from anon, authenticated;
grant select on public.online_worlds, public.public_profiles, public.vehicle_control_leases, public.fleet_public_profiles, public.fleet_public_deployments, public.online_incidents to authenticated;
grant select on public.online_sessions to authenticated;
grant select on public.player_last_locations to authenticated;
grant select, insert, update, delete on public.online_blocks, public.online_preferences to authenticated;

create or replace function public.online_rate_limit(p_action text, p_limit integer, p_window interval)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_start timestamptz; v_attempts integer; v_window_seconds bigint;
begin
  if v_user is null or p_limit < 1 or p_window is null or p_window <= interval '0 seconds' then return false; end if;
  v_window_seconds := greatest(1, floor(extract(epoch from p_window))::bigint);
  v_start := to_timestamp(floor(extract(epoch from now()) / v_window_seconds) * v_window_seconds);
  delete from public.online_rate_limits where window_started_at < now() - interval '1 day';
  insert into public.online_rate_limits(user_id, action, window_started_at, attempts)
  values (v_user, p_action, v_start, 1)
  on conflict (user_id, action, window_started_at) do update set attempts = public.online_rate_limits.attempts + 1
  returning attempts into v_attempts;
  return v_attempts <= p_limit;
end $$;

create or replace function public.report_player_location(
  p_public_session_id text, p_chunk_id text, p_region text, p_local_x numeric, p_local_y numeric,
  p_layer integer, p_heading numeric, p_reason text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid:=auth.uid(); v_session uuid; v_public_player text; v_world text;
begin
  if p_chunk_id !~ '^-?[0-9]+_-?[0-9]+$'
    or char_length(coalesce(p_region,'')) not between 2 and 64 or p_region ~ '[<>]'
    or p_local_x not between -80 and 1104 or p_local_y not between -80 and 1104
    or p_layer not between -8 and 8 or abs(p_heading) > 1000
    or p_reason not in ('REGION','CHECKPOINT','EXIT','DISCONNECT','RIDE')
  then raise exception using errcode='P0001',message='LOCATION_INVALID'; end if;
  select id,public_player_id,world_id into v_session,v_public_player,v_world
  from public.online_sessions
  where public_session_id=p_public_session_id and user_id=v_user and status in ('ONLINE','RECONNECTING')
    and expires_at>now() and p_chunk_id=any(authorized_chunks);
  if v_session is null then raise exception using errcode='P0001',message='SESSION_INVALID'; end if;
  insert into public.player_last_locations(user_id,public_player_id,world_id,chunk_id,region,local_x,local_y,layer,heading,checkpoint_reason,updated_at)
  values(v_user,v_public_player,v_world,p_chunk_id,p_region,p_local_x,p_local_y,p_layer,p_heading,p_reason,now())
  on conflict(user_id) do update set public_player_id=excluded.public_player_id,world_id=excluded.world_id,
    chunk_id=excluded.chunk_id,region=excluded.region,local_x=excluded.local_x,local_y=excluded.local_y,
    layer=excluded.layer,heading=excluded.heading,checkpoint_reason=excluded.checkpoint_reason,updated_at=now();
  return jsonb_build_object('saved',true,'serverTime',now());
end $$;

create or replace function public.join_online_world(
  p_world_id text, p_public_player_id text, p_driver_name text, p_avatar_id text,
  p_fleet_public_id text, p_fleet_name text, p_fleet_tag text, p_fleet_color text, p_fleet_emblem_id text,
  p_chunk_id text, p_authorized_chunks text[], p_vehicle_id text, p_map_version text, p_protocol_version integer
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_session uuid; v_public_session text; v_is_anonymous boolean;
begin
  if v_user is null then raise exception using errcode='28000', message='AUTH_REQUIRED'; end if;
  if not public.online_rate_limit('join-world', 12, interval '1 minute') then raise exception using errcode='P0001', message='RATE_LIMITED'; end if;
  if p_world_id <> 'city:brasilia:public:1' or p_map_version <> 'brasilia-0.7.0' or p_protocol_version <> 1 then raise exception using errcode='P0001', message='VERSION_MISMATCH'; end if;
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

create or replace function public.claim_vehicle_control(p_public_session_id text,p_vehicle_id text,p_state_version bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid:=auth.uid(); v_session uuid; v_lease public.vehicle_control_leases%rowtype;
begin
  select id into v_session from public.online_sessions where public_session_id=p_public_session_id and user_id=v_user and status in ('ONLINE','RECONNECTING') and expires_at>now() for update;
  if v_session is null then raise exception using errcode='P0001',message='SESSION_INVALID'; end if;
  if not exists(select 1 from public.public_profiles p where p.user_id=v_user and p_vehicle_id like p.public_player_id||'__%')
    or not exists(select 1 from public.game_saves gs cross join lateral jsonb_array_elements(coalesce(gs.save_data->'fleet'->'vehicles','[]'::jsonb)) v where gs.user_id=v_user and v->>'id'=split_part(p_vehicle_id,'__',2))
  then raise exception using errcode='P0001',message='VEHICLE_NOT_OWNED'; end if;
  select * into v_lease from public.vehicle_control_leases where vehicle_id=p_vehicle_id for update;
  if v_lease.vehicle_id is not null and v_lease.expires_at>now() and v_lease.session_id<>v_session then return jsonb_build_object('acquired',false,'reason','LEASE_HELD','expiresAt',v_lease.expires_at); end if;
  insert into public.vehicle_control_leases(vehicle_id,user_id,session_id,expires_at,state_version)
  values(p_vehicle_id,v_user,v_session,now()+interval '45 seconds',greatest(1,p_state_version))
  on conflict(vehicle_id) do update set user_id=excluded.user_id,session_id=excluded.session_id,acquired_at=now(),expires_at=excluded.expires_at,heartbeat_at=now(),state_version=greatest(public.vehicle_control_leases.state_version,excluded.state_version);
  return jsonb_build_object('acquired',true,'expiresAt',now()+interval '45 seconds');
end $$;

create or replace function public.release_vehicle_control(p_public_session_id text,p_vehicle_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid:=auth.uid(); v_deleted integer;
begin
  delete from public.vehicle_control_leases l using public.online_sessions s
  where l.vehicle_id=p_vehicle_id and l.session_id=s.id and s.public_session_id=p_public_session_id and l.user_id=v_user;
  get diagnostics v_deleted=row_count;
  return jsonb_build_object('released',v_deleted=1);
end $$;

create or replace function public.online_session_heartbeat(p_public_session_id text,p_vehicle_id text,p_chunk_id text,p_authorized_chunks text[],p_state_version bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid:=auth.uid(); v_session uuid;
begin
  if p_chunk_id !~ '^-?[0-9]+_-?[0-9]+$' or coalesce(array_length(p_authorized_chunks,1),0)>9 then raise exception using errcode='P0001',message='CHUNKS_INVALID'; end if;
  update public.online_sessions set current_chunk=p_chunk_id,authorized_chunks=array(select distinct unnest(array[p_chunk_id]||p_authorized_chunks)),last_seen_at=now(),expires_at=now()+interval '60 seconds',status='ONLINE'
  where public_session_id=p_public_session_id and user_id=v_user returning id into v_session;
  if v_session is null then raise exception using errcode='P0001',message='SESSION_INVALID'; end if;
  update public.vehicle_control_leases set heartbeat_at=now(),expires_at=now()+interval '45 seconds',state_version=greatest(state_version,p_state_version)
  where vehicle_id=p_vehicle_id and user_id=v_user and session_id=v_session;
  return jsonb_build_object('ok',true,'serverTime',now(),'leaseExpiresAt',now()+interval '45 seconds');
end $$;

create or replace function public.report_online_incident(p_public_session_id text,p_public_incident_id text,p_incident_type text,p_subject text,p_chunk_id text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid:=auth.uid(); v_session uuid; v_world text;
begin
  if not public.online_rate_limit('report-incident',10,interval '1 minute') then raise exception using errcode='P0001',message='RATE_LIMITED'; end if;
  if octet_length(coalesce(p_payload,'{}'::jsonb)::text)>4096 then raise exception using errcode='P0001',message='PAYLOAD_TOO_LARGE'; end if;
  select id,world_id into v_session,v_world from public.online_sessions where public_session_id=p_public_session_id and user_id=v_user;
  if v_session is null then raise exception using errcode='P0001',message='SESSION_INVALID'; end if;
  insert into public.online_incidents(public_incident_id,reporter_user_id,reporter_session_id,world_id,chunk_id,incident_type,subject_public_player_id,payload)
  values(p_public_incident_id,v_user,v_session,v_world,p_chunk_id,p_incident_type,p_subject,coalesce(p_payload,'{}')) on conflict(public_incident_id) do nothing;
  return jsonb_build_object('accepted',true,'incidentId',p_public_incident_id,'economicDamageApplied',false);
end $$;

create or replace function public.create_fleet_public_deployment(p_shift_id text,p_vehicle_id text,p_driver_id text,p_region text,p_chunk_id text,p_starts_at timestamptz,p_ends_at timestamptz,p_version integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid:=auth.uid(); v_fleet public.fleet_public_profiles%rowtype; v_vehicle jsonb; v_employee jsonb; v_public_id text;
begin
  if not public.online_rate_limit('create-deployment',6,interval '1 minute') then raise exception using errcode='P0001',message='RATE_LIMITED'; end if;
  select * into v_fleet from public.fleet_public_profiles where owner_user_id=v_user;
  select v into v_vehicle from public.game_saves gs cross join lateral jsonb_array_elements(coalesce(gs.save_data->'fleet'->'vehicles','[]')) v where gs.user_id=v_user and v->>'id'=p_vehicle_id;
  select e into v_employee from public.game_saves gs cross join lateral jsonb_array_elements(coalesce(gs.save_data->'fleet'->'employees','[]')) e where gs.user_id=v_user and e->>'id'=p_driver_id;
  if v_fleet.owner_user_id is null or v_vehicle is null or v_employee is null or p_ends_at<=p_starts_at or p_ends_at>p_starts_at+interval '8 hours' then raise exception using errcode='P0001',message='DEPLOYMENT_INVALID'; end if;
  v_public_id:='rbd_'||substr(md5(v_user::text||p_shift_id),1,24);
  insert into public.fleet_public_deployments(owner_user_id,fleet_public_id,public_deployment_id,shift_id,vehicle_id,driver_public_name,vehicle_model,region,chunk_id,deterministic_seed,version,starts_at,ends_at)
  values(v_user,v_fleet.fleet_public_id,v_public_id,p_shift_id,p_vehicle_id,left(v_employee->>'name',20),v_vehicle->>'model',p_region,p_chunk_id,md5(v_public_id||p_chunk_id),p_version,p_starts_at,p_ends_at)
  on conflict(owner_user_id,shift_id) do update set region=excluded.region,chunk_id=excluded.chunk_id,ends_at=excluded.ends_at,public_state='ACTIVE'
  returning public_deployment_id into v_public_id;
  return jsonb_build_object('deploymentId',v_public_id,'accepted',true);
end $$;

create or replace function public.finish_fleet_public_deployment(p_shift_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid:=auth.uid(); v_count integer;
begin
  update public.fleet_public_deployments set public_state='FINISHED',finished_at=now() where owner_user_id=v_user and shift_id=p_shift_id and public_state='ACTIVE';
  get diagnostics v_count=row_count;
  return jsonb_build_object('finished',v_count=1);
end $$;

revoke all on function public.online_rate_limit(text,integer,interval) from public;
revoke all on function public.join_online_world(text,text,text,text,text,text,text,text,text,text,text[],text,text,integer) from public;
revoke all on function public.claim_vehicle_control(text,text,bigint) from public;
revoke all on function public.release_vehicle_control(text,text) from public;
revoke all on function public.online_session_heartbeat(text,text,text,text[],bigint) from public;
revoke all on function public.report_player_location(text,text,text,numeric,numeric,integer,numeric,text) from public;
revoke all on function public.report_online_incident(text,text,text,text,text,jsonb) from public;
revoke all on function public.create_fleet_public_deployment(text,text,text,text,text,timestamptz,timestamptz,integer) from public;
revoke all on function public.finish_fleet_public_deployment(text) from public;
grant execute on function public.join_online_world(text,text,text,text,text,text,text,text,text,text,text[],text,text,integer) to authenticated;
grant execute on function public.claim_vehicle_control(text,text,bigint) to authenticated;
grant execute on function public.release_vehicle_control(text,text) to authenticated;
grant execute on function public.online_session_heartbeat(text,text,text,text[],bigint) to authenticated;
grant execute on function public.report_player_location(text,text,text,numeric,numeric,integer,numeric,text) to authenticated;
grant execute on function public.report_online_incident(text,text,text,text,text,jsonb) to authenticated;
grant execute on function public.create_fleet_public_deployment(text,text,text,text,text,timestamptz,timestamptz,integer) to authenticated;
grant execute on function public.finish_fleet_public_deployment(text) to authenticated;

-- Realtime Authorization: somente sessão online pode entrar na presença da cidade
-- e nos canais movement/events dos chunks explicitamente autorizados.
create policy rbt_online_realtime_read on realtime.messages for select to authenticated using (
  realtime.messages.extension in ('broadcast','presence') and exists (
    select 1 from public.online_sessions s where s.user_id=(select auth.uid()) and s.status in ('ONLINE','RECONNECTING') and s.expires_at>now() and (
      (select realtime.topic())='city:brasilia:presence' or exists (
        select 1 from unnest(s.authorized_chunks) c where (select realtime.topic()) in (
          'city:brasilia:chunk:'||c||':movement','city:brasilia:chunk:'||c||':events'
        )
      )
    )
  )
);
create policy rbt_online_realtime_write on realtime.messages for insert to authenticated with check (
  realtime.messages.extension in ('broadcast','presence') and exists (
    select 1 from public.online_sessions s where s.user_id=(select auth.uid()) and s.status in ('ONLINE','RECONNECTING') and s.expires_at>now() and (
      (select realtime.topic())='city:brasilia:presence' or exists (
        select 1 from unnest(s.authorized_chunks) c where (select realtime.topic()) in (
          'city:brasilia:chunk:'||c||':movement','city:brasilia:chunk:'||c||':events'
        )
      )
    )
  )
);

-- Usuários anônimos inativos não são removidos automaticamente pelo Supabase.
-- Execute por cron autorizado, nunca pelo cliente:
-- delete from auth.users where is_anonymous is true and created_at < now()-interval '30 days'
--   and not exists(select 1 from public.online_sessions s where s.user_id=auth.users.id and s.last_seen_at>now()-interval '30 days');
