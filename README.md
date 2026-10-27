# Krilliano Beta

A responsive friends’ leaderboard with Google sign-in, unique player names, daily score corrections, Eastern-midnight rollovers, tied wins, total points, average points per game, history, and an admin area.

## Current status

The app is deployed at https://krillion-club.vercel.app. Supabase is connected; the owner confirmed Google sign-in and admin access work locally. Production sign-in still needs the production URL added to Supabase URL Configuration and Google authorized origins. The interactive preview uses clearly labeled sample data.

## Run locally

Use Node 22.13+ and install with `pnpm install` (the exact versions are in `pnpm-lock.yaml`). Then run `pnpm dev`. Open the printed local URL. Add `?demo=1` to explore sample scores and admin controls without a backend. Demo changes only live in memory and never write to Supabase.

To connect the real database, copy `.env.example` to `.env.local` and fill in the Supabase project URL and **publishable** key. Never put a service-role key, database password, or Google client secret in a `VITE_` variable. Restart the development server after editing environment settings.

## Verify

- `pnpm test` runs 18 tests, including actual PostgreSQL functions in a local PGlite database, account authorization, admin restrictions, historical imports, tie recalculation, score corrections, and DST boundaries.
- `pnpm build` creates the production files in `dist/`.
- Browser checks covered submission, corrections, tied rankings, history disclosure, admin score corrections, historical date selection, adding a player with opening totals, and a 390px phone layout.
- End-to-end Google authentication and production persistence still need verification after the owner connects the accounts.

## Architecture

Vite + React frontend, Supabase Auth (Google OAuth), PostgreSQL RPC functions, Vercel hosting. Sessions persist on each device using Supabase’s session management. User IDs identify authenticated accounts; a separate stable player ID preserves imported history. Verified matching emails claim pre-created players.

The database supplies the date and next reset in `America/New_York`. Daily scores are unique by player and date. Ordinary players can only submit or correct their own score for the current Eastern day. The caller sends the day shown on screen; the server rejects a stale day after midnight. Wins are derived from the highest scores on closed days, so there is no destructive reset or scheduled job to miss. Total points include today. Tied highest scores each receive one win.

Tables have row-level security enabled and no direct client access. Narrow RPC functions enforce all writes. Email addresses only appear in the admin roster. The approved admin email is configured in `supabase/setup.sql`; the database checks the authenticated user’s verified email, never a browser-supplied admin flag. Admin edits are recorded in `admin_audit`.

## Admin and historical records

After signing in and choosing a player name, the owner sees an **Admin** tab.

- **Daily scores:** select any past or current date, enter or correct each player’s score, and save. Removing an erroneous entry requires a second click. Wins and totals recalculate automatically.
- **Players & opening totals:** add a player before their first visit. Supply their Google email to link their existing history automatically when they sign in. Emails can be added later; signed-in players’ linked emails cannot be reassigned here.
- **Opening totals:** enter known cumulative points and wins and the last date those totals include. Use daily entries only after that date. The database rejects overlap so results are not counted twice.
- If you have daily records for all past dates, leave opening totals at zero and the cutoff empty. Import each day instead.
- Opening wins are taken as supplied; check the old leaderboard before importing. Opening totals cannot reconstruct missing daily history.

The site is currently one club. Any Google account that can reach the deployed site can sign in and create a player; only the approved admin can edit other players or historical days. Add an invitation policy before wider distribution if membership should be restricted.

## Launch

Follow `SETUP.md` for a new installation. The live Supabase database has already been initialized; do not rerun `supabase/setup.sql` against it.

## Collaborating on GitHub

Repository: https://github.com/htsiotras/krilliano-beta (private).

The owner can invite contributors through Settings → Collaborators. Clone the repository, create a branch for your change, use `pnpm dev` to preview it, and open a pull request into `main`. Run `pnpm test` for scoring or database changes and `pnpm build` before requesting review.

The existing Vercel project `krillion1/krillion-club` is connected to this repository with `main` as its production branch. Production updates keep the same URL: https://krillion-club.vercel.app. Supabase environment settings are configured on Vercel and are not committed to this repository.

Vercel’s Hobby plan restricts automatic deployments from private repositories to commits authored by the account owner. Friends can contribute through branches and pull requests; the owner should review and publish their changes. See https://vercel.com/docs/deployments/troubleshoot-project-collaboration for the current deployment rules. A repository edit alone does not grant database admin access.

## Average points per game

The Average points per game leaderboard appears in both Today’s Bigger Picture and the All-time view. It divides each player’s total recorded daily points by their number of submitted games, including historical daily entries and today. Missed days do not count; submitted zero scores do. Corrections replace points without adding a game. Averages display one decimal place and are ranked using their full values. Players appear after their first game. Starting balances without known game counts are excluded rather than assigned a guessed number of games.
