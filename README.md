# Injury Recovery — Real Beta

A mobile-first, evidence-informed injury recovery platform for friends/family testing.

## Upload to GitHub

Upload these items directly to the repository root:

```text
app/
data/
lib/
next.config.mjs
package.json
README.md
supabase.sql
```

Do not upload the outer folder itself.

## Deploy on Vercel

1. Import the GitHub repo into Vercel.
2. Framework preset: Next.js.
3. Build command: `npm run build`.
4. Output directory: leave empty.
5. Add the Supabase environment variables below.
6. Deploy.

## Supabase setup for accounts and saved progress

Create a free Supabase project, then copy your project URL and anon public key.

In Vercel, add:

```text
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_public_key
```

In Supabase, open SQL Editor and run the full contents of `supabase.sql`.

For friends/family testing, the easiest setup is:

1. Supabase → Authentication → Providers → Email.
2. Enable Email provider.
3. For quick testing, turn off email confirmation if you do not want testers to confirm through email.
4. Save settings.

If email confirmation stays on, new testers may need to confirm their email before they can sign in.

## What changed in this version

- Supabase schema included as a standalone SQL file.
- Assessment wording changed to:
  - What sports do you play?
  - What does your sport demand?
  - What equipment do you have access to?
- Muscle-component selector added after choosing the main injury area.
- Pictogram improved and zooms into the selected body region.
- Rehab plans are more progressive and varied day by day.
- Main rehab exercises are capped at 12 per session, excluding mobility.
- Mobility/warm-up is displayed separately.
- Rest days can be active recovery or full rest.
- UI polished toward glass, white, charcoal, and smooth minimal gradients.

## Important safety note

This beta is not a medical device and does not replace medical diagnosis. It uses conservative, evidence-informed rules and intentionally refers users out when red-flag signs appear.
