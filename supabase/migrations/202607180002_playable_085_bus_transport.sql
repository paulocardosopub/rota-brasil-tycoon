-- PLAYABLE 0.8.5: empresa de ônibus e transporte coletivo.
alter table public.player_businesses drop constraint if exists player_businesses_kind_check;
alter table public.player_businesses add constraint player_businesses_kind_check check (kind in ('delivery','light-freight','bus'));

alter table public.vehicles drop constraint if exists vehicles_model_check;
alter table public.vehicles add constraint vehicles_model_check check (model in (
  'Hatch 1998','Sedan 2012','Compacto 2010','Sedan Executivo 2018','SUV Urbano 2020','Moto Urbana 125','Moto Cargo 160','Scooter Express 150','Triciclo Cargo 200','Hatch Entrega',
  'Furgão Compacto','Van de Carga','Picape Leve','Furgão Médio','Utilitário Baú','Micro-ônibus Urbano','Ônibus Urbano Convencional'
));

alter table public.fleet_public_deployments drop constraint if exists fleet_public_deployments_vehicle_model_check;
alter table public.fleet_public_deployments add constraint fleet_public_deployments_vehicle_model_check check (vehicle_model in (
  'Hatch 1998','Sedan 2012','Compacto 2010','Sedan Executivo 2018','SUV Urbano 2020','Moto Urbana 125','Moto Cargo 160','Scooter Express 150','Triciclo Cargo 200','Hatch Entrega',
  'Furgão Compacto','Van de Carga','Picape Leve','Furgão Médio','Utilitário Baú','Micro-ônibus Urbano','Ônibus Urbano Convencional'
));

create table if not exists public.bus_operation_summaries (
  id uuid primary key default gen_random_uuid(), owner_user_id uuid not null references auth.users(id) on delete cascade,
  line_id text not null, vehicle_id uuid references public.vehicles(id) on delete set null,
  completed_trips integer not null default 0 check (completed_trips >= 0), boarded integer not null default 0 check (boarded >= 0),
  refused integer not null default 0 check (refused >= 0), gross_revenue numeric(14,2) not null default 0 check (gross_revenue >= 0),
  updated_at timestamptz not null default now(), unique(owner_user_id, line_id)
);
alter table public.bus_operation_summaries enable row level security;
drop policy if exists bus_operation_summaries_owner_all on public.bus_operation_summaries;
create policy bus_operation_summaries_owner_all on public.bus_operation_summaries for all to authenticated
  using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
grant select, insert, update, delete on public.bus_operation_summaries to authenticated;
