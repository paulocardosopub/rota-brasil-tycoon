-- RLS decides which rows authenticated players may access; these grants make
-- those policies reachable through PostgREST without exposing them to anon.

revoke all on public.profiles, public.game_saves, public.player_statistics,
  public.economy_transactions from anon;

grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.game_saves to authenticated;
grant select, insert, update on public.player_statistics to authenticated;
grant select, insert on public.economy_transactions to authenticated;
grant usage, select on sequence public.economy_transactions_id_seq to authenticated;

revoke all on public.player_wallets, public.fleets, public.fleet_members,
  public.vehicles, public.vehicle_ownership, public.employees,
  public.vehicle_assignments, public.driver_shifts, public.fleet_trips,
  public.fleet_transactions, public.vehicle_locations from anon;

grant select, insert, update, delete on public.player_wallets, public.fleets,
  public.fleet_members, public.vehicles, public.vehicle_ownership,
  public.employees, public.vehicle_assignments, public.driver_shifts,
  public.fleet_trips, public.fleet_transactions, public.vehicle_locations
  to authenticated;
