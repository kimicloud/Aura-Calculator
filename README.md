# Aura Calculator

1. Create a Supabase project. In the SQL editor, run `supabase/migrations/001_init.sql`.
2. Authentication → Users → Add user, four times. Use email `name@aura.local`, a password, tick auto-confirm, and set user metadata `{"username":"Name"}`. Friends sign in with just `name`.
3. Push this repo to GitHub and import it in Vercel.
4. Add the four variables from `.env.example` in Vercel (URL and anon key are in Supabase → Project Settings → API).
5. Deploy. The Monday reset runs from `vercel.json` at 00:00 UTC (edit the cron to shift it).

Self-changes are blocked in the UI, in `/api/aura`, and in the database (`no_self_aura` check plus `apply_aura`). Clients have no write access to any table.
