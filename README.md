# Minimal GTD Supabase App

A mobile-first GTD-style app for capturing, processing, and doing personal/work tasks.

## Features

- Floating quick capture button
- Inbox for unprocessed items
- Guided processing into 7 cases:
  - Trash
  - Reference
  - Someday
  - I Do It
  - Delegate
  - Schedule
  - Multi-Step / Project
- Work / Personal validation for I Do It, Delegate, and Project
- Today / Do list
- Waiting / Delegated list
- Projects list
- Reference list
- Someday list
- Supabase Auth
- Supabase Postgres with Row Level Security

## Tech stack

- React + Vite
- Supabase Auth + Postgres
- Static hosting compatible with GitHub Pages

## 1. Create Supabase project

1. Go to Supabase and create a new project.
2. Open the SQL Editor.
3. Copy everything from `supabase/schema.sql`.
4. Run it once.

This creates all tables, enums, indexes, triggers, and RLS policies.

## 2. Configure environment variables

Copy the sample env file:

```bash
cp .env.example .env.local
```

Fill in:

```bash
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-public-anon-key
```

You can find these in Supabase Project Settings → API.

## 3. Run locally

```bash
npm install
npm run dev
```

## 4. Build

```bash
npm run build
```

## 5. Deploy to GitHub Pages

For a GitHub Pages project URL like:

```text
https://your-username.github.io/your-repo-name/
```

Build with:

```bash
VITE_BASE_PATH=/your-repo-name/ npm run build
```

Then publish the `dist` folder using GitHub Pages or a GitHub Action.

For a root GitHub Pages site or custom domain, you can leave the base path as `/`.

## Security notes

Safe to expose in frontend:

- Supabase project URL
- Supabase anon/public key

Never expose in frontend or GitHub:

- Supabase service role key
- Database password
- Private API keys
- JWT secret
- Any admin secret

This app relies on Supabase Auth and Row Level Security. Every table has policies like:

```sql
auth.uid() = user_id
```

That means each signed-in user can only read, insert, update, or delete their own rows.

Do not disable RLS unless you fully understand the impact.

## Main files

```text
src/main.jsx                  Main React app, screens, process flow
src/lib/supabaseClient.js     Supabase client using public env variables
src/styles.css                Minimal mobile-first styling
supabase/schema.sql           Database schema and RLS policies
vite.config.js                GitHub Pages-compatible base path
```

## Data flow

1. New item is captured into `items` with:
   - `status = 'unprocessed'`
   - `case_type = null`

2. Processing updates the item with:
   - `status = 'processed'` or `archived`
   - `case_type`
   - `processed_at`
   - `area_type` when required

3. Extra data is inserted into the relevant destination table:
   - `actions`
   - `delegated_items`
   - `projects`
   - `reference_items`
   - `someday_items`

## Suggested next improvements

- Add project sub-actions table
- Add recurring reviews for Someday
- Add full calendar view
- Add offline capture queue
- Add search across all items
- Add PWA install support
