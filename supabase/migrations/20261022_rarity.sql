-- Apply in Supabase SQL Editor AFTER reviewing; do not rerun setup.sql.
begin;
create table if not exists public.score_rarities (
  player_id uuid not null,
  day date not null,
  rounds integer[] not null,
  updated_at timestamptz not null default now(),
  primary key (player_id, day),
  foreign key (player_id, day) references public.scores(player_id, day) on delete cascade,
  constraint seven_rounds check (array_length(rounds, 1) = 7),
  constraint allowed_rounds check (rounds <@ array[0,10,15,30,60,85,100]::integer[])
);
alter table public.score_rarities enable row level security;
revoke all on public.score_rarities from anon, authenticated;

create or replace function public.save_rarity(p_expected_day date, p_rounds integer[]) returns void
language plpgsql security definer set search_path = '' as $$
declare v_player uuid; v_score integer;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if p_expected_day is distinct from public.eastern_day() then
    raise exception 'The day changed. Refresh before saving.'; end if;
  if p_rounds is null or array_length(p_rounds,1) is distinct from 7
    or array_position(p_rounds,null) is not null
    or not (p_rounds <@ array[0,10,15,30,60,85,100]::integer[]) then
    raise exception 'Choose a valid result for all seven prompts.'; end if;
  select id into v_player from public.players where auth_user_id = auth.uid();
  select score into v_score from public.scores where player_id = v_player and day = p_expected_day for update;
  if v_score is null then raise exception 'Submit your daily score first.'; end if;
  if (select sum(x) from unnest(p_rounds) x) <> v_score then
    raise exception 'Rarity results must add up to the daily score.'; end if;
  insert into public.score_rarities(player_id,day,rounds) values(v_player,p_expected_day,p_rounds)
  on conflict(player_id,day) do update set rounds=excluded.rounds, updated_at=now();
end $$;

create or replace function public.rarity_board() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in first.'; end if;
 select coalesce(jsonb_agg(jsonb_build_object(
   'id', p.id, 'name', p.display_name,
   'krillion',coalesce(z.krillion,0), 'deepCut',coalesce(z.deep_cut,0),
   'rare',coalesce(z.rare,0), 'schooler',coalesce(z.schooler,0),
   'tooClever',coalesce(z.too_clever,0), 'plankton',coalesce(z.plankton,0),
   'missed',coalesce(z.missed,0), 'verifiedDays',coalesce(z.days,0)
 ) order by p.display_name),'[]'::jsonb) into v_result
 from public.players p left join lateral (
   select count(*) filter(where t.points=100) krillion,
          count(*) filter(where t.points=85) deep_cut,
          count(*) filter(where t.points=60) rare,
          count(*) filter(where t.points=30) schooler,
          count(*) filter(where t.points=15) too_clever,
          count(*) filter(where t.points=10) plankton,
          count(*) filter(where t.points=0) missed,
          count(distinct r.day) days
   from public.score_rarities r
   join public.scores s on s.player_id=r.player_id and s.day=r.day
     and s.score=(select sum(n) from unnest(r.rounds) n)
   cross join lateral unnest(r.rounds) as t(points)
   where r.player_id=p.id
 ) z on true;
 return v_result;
end $$;
revoke all on function public.save_rarity(date,integer[]), public.rarity_board() from public;
grant execute on function public.save_rarity(date,integer[]), public.rarity_board() to authenticated;
commit;
