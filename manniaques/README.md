# Manniaques — first-release sales PWA

Offline-first wholesale garment sales orders for multi-factory use.

## Stack

- Web: React + TypeScript + Vite + Dexie + PWA
- API: Express + PostgreSQL

## Run locally

```bash
export DATABASE_URL=postgresql://manniaques:manniaques@127.0.0.1:5432/manniaques
export JWT_SECRET="$(openssl rand -hex 32)"   # required for stable local sessions

cd manniaques
npm install
npm run migrate
SEED_DEMO=1 npm run seed   # prints one-time demo PINs to the console; local only
npm run build
npm start                  # http://127.0.0.1:8787 (API + built web)
# or: npm run dev → web :5173, API :8787
```

Hosted/production never auto-seeds. Set `SEED_DEMO=1` only on a local machine when you want sample factories and users; PINs are random and printed once to stdout.

- Combined (built): http://127.0.0.1:8787
- Dev web: http://127.0.0.1:5173
- Dev API: http://127.0.0.1:8787

Showroom sample (after seed): **Kothari Showroom** / 9811111111

Pack example: 2× MNQ-403 (5pc @ ₹2800) + 5× MNQ-402 (4pc @ ₹3200) → 7 sets, 30 pieces, ₹21,600.
