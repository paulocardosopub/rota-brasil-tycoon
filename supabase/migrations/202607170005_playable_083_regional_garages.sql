-- PLAYABLE 0.8.3: propriedades regionais e limites por garagem.
create table if not exists public.fleet_garages (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  fleet_id uuid not null references public.fleets(id) on delete cascade,
  service_id text not null,
  region_id text not null,
  purchase_price_cents bigint not null default 0 check (purchase_price_cents >= 0),
  operating_cost_cents bigint not null default 0 check (operating_cost_cents >= 0),
  vehicle_capacity smallint not null default 5 check (vehicle_capacity = 5),
  employee_capacity smallint not null default 5 check (employee_capacity = 5),
  acquired_at timestamptz not null default now(),
  unique (owner_user_id, service_id)
);

alter table public.vehicles add column if not exists base_garage_id uuid references public.fleet_garages(id) on delete restrict;
alter table public.employees add column if not exists base_garage_id uuid references public.fleet_garages(id) on delete restrict;
alter table public.fleet_garages enable row level security;
drop policy if exists fleet_garages_own on public.fleet_garages;
create policy fleet_garages_own on public.fleet_garages for all
  using ((select auth.uid()) = owner_user_id) with check ((select auth.uid()) = owner_user_id);

insert into public.fleet_garages (owner_user_id, fleet_id, service_id, region_id)
select owner_user_id, id, 'garage-shs-hatch', 'centro' from public.fleets
on conflict (owner_user_id, service_id) do nothing;

update public.vehicles v set base_garage_id = g.id from public.fleet_garages g
where v.base_garage_id is null and g.fleet_id = v.fleet_id and g.service_id = 'garage-shs-hatch';
update public.employees e set base_garage_id = g.id from public.fleet_garages g
where e.base_garage_id is null and g.fleet_id = e.fleet_id and g.service_id = 'garage-shs-hatch';

create or replace function public.enforce_garage_capacity()
returns trigger language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_owner uuid; v_count bigint; v_limit smallint;
begin
  if new.base_garage_id is null then return new; end if;
  select owner_user_id, case when tg_table_name = 'vehicles' then vehicle_capacity else employee_capacity end
    into v_owner, v_limit from public.fleet_garages where id = new.base_garage_id;
  if v_owner is distinct from new.owner_user_id then raise exception 'garage ownership mismatch'; end if;
  if tg_table_name = 'vehicles' then
    select count(*) into v_count from public.vehicles where base_garage_id = new.base_garage_id and id is distinct from new.id;
  else
    select count(*) into v_count from public.employees where base_garage_id = new.base_garage_id and id is distinct from new.id;
  end if;
  if v_count >= v_limit then raise exception 'garage capacity reached'; end if;
  return new;
end $$;

drop trigger if exists vehicles_garage_capacity on public.vehicles;
create trigger vehicles_garage_capacity before insert or update of base_garage_id on public.vehicles
for each row execute function public.enforce_garage_capacity();
drop trigger if exists employees_garage_capacity on public.employees;
create trigger employees_garage_capacity before insert or update of base_garage_id on public.employees
for each row execute function public.enforce_garage_capacity();

revoke all on public.fleet_garages from anon;
grant select, insert, update on public.fleet_garages to authenticated;
