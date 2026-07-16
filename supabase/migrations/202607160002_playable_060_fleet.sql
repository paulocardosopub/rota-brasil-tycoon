-- Rota Brasil Tycoon 0.6.0: táxi, frota e autoridade futura.
-- Valores de compra são definidos no servidor; nenhuma função aceita preço do cliente.

create table if not exists public.player_wallets (
  owner_user_id uuid primary key references auth.users(id) on delete cascade,
  balance_cents bigint not null default 10000 check (balance_cents >= 0),
  state_version bigint not null default 1,
  updated_at timestamptz not null default now()
);

create table if not exists public.fleets (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Minha Frota' check (char_length(name) between 1 and 60),
  capacity smallint not null default 2 check (capacity between 1 and 100),
  state_version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id)
);

create table if not exists public.fleet_members (
  fleet_id uuid not null references public.fleets(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('OWNER', 'MANAGER', 'DRIVER')),
  created_at timestamptz not null default now(),
  primary key (fleet_id, user_id)
);

create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  fleet_id uuid not null references public.fleets(id) on delete cascade,
  model text not null check (model in ('Hatch 1998', 'Sedan 2012')),
  controller_type text not null default 'PLAYER' check (controller_type in ('PLAYER', 'EMPLOYEE', 'AMBIENT_NPC', 'FUTURE_REMOTE_PLAYER', 'FUTURE_REMOTE_EMPLOYEE')),
  controller_id uuid,
  authority text not null default 'SERVER' check (authority in ('LOCAL', 'SERVER')),
  current_region text not null default 'brasilia-central',
  current_chunk text not null default 'garage',
  simulation_level text not null default 'ECONOMIC' check (simulation_level in ('DETAILED', 'SIMPLIFIED', 'ECONOMIC')),
  operational_state text not null default 'PARKED',
  taxi_licensed boolean not null default false,
  taxi_registration_id text,
  fuel_liters numeric(7,3) not null default 0 check (fuel_liters >= 0),
  condition_percent numeric(5,2) not null default 100 check (condition_percent between 0 and 100),
  odometer_km numeric(14,3) not null default 0 check (odometer_km >= 0),
  state_version bigint not null default 1,
  lease_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vehicle_ownership (
  vehicle_id uuid primary key references public.vehicles(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  fleet_id uuid not null references public.fleets(id) on delete cascade,
  acquired_at timestamptz not null default now(),
  purchase_price_cents bigint not null check (purchase_price_cents >= 0),
  registration_state text not null default 'ACTIVE'
);

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  fleet_id uuid not null references public.fleets(id) on delete cascade,
  candidate_key text not null,
  display_name text not null,
  driving smallint not null check (driving between 0 and 100),
  safety smallint not null check (safety between 0 and 100),
  service smallint not null check (service between 0 and 100),
  efficiency smallint not null check (efficiency between 0 and 100),
  commission_percent numeric(5,2) not null check (commission_percent between 0 and 100),
  employee_state text not null default 'AVAILABLE',
  state_version bigint not null default 1,
  hired_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (fleet_id, candidate_key)
);

create table if not exists public.vehicle_assignments (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  fleet_id uuid not null references public.fleets(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  active boolean not null default true,
  assigned_at timestamptz not null default now(),
  released_at timestamptz
);
create unique index if not exists vehicle_assignments_one_active_vehicle_idx on public.vehicle_assignments(vehicle_id) where active;
create unique index if not exists vehicle_assignments_one_active_employee_idx on public.vehicle_assignments(employee_id) where active;

create table if not exists public.driver_shifts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  fleet_id uuid not null references public.fleets(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete restrict,
  vehicle_id uuid not null references public.vehicles(id) on delete restrict,
  shift_state text not null default 'STARTING_SHIFT',
  policy jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  last_simulated_at timestamptz not null default now(),
  scheduled_end_at timestamptz not null,
  ended_at timestamptz,
  server_elapsed_seconds bigint not null default 0 check (server_elapsed_seconds >= 0),
  state_version bigint not null default 1
);
create unique index if not exists driver_shifts_one_active_employee_idx on public.driver_shifts(employee_id) where ended_at is null;
create unique index if not exists driver_shifts_one_active_vehicle_idx on public.driver_shifts(vehicle_id) where ended_at is null;

create table if not exists public.fleet_trips (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  fleet_id uuid not null references public.fleets(id) on delete cascade,
  shift_id uuid references public.driver_shifts(id) on delete set null,
  vehicle_id uuid not null references public.vehicles(id) on delete restrict,
  employee_id uuid references public.employees(id) on delete restrict,
  ride_mode text not null check (ride_mode in ('INFORMAL', 'OFFICIAL_TAXI')),
  trip_state text not null,
  distance_meters bigint not null default 0 check (distance_meters >= 0),
  gross_cents bigint not null default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  idempotency_key text not null,
  unique (owner_user_id, idempotency_key)
);

create table if not exists public.fleet_transactions (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  fleet_id uuid not null references public.fleets(id) on delete cascade,
  vehicle_id uuid references public.vehicles(id) on delete restrict,
  driver_id uuid,
  trip_id uuid references public.fleet_trips(id) on delete set null,
  category text not null,
  amount_cents bigint not null,
  balance_after_cents bigint not null check (balance_after_cents >= 0),
  idempotency_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (owner_user_id, idempotency_key)
);

create table if not exists public.vehicle_locations (
  vehicle_id uuid primary key references public.vehicles(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  fleet_id uuid not null references public.fleets(id) on delete cascade,
  current_region text not null,
  current_chunk text not null,
  x numeric(12,3) not null,
  y numeric(12,3) not null,
  heading numeric(9,6) not null default 0,
  speed_mps numeric(7,3) not null default 0,
  simulation_level text not null check (simulation_level in ('DETAILED', 'SIMPLIFIED', 'ECONOMIC')),
  state_version bigint not null default 1,
  updated_at timestamptz not null default now(),
  lease_expires_at timestamptz
);

create index if not exists fleets_owner_updated_idx on public.fleets(owner_user_id, updated_at desc);
create index if not exists vehicles_owner_updated_idx on public.vehicles(owner_user_id, updated_at desc);
create index if not exists vehicles_fleet_updated_idx on public.vehicles(fleet_id, updated_at desc);
create index if not exists employees_owner_updated_idx on public.employees(owner_user_id, updated_at desc);
create index if not exists shifts_owner_started_idx on public.driver_shifts(owner_user_id, started_at desc);
create index if not exists trips_fleet_started_idx on public.fleet_trips(fleet_id, started_at desc);
create index if not exists fleet_transactions_owner_created_idx on public.fleet_transactions(owner_user_id, created_at desc);
create index if not exists vehicle_locations_region_chunk_idx on public.vehicle_locations(current_region, current_chunk, updated_at desc);

alter table public.player_wallets enable row level security;
alter table public.fleets enable row level security;
alter table public.fleet_members enable row level security;
alter table public.vehicles enable row level security;
alter table public.vehicle_ownership enable row level security;
alter table public.employees enable row level security;
alter table public.vehicle_assignments enable row level security;
alter table public.driver_shifts enable row level security;
alter table public.fleet_trips enable row level security;
alter table public.fleet_transactions enable row level security;
alter table public.vehicle_locations enable row level security;

do $$
declare table_name text;
begin
  foreach table_name in array array['player_wallets','fleets','fleet_members','vehicles','vehicle_ownership','employees','vehicle_assignments','driver_shifts','fleet_trips','fleet_transactions','vehicle_locations']
  loop
    execute format('drop policy if exists %I on public.%I', table_name || '_own', table_name);
    execute format('create policy %I on public.%I for all using ((select auth.uid()) = owner_user_id) with check ((select auth.uid()) = owner_user_id)', table_name || '_own', table_name);
  end loop;
end $$;

insert into public.player_wallets (owner_user_id)
select id from auth.users on conflict (owner_user_id) do nothing;
insert into public.fleets (owner_user_id)
select id from auth.users on conflict (owner_user_id) do nothing;
insert into public.fleet_members (fleet_id, owner_user_id, user_id, role)
select f.id, f.owner_user_id, f.owner_user_id, 'OWNER' from public.fleets f
on conflict (fleet_id, user_id) do nothing;

create or replace function public.handle_new_fleet_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare v_fleet uuid;
begin
  insert into public.player_wallets (owner_user_id) values (new.id) on conflict do nothing;
  insert into public.fleets (owner_user_id) values (new.id)
    on conflict (owner_user_id) do update set updated_at = excluded.updated_at
    returning id into v_fleet;
  insert into public.fleet_members (fleet_id, owner_user_id, user_id, role)
    values (v_fleet, new.id, new.id, 'OWNER') on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_fleet on auth.users;
create trigger on_auth_user_created_fleet
  after insert on auth.users
  for each row execute procedure public.handle_new_fleet_user();

create or replace function public.purchase_sedan_2012(p_idempotency_key text)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_owner uuid := auth.uid();
  v_fleet uuid;
  v_vehicle uuid;
  v_balance bigint;
  v_price constant bigint := 65000;
begin
  if v_owner is null then raise exception 'authentication required'; end if;
  if p_idempotency_key is null or char_length(p_idempotency_key) < 8 then raise exception 'invalid idempotency key'; end if;

  select vehicle_id into v_vehicle from public.fleet_transactions
    where owner_user_id = v_owner and idempotency_key = p_idempotency_key;
  if v_vehicle is not null then return v_vehicle; end if;

  select id into v_fleet from public.fleets where owner_user_id = v_owner for update;
  if v_fleet is null then raise exception 'fleet not found'; end if;

  -- Revalidar depois do lock torna duas chamadas simultâneas realmente idempotentes.
  select vehicle_id into v_vehicle from public.fleet_transactions
    where owner_user_id = v_owner and idempotency_key = p_idempotency_key;
  if v_vehicle is not null then return v_vehicle; end if;

  if (select count(*) from public.vehicles where owner_user_id = v_owner and fleet_id = v_fleet)
    >= (select capacity from public.fleets where id = v_fleet) then raise exception 'fleet capacity reached'; end if;

  select balance_cents into v_balance from public.player_wallets where owner_user_id = v_owner for update;
  if v_balance is null or v_balance < v_price then raise exception 'insufficient funds'; end if;

  update public.player_wallets set balance_cents = balance_cents - v_price, state_version = state_version + 1, updated_at = now() where owner_user_id = v_owner;
  insert into public.vehicles (owner_user_id, fleet_id, model, taxi_licensed, fuel_liters, condition_percent)
    values (v_owner, v_fleet, 'Sedan 2012', true, 26, 78) returning id into v_vehicle;
  insert into public.vehicle_ownership (vehicle_id, owner_user_id, fleet_id, purchase_price_cents)
    values (v_vehicle, v_owner, v_fleet, v_price);
  insert into public.fleet_transactions (owner_user_id, fleet_id, vehicle_id, driver_id, category, amount_cents, balance_after_cents, idempotency_key)
    values (v_owner, v_fleet, v_vehicle, v_owner, 'FLEET_PURCHASE', -v_price, v_balance - v_price, p_idempotency_key);
  return v_vehicle;
end;
$$;

revoke all on function public.purchase_sedan_2012(text) from public;
grant execute on function public.purchase_sedan_2012(text) to authenticated;
