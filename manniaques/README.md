# Manniaques — first-release sales PWA

Offline-first wholesale garment sales orders for multi-factory use.

## Stack

- Web: React + TypeScript + Vite + Dexie + PWA
- API: Express + PostgreSQL

## Run locally

```bash
# Set DATABASE_URL (and optionally JWT_SECRET)
export DATABASE_URL=postgresql://manniaques:manniaques@127.0.0.1:5432/manniaques

cd manniaques
npm install
npm run migrate   # or: npm run db:migrate
npm run seed      # optional; start also seeds when empty
npm run build
npm start         # http://127.0.0.1:8787 (API + built web)
# or: npm run dev → web :5173, API :8787
```

- Combined (built): http://127.0.0.1:8787
- Dev web: http://127.0.0.1:5173
- Dev API: http://127.0.0.1:8787

## Demo logins

| Mobile     | PIN  | Role          | Factory        |
|------------|------|---------------|----------------|
| 9000000001 | 1234 | Sales         | Manniaques     |
| 9000000002 | 1234 | Factory Admin | Manniaques     |
| 9000000003 | 1234 | Sales         | Aurora Knits   |

Showroom: **Kothari Showroom** / 9811111111

Pack example: 2× MNQ-403 (5pc @ ₹2800) + 5× MNQ-402 (4pc @ ₹3200) → 7 sets, 30 pieces, ₹21,600.
