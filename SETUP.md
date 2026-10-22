# Launching Krillion Club

The website is built. The remaining steps connect it to accounts you own so scores can be shared and friends can sign in with Google.

## 1. Create your accounts

Start with [Supabase sign-up](https://supabase.com/dashboard/sign-up). Create an account using email/password or a supported existing account, and complete any verification email. Start on the Free plan.

Then create a personal account at [Vercel sign-up](https://vercel.com/signup). Choose Hobby/personal use for this friends’ project. A paid plan or custom domain is not required for the initial setup. Review any limits shown during account creation.

Create passwords and accept account terms yourself. Do not send passwords into the chat.

## 2. Create the shared database

In Supabase, create a project named **Krillion Club** in your personal organization. Choose a nearby US region and set a strong database password yourself. Wait for the project to finish provisioning.

Open the project’s **SQL Editor**, create a new query, paste the entire `supabase/setup.sql` file, and run it once. This creates the score tables and protected operations. It also assigns administrative access to the owner’s verified Google email supplied during this conversation.

Use the project’s **Connect** dialog or API settings to find:

- The project URL, such as `https://your-project.supabase.co`.
- The publishable key (or legacy anon key), intended for client-side applications.

These are the two frontend configuration values. The secret/service-role key and database password are not needed by the website.

## 3. Enable Google sign-in

Follow [Supabase’s Google sign-in guide](https://supabase.com/docs/guides/auth/social-login/auth-google), using a Google Cloud project you own.

In Supabase Authentication settings, open the **Google** provider. Copy the callback URL shown there. In Google Cloud’s Google Auth Platform, configure the app’s branding, audience, and contact details. Create an OAuth client for a **Web application**. Add Supabase’s callback URL as an authorized redirect URI. Use only the standard `openid`, `email`, and `profile` scopes needed for sign-in.

Paste the Google client ID and client secret directly into the Supabase Google provider form and enable it. Keep the Google secret in Supabase; never put it in frontend files or Vercel `VITE_` variables. If Google’s app is in Testing mode, add the intended testers; review Google’s production requirements before sharing more broadly.

Disable unused login providers/methods if this project is dedicated to Google-only sign-in.

## 4. Deploy to Vercel

This project includes `vercel.json`, with the Vite build and output directory configured. The source can be deployed using the official Vercel CLI, or imported from a Git repository owned by you. The assistant can help perform this once your Vercel account is available.

Set these production environment variables:

```text
VITE_SUPABASE_URL=<your Supabase project URL>
VITE_SUPABASE_PUBLISHABLE_KEY=<your publishable or anon key>
```

Use the production URL Vercel provides. Environment variables are built into the frontend; redeploy after changing them.

## 5. Set the final sign-in destination

In Supabase Authentication → URL Configuration:

- Set **Site URL** to the final Vercel origin.
- Add the exact production URL with a trailing slash to the allowed redirect URLs.
- For local testing, add `http://127.0.0.1:5173/` separately.

Complete any required Google authorized-origin configuration with that final origin. The OAuth callback remains the Supabase callback URL.

## 6. Verify the live site together

1. Sign in with the designated admin Google account and choose a unique display name.
2. Confirm the Admin tab appears.
3. Add existing players and their Google emails; import historical data as described below.
4. Have a second player sign in on another device. Confirm their imported record is linked, and that they cannot see or use Admin.
5. Submit and correct a score, and confirm both devices show the updated total.
6. Check a historical tie and verify each tied leader receives a win.

## Import your old leaderboard without duplicates

If your old leaderboard gives totals through a particular date, enter those as **opening totals** and choose that cutoff date. Enter individual daily results only after the cutoff. For example, if totals include all games through October 15, add individual days starting October 16.

If you have every individual day, leave opening totals empty and enter each day under Admin → Daily scores. The app computes wins and total points itself.

The database blocks overlapping opening totals and daily scores. Importing a historical player without their email is supported, but add their Google email before they join to connect their history automatically.

The current site allows a Google user with the site URL to join the club. An invitation-only membership policy can be added if desired; ordinary players never gain admin permissions.

Reference: [Vercel’s Vite guide](https://vercel.com/docs/frameworks/frontend/vite).
