-- PLAYABLE 0.8.4: empresas, qualificações e veículos comerciais.
create table if not exists public.player_businesses (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('delivery','light-freight')),
  name text not null check (char_length(name) between 3 and 80),
  base_garage_id uuid not null references public.fleet_garages(id) on delete restrict,
  completed_jobs integer not null default 0 check (completed_jobs >= 0),
  gross_revenue numeric(14,2) not null default 0 check (gross_revenue >= 0),
  purchase_request_id text not null check (char_length(purchase_request_id) between 8 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_user_id, kind),
  unique(owner_user_id, purchase_request_id)
);

alter table public.player_businesses enable row level security;
drop policy if exists player_businesses_owner_all on public.player_businesses;
create policy player_businesses_owner_all on public.player_businesses for all to authenticated
  using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
grant select, insert, update, delete on public.player_businesses to authenticated;

alter table public.employees add column if not exists qualifications jsonb not null default '["CAR","TAXI"]'::jsonb;
alter table public.vehicles add column if not exists cargo_capacity_kg numeric(8,2) not null default 80 check (cargo_capacity_kg >= 0);
alter table public.vehicles add column if not exists cargo_volume_m3 numeric(8,3) not null default 0.45 check (cargo_volume_m3 >= 0);
alter table public.vehicles drop constraint if exists vehicles_model_check;
alter table public.vehicles add constraint vehicles_model_check check (model in (
  'Hatch 1998','Sedan 2012','Compacto 2010','Sedan Executivo 2018','SUV Urbano 2020','Moto Urbana 125','Moto Cargo 160','Scooter Express 150','Triciclo Cargo 200','Hatch Entrega',
  'Furgão Compacto','Van de Carga','Picape Leve','Furgão Médio','Utilitário Baú'
));

alter table public.fleet_public_deployments drop constraint if exists fleet_public_deployments_vehicle_model_check;
alter table public.fleet_public_deployments add constraint fleet_public_deployments_vehicle_model_check check (vehicle_model in (
  'Hatch 1998','Sedan 2012','Compacto 2010','Sedan Executivo 2018','SUV Urbano 2020','Moto Urbana 125','Moto Cargo 160','Scooter Express 150','Triciclo Cargo 200','Hatch Entrega',
  'Furgão Compacto','Van de Carga','Picape Leve','Furgão Médio','Utilitário Baú'
));

create index if not exists player_businesses_owner_idx on public.player_businesses(owner_user_id, updated_at desc);
