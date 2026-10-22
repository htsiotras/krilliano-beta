# Live deployment

Website: https://krillion-club.vercel.app
Vercel project: krillion1/krillion-club
Supabase project: bbsfrrcgwbtxrrryeage

The production page was verified with an unauthenticated HTTP 200 and browser inspection. Connection environment variables were saved for production, preview, and development. The owner verified Google sign-in and admin locally.

## Remaining sign-in configuration

In Supabase Authentication → URL Configuration set Site URL to https://krillion-club.vercel.app and add https://krillion-club.vercel.app/ to Redirect URLs. In Google Auth Platform → Clients, add https://krillion-club.vercel.app to Authorized JavaScript origins. Preserve the Supabase OAuth callback URI. Verify Google sign-in and admin access on the production URL.

Use the existing linked Vercel project for updates. Do not rerun the database setup script; it was successfully applied to the live database.
