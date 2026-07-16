create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (char_length(display_name) between 1 and 50),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.game_saves (
  user_id uuid primary key references auth.users(id) on delete cascade,
  save_version integer not null default 1 check (save_version > 0),
  revision bigint not null default 1 check (revision > 0),
  save_data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.player_statistics (
  user_id uuid primary key references auth.users(id) on delete cascade,
  completed_rides integer not null default 0 check (completed_rides >= 0),
  distance_meters bigint not null default 0 check (distance_meters >= 0),
  play_time_seconds bigint not null default 0 check (play_time_seconds >= 0),
  xp integer not null default 0 check (xp >= 0),
  rating numeric(3,2) not null default 5.00 check (rating between 0 and 5),
  updated_at timestamptz not null default now()
);

create table public.economy_transactions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  transaction_type text not null check (transaction_type in ('ride', 'penalty', 'fuel', 'repair', 'purchase', 'adjustment')),
  amount_cents integer not null,
  balance_after_cents integer not null check (balance_after_cents >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index economy_transactions_user_created_idx on public.economy_transactions(user_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.game_saves enable row level security;
alter table public.player_statistics enable row level security;
alter table public.economy_transactions enable row level security;

create policy "profiles_select_own" on public.profiles for select using ((select auth.uid()) = id);
create policy "profiles_insert_own" on public.profiles for insert with check ((select auth.uid()) = id);
create policy "profiles_update_own" on public.profiles for update using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "game_saves_select_own" on public.game_saves for select using ((select auth.uid()) = user_id);
create policy "game_saves_insert_own" on public.game_saves for insert with check ((select auth.uid()) = user_id);
create policy "game_saves_update_own" on public.game_saves for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "game_saves_delete_own" on public.game_saves for delete using ((select auth.uid()) = user_id);

create policy "statistics_select_own" on public.player_statistics for select using ((select auth.uid()) = user_id);
create policy "statistics_insert_own" on public.player_statistics for insert with check ((select auth.uid()) = user_id);
create policy "statistics_update_own" on public.player_statistics for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "transactions_select_own" on public.economy_transactions for select using ((select auth.uid()) = user_id);
create policy "transactions_insert_own" on public.economy_transactions for insert with check ((select auth.uid()) = user_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name) values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)));
  insert into public.player_statistics (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
