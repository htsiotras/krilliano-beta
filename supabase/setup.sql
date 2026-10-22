-- Run once in a new Supabase project's SQL Editor.
-- No passwords, Google secrets, or service-role keys belong in the website.
begin;

create table public.players (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  account_email text unique,
  display_name text not null check (char_length(display_name) between 2 and 24),
  name_key text generated always as (lower(btrim(display_name))) stored unique,
  created_at timestamptz not null default now(),
  opening_points bigint not null default 0 check (opening_points between 0 and 1000000000000),
  opening_wins integer not null default 0 check (opening_wins between 0 and 1000000),
  opening_through date
);

create table public.scores (
  player_id uuid not null references public.players(id) on delete cascade,
  day date not null,
  score integer not null check (score between 0 and 1000000000),
  updated_at timestamptz not null default now(),
  primary key (player_id, day)
);
create index scores_day_idx on public.scores(day desc);
alter table public.players enable row level security;
alter table public.scores enable row level security;
revoke all on public.players, public.scores from anon, authenticated;

create table public.admin_emails(email text primary key);
alter table public.admin_emails enable row level security;
revoke all on public.admin_emails from anon, authenticated;
insert into public.admin_emails(email) values ('htsiotras@gmail.com');

create table public.admin_audit (
  id bigint generated always as identity primary key,
  actor uuid not null,
  action text not null,
  player_id uuid not null,
  details jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.admin_audit enable row level security;
revoke all on public.admin_audit from anon, authenticated;

create function public.is_club_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from auth.users u join public.admin_emails a on a.email = lower(u.email)
    where u.id = auth.uid() and u.email_confirmed_at is not null)
$$;

-- Historical players can be entered before their first visit. Only a verified
-- matching email may claim one of these records; scores stay on the same player ID.
create function public.claim_player() returns void
language plpgsql security definer set search_path = '' as $$
declare v_email text;
begin
  if auth.uid() is null then raise exception 'Please sign in first.'; end if;
  select lower(email) into v_email from auth.users where id = auth.uid() and email_confirmed_at is not null;
  if v_email is null then return; end if;
  update public.players set auth_user_id = auth.uid()
    where account_email = v_email and auth_user_id is null
    and not exists(select 1 from public.players where auth_user_id = auth.uid());
end $$;

create function public.eastern_day() returns date
language sql stable set search_path = ''
as $$ select (now() at time zone 'America/New_York')::date $$;

create function public.create_player(p_name text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_name text := btrim(p_name); v_email text;
begin
  if auth.uid() is null then raise exception 'Please sign in first.'; end if;
  if v_name is null or char_length(v_name) not between 2 and 24
    or v_name ~ '[[:cntrl:]]' then
    raise exception 'Choose a name with 2–24 characters.';
  end if;
  if exists (select 1 from public.players where auth_user_id = auth.uid()) then
    raise exception 'Your player profile already exists.';
  end if;
  perform public.claim_player();
  if exists (select 1 from public.players where auth_user_id = auth.uid()) then return; end if;
  select lower(email) into v_email from auth.users where id = auth.uid() and email_confirmed_at is not null;
  if v_email is null then raise exception 'A verified Google email is required.'; end if;
  insert into public.players(id, auth_user_id, display_name, account_email) values (auth.uid(), auth.uid(), v_name, v_email);
exception when unique_violation then
  raise exception 'That name is already taken. Try another one.';
end $$;

create function public.save_score(p_score integer, p_expected_day date) returns void
language plpgsql security definer set search_path = '' as $$
declare v_day date := public.eastern_day(); v_player uuid;
begin
  if auth.uid() is null then raise exception 'Please sign in first.'; end if;
  select id into v_player from public.players where auth_user_id = auth.uid();
  if v_player is null then
    raise exception 'Choose your player name first.';
  end if;
  if p_expected_day is null or p_expected_day <> v_day then
    raise exception 'A new day has started. Refresh before submitting today’s score.';
  end if;
  if p_score is null or p_score < 0 or p_score > 1000000000 then
    raise exception 'Enter a whole-number score between 0 and 1,000,000,000.';
  end if;
  insert into public.scores(player_id, day, score)
  values(v_player, v_day, p_score)
  on conflict(player_id, day) do update set score = excluded.score, updated_at = now();
end $$;

-- Wins are calculated from closed days. No scheduled job, destructive reset,
-- or repeatedly awarded win is needed. All highest-score ties receive a win.
create function public.club_state() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_day date := public.eastern_day(); v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Please sign in first.'; end if;
  with daily_max as (
    select day, max(score) as best from public.scores where day < v_day group by day
  ), wins as (
    select s.player_id, count(*) as wins from public.scores s
    join daily_max d on d.day = s.day and d.best = s.score group by s.player_id
  ), totals as (
    select player_id, sum(score) as points, count(*) as days from public.scores group by player_id
  )
  select jsonb_build_object(
    'day', v_day,
    'serverTime', now(),
    'resetAt', (v_day + 1)::timestamp at time zone 'America/New_York',
    'meId', (select id from public.players where auth_user_id = auth.uid()),
    'isAdmin', public.is_club_admin(),
    'players', coalesce((select jsonb_agg(jsonb_build_object(
      'id', p.id, 'name', p.display_name, 'today', s.score,
      'wins', coalesce(w.wins, 0) + p.opening_wins, 'total', coalesce(t.points, 0) + p.opening_points,
      'days', coalesce(t.days, 0), 'hasOpening', p.opening_through is not null
    ) order by p.created_at) from public.players p
      left join public.scores s on s.player_id = p.id and s.day = v_day
      left join wins w on w.player_id = p.id
      left join totals t on t.player_id = p.id), '[]'::jsonb)
  ) into v_result;
  return v_result;
end $$;

create function public.admin_players() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_club_admin() then raise exception 'Admin access is required.'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id', id, 'name', display_name, 'email', account_email, 'linked', auth_user_id is not null,
    'openingPoints', opening_points, 'openingWins', opening_wins, 'openingThrough', opening_through
  ) order by display_name) from public.players), '[]'::jsonb);
end $$;

create function public.admin_save_player(p_id uuid, p_name text, p_email text,
  p_points bigint, p_wins integer, p_through date) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid := p_id; v_email text := nullif(lower(btrim(p_email)), ''); v_old public.players%rowtype;
begin
  if not public.is_club_admin() then raise exception 'Admin access is required.'; end if;
  if p_name is null or char_length(btrim(p_name)) not between 2 and 24 or p_name ~ '[[:cntrl:]]' then
    raise exception 'Choose a name with 2–24 characters.'; end if;
  if v_email is not null and v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Enter a valid Google email, or leave it blank for now.'; end if;
  if p_points is null or p_wins is null or p_points not between 0 and 1000000000000
    or p_wins not between 0 and 1000000 then raise exception 'Opening totals must be nonnegative whole numbers.'; end if;
  if (p_points > 0 or p_wins > 0) and p_through is null then raise exception 'Choose the last date included in these totals.'; end if;
  if p_through >= public.eastern_day() then raise exception 'Opening totals must end before today.'; end if;
  if p_id is not null then
    select * into v_old from public.players where id = p_id for update;
    if not found then raise exception 'Player not found.'; end if;
    if v_old.auth_user_id is not null and v_email is distinct from v_old.account_email then
      raise exception 'This player has already signed in. Their linked email cannot be changed here.'; end if;
    if p_through is not null and exists(select 1 from public.scores where player_id = p_id and day <= p_through) then
      raise exception 'These totals overlap saved daily scores. Choose an earlier cutoff to avoid counting twice.'; end if;
    update public.players set display_name = btrim(p_name), account_email = v_email,
      opening_points = p_points, opening_wins = p_wins, opening_through = p_through where id = p_id;
  else
    insert into public.players(display_name, account_email, opening_points, opening_wins, opening_through)
      values(btrim(p_name), v_email, p_points, p_wins, p_through) returning id into v_id;
  end if;
  insert into public.admin_audit(actor, action, player_id, details) values(auth.uid(), 'save_player', v_id,
    jsonb_build_object('previous', to_jsonb(v_old), 'name', btrim(p_name), 'openingPoints', p_points,
      'openingWins', p_wins, 'openingThrough', p_through));
  return v_id;
exception when unique_violation then raise exception 'That name or email already belongs to another player.';
end $$;

create function public.admin_day(p_day date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_club_admin() then raise exception 'Admin access is required.'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.display_name,
    'score', s.score, 'includedInOpening', coalesce(p_day <= p.opening_through, false)) order by p.display_name)
    from public.players p left join public.scores s on s.player_id = p.id and s.day = p_day), '[]'::jsonb);
end $$;

-- Null removes an erroneous entry. All administrative changes are logged.
create function public.admin_save_score(p_player uuid, p_day date, p_score integer) returns void
language plpgsql security definer set search_path = '' as $$
declare v_old integer; v_player public.players%rowtype;
begin
  if not public.is_club_admin() then raise exception 'Admin access is required.'; end if;
  if p_day is null or p_day > public.eastern_day() then raise exception 'Choose today or a past date.'; end if;
  if p_score is not null and p_score not between 0 and 1000000000 then raise exception 'Enter a valid nonnegative whole-number score.'; end if;
  select * into v_player from public.players where id = p_player for update;
  if not found then raise exception 'Player not found.'; end if;
  if p_day <= v_player.opening_through then
    raise exception 'This date is included in the player’s opening totals. Use a later date or adjust those totals first.'; end if;
  select score into v_old from public.scores where player_id = p_player and day = p_day;
  if p_score is null then delete from public.scores where player_id = p_player and day = p_day;
  else insert into public.scores(player_id, day, score) values(p_player, p_day, p_score)
    on conflict(player_id, day) do update set score = excluded.score, updated_at = now(); end if;
  insert into public.admin_audit(actor, action, player_id, details) values(auth.uid(), 'save_score', p_player,
    jsonb_build_object('day', p_day, 'previousScore', v_old, 'score', p_score));
end $$;

create function public.club_history(p_before date default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Please sign in first.'; end if;
  with selected_days as (
    select distinct day from public.scores
    where day < public.eastern_day() and (p_before is null or day < p_before)
    order by day desc limit 30
  ), daily as (
    select s.day, max(s.score) as best,
      jsonb_agg(jsonb_build_object('id', p.id, 'name', p.display_name, 'score', s.score)
      order by s.score desc, p.display_name) as entries
    from public.scores s join selected_days d on d.day = s.day
    join public.players p on p.id = s.player_id group by s.day
  ) select coalesce(jsonb_agg(jsonb_build_object('day', day, 'best', best, 'entries', entries)
    order by day desc), '[]'::jsonb) into v_result from daily;
  return v_result;
end $$;

revoke all on function public.eastern_day() from public;
revoke all on function public.is_club_admin(), public.claim_player(), public.admin_players(),
  public.admin_save_player(uuid, text, text, bigint, integer, date), public.admin_day(date),
  public.admin_save_score(uuid, date, integer) from public;
revoke all on function public.create_player(text) from public;
revoke all on function public.save_score(integer, date) from public;
revoke all on function public.club_state() from public;
revoke all on function public.club_history(date) from public;
grant execute on function public.create_player(text), public.save_score(integer, date),
  public.club_state(), public.club_history(date), public.claim_player(), public.admin_players(),
  public.admin_save_player(uuid, text, text, bigint, integer, date), public.admin_day(date),
  public.admin_save_score(uuid, date, integer) to authenticated;
commit;
