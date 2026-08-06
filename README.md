# AUTIC by NeuroLumina

A real Next.js App Router application with Supabase Auth and PostgreSQL.

## What is implemented

- Public Next.js landing page
- Unified phone-number login
- Supabase SMS OTP support
- Demo OTP fallback (`1234`)
- Parent Portal with dashboard, child profile, mood check-in, history, insights, reports, Calm Space, resources, appointments, marketplace, notifications and settings
- Child Workspace
- Therapist Workspace
- Teacher Workspace
- School Admin Workspace
- Platform Admin Workspace
- Supabase database health endpoint and setup screen
- PostgreSQL schema with Row Level Security
- Profiles, schools, children, assignments, moods, calm sessions, appointments, session notes, observations, resources, notifications, marketplace products and audit logs

## Demo phone numbers

- `9999990001` Parent
- `9999990002` Child
- `9999990003` Therapist
- `9999990004` Teacher
- `9999990005` School Admin
- `9999990006` Platform Admin
- Demo OTP: `1234`

## Supabase setup

1. Open the Supabase project.
2. Go to **SQL Editor**.
3. Copy and run `supabase/migrations/001_initial_schema.sql`.
4. In Vercel, confirm these environment variables exist:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or update the clients to use your anon key)
5. Redeploy the Vercel project.
6. Open `/setup` to verify that the keys and schema are ready.

## Local development

```bash
npm install
cp .env.example .env.local
npm run dev
```

Use Node.js 20 or newer.

## Important

This repository is a functional school-demo foundation. Do not enter real child, clinical, payment or confidential school data until the security, consent, legal and operational controls have been independently reviewed for production use.
