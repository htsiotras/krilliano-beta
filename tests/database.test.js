import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('Database enforces the real multiplayer scoring rules', async t => {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated;
    create schema auth; create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated, anon;
    grant execute on function auth.uid() to authenticated, anon;
    insert into auth.users values ('00000000-0000-0000-0000-000000000001', 'htsiotras@gmail.com', now()),
    ('00000000-0000-0000-0000-000000000002', 'jamie@example.com', now()),
    ('00000000-0000-0000-0000-000000000003', 'sam@example.com', now());`);
  await db.exec(await readFile(new URL('../supabase/setup.sql', import.meta.url), 'utf8'));
  const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
  async function asPlayer(n) { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub', $1, false)", [n ? id(n) : '']); await db.exec('set role authenticated'); }
  const snapshot = async () => (await db.query('select public.club_state() as s')).rows[0].s;
  try {
    await t.test('Anonymous visitors cannot read or write club records', async () => {
      await db.exec('set role anon');
      await assert.rejects(db.query('select public.club_state()'), /permission denied/);
      await assert.rejects(db.query("select public.create_player('Intruder')"), /permission denied/);
      await asPlayer(null);
      await assert.rejects(db.query('select public.club_state()'), /sign in/);
    });
    await t.test('Account identity is fixed and player names are case-insensitively unique', async () => {
      await asPlayer(1); await db.query("select public.create_player('Alex')");
      await asPlayer(2); await assert.rejects(db.query("select public.create_player(' alex ')"), /already taken/);
      await db.query("select public.create_player('Jamie')");
      await assert.rejects(db.query("select public.create_player('Someone Else')"), /already exists/);
    });
    await t.test('Corrections replace one daily row and update the total', async () => {
      await asPlayer(1); const day = (await snapshot()).day;
      await db.query('select public.save_score($1, $2)', [300, day]);
      await db.query('select public.save_score($1, $2)', [450, day]);
      const me = (await snapshot()).players.find(p => p.id === id(1));
      assert.equal(me.today, 450); assert.equal(me.total, 450); assert.equal(me.days, 1); assert.equal(me.wins, 0);
    });
    await t.test('Direct writes, forged backdates, and invalid scores are blocked', async () => {
      await asPlayer(1); const day = (await snapshot()).day;
      await assert.rejects(db.query("update public.scores set score = 999"), /permission denied/);
      await assert.rejects(db.query("select public.save_score(1, '2000-01-01')"), /new day/);
      await assert.rejects(db.query('select public.save_score($1, $2)', [-1, day]), /whole-number/);
      await asPlayer(3); await assert.rejects(db.query('select public.save_score($1, $2)', [200, day]), /player name/);
    });
    await t.test('Tied closed-day leaders both win, and current-day leaders do not yet win', async () => {
      await db.exec('reset role');
      await db.query(`insert into public.scores(player_id, day, score) values
        ($1, public.eastern_day() - 1, 500), ($2, public.eastern_day() - 1, 500),
        ($1, public.eastern_day() - 2, 300), ($2, public.eastern_day() - 2, 400)`, [id(1), id(2)]);
      await asPlayer(1); const state = await snapshot();
      const alex = state.players.find(p => p.id === id(1)), jamie = state.players.find(p => p.id === id(2));
      assert.equal(alex.wins, 1); assert.equal(jamie.wins, 2);
      assert.equal(alex.total, 1250); assert.equal(jamie.total, 900);
      assert.equal(alex.days, 3); assert.equal(jamie.today, null);
      const again = await snapshot(); assert.deepEqual(again.players, state.players);
      const history = (await db.query('select public.club_history() as h')).rows[0].h;
      assert.equal(history.length, 2); assert.equal(history[0].entries.filter(p => p.score === history[0].best).length, 2);
      const older = (await db.query('select public.club_history($1) as h', [history[0].day])).rows[0].h;
      assert.equal(older.length, 1);
    });
    await t.test('A submitted zero counts as a score; another account cannot overwrite it', async () => {
      await asPlayer(2); const day = (await snapshot()).day;
      await db.query('select public.save_score($1, $2)', [0, day]);
      const players = (await snapshot()).players;
      assert.equal(players.find(p => p.id === id(2)).today, 0);
      assert.equal(players.find(p => p.id === id(1)).today, 450);
    });
    await t.test('PostgreSQL uses the right Eastern midnight across DST', async () => {
      await db.exec('reset role');
      const result = await db.query(`select
        ('2026-03-09'::date::timestamp at time zone 'America/New_York') as spring,
        ('2026-11-02'::date::timestamp at time zone 'America/New_York') as autumn`);
      assert.equal(new Date(result.rows[0].spring).toISOString(), '2026-03-09T04:00:00.000Z');
      assert.equal(new Date(result.rows[0].autumn).toISOString(), '2026-11-02T05:00:00.000Z');
    });
    await t.test('Regular players cannot use admin controls or read email addresses', async () => {
      await asPlayer(2);
      assert.equal((await snapshot()).isAdmin, false);
      await assert.rejects(db.query('select public.admin_players()'), /Admin access/);
      await assert.rejects(db.query("select public.admin_save_score($1, '2026-01-01', 999)", [id(1)]), /Admin access/);
      await assert.rejects(db.query("select public.admin_save_player(null, 'Hacker', null, 0, 0, null)"), /Admin access/);
      await assert.rejects(db.query('select * from public.admin_emails'), /permission denied/);
      assert.equal(JSON.stringify(await snapshot()).includes('@'), false);
    });
    await t.test('Owner can import totals and link an existing historical player by verified email', async () => {
      await asPlayer(1); assert.equal((await snapshot()).isAdmin, true);
      const imported = (await db.query("select public.admin_save_player(null, 'Sam', 'SAM@example.com', 10000, 15, '2025-12-31') as id")).rows[0].id;
      await asPlayer(3); await db.query('select public.claim_player()');
      const state = await snapshot();
      assert.equal(state.meId, imported);
      const me = state.players.find(p => p.id === imported);
      assert.equal(me.total, 10000); assert.equal(me.wins, 15);
      await db.query('select public.save_score($1, $2)', [200, state.day]);
      assert.equal((await snapshot()).players.find(p => p.id === imported).total, 10200);
      await asPlayer(1);
      await assert.rejects(db.query("select public.admin_save_score($1, '2025-12-20', 400)", [imported]), /opening totals/);
      await assert.rejects(db.query("select public.admin_save_player($1, 'Sam', 'another@example.com', 10000, 15, '2025-12-31')", [imported]), /linked email/);
    });
    await t.test('Admin historical corrections recalculate tied wins and removals without double counting', async () => {
      await asPlayer(1);
      await db.query("select public.admin_save_score($1, '2026-01-01', 700)", [id(1)]);
      await db.query("select public.admin_save_score($1, '2026-01-01', 700)", [id(2)]);
      let s = await snapshot();
      assert.equal(s.players.find(p => p.id === id(1)).wins, 2);
      assert.equal(s.players.find(p => p.id === id(2)).wins, 3);
      await db.query("select public.admin_save_score($1, '2026-01-01', 600)", [id(2)]);
      s = await snapshot(); assert.equal(s.players.find(p => p.id === id(2)).wins, 2);
      await db.query("select public.admin_save_score($1, '2026-01-01', null)", [id(1)]);
      s = await snapshot(); assert.equal(s.players.find(p => p.id === id(1)).wins, 1);
      assert.equal(s.players.find(p => p.id === id(2)).wins, 3);
      await assert.rejects(db.query("select public.admin_save_player($1, 'Alex', 'htsiotras@gmail.com', 1000, 4, $2)", [id(1), s.day]), /before today/);
      await assert.rejects(db.query("select public.admin_save_player($1, 'Jamie', 'jamie@example.com', 1000, 4, '2026-02-01')", [id(2)]), /overlap/);
      await db.exec('reset role'); const audit = (await db.query('select count(*) as n from public.admin_audit')).rows[0].n;
      assert.ok(Number(audit) >= 5);
    });
  } finally { await db.close(); }
});
