# AUTIC by NeuroLumina

A real Next.js App Router application with Supabase Auth and PostgreSQL.

## Local setup

1. Install Node.js 20.9 or newer.
2. Run `npm install`.
3. Copy `.env.example` to `.env.local`.
4. Add your Supabase project URL and publishable key.
5. In Supabase SQL Editor, run `supabase/schema.sql`.
6. Enable Phone authentication in Supabase Auth and configure an SMS provider.
7. Run `npm run dev`.

## Vercel setup

Add these environment variables to the Vercel project:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Redeploy after adding them.

## Current implemented scope

- NeuroLumina landing page
- Phone OTP login with demo fallback OTP `1234`
- Functional Parent Portal
- Child profile
- Mood check-in and mood history
- Pattern insights
- Weekly report and print/PDF
- Calm Space starter flow
- Resources
- Appointments
- Marketplace demo
- Notifications
- Accessibility settings
- Supabase PostgreSQL schema
- Row Level Security policies
- Auth profile trigger

The remaining child, therapist, teacher, school-admin and platform-admin workspaces should be added as separate Next.js routes in the same project.
