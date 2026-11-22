# CareFlow — Hospital Management System

A full-stack hospital management system with role-based portals for patients, doctors, and admins — appointment booking with conflict-free slot locking, prescriptions, ratings, an AI booking assistant, and a production-grade backend (httpOnly-cookie auth, centralized error handling, Redis caching, automated testing, Docker, CI, and a live cloud deployment).

## 🔗 Live Demo

| | |
|---|---|
| **Frontend** | https://hms-seven-khaki.vercel.app |
| **Backend health check** | https://hms-backend-agy5.onrender.com/api/health |

> The backend is on Render's free tier, which spins down after ~15 minutes of inactivity — the first request after a quiet period can take 30–60 seconds to wake up. That's expected, not a bug.

### Demo credentials
Password for every seeded account below is **`password`**.

| Role | Email |
|---|---|
| Admin | `admin@hms.com` |
| Doctor (Cardiology) | `sarah@hms.com` |
| Doctor (Neurology) | `michael@hms.com` |
| Doctor (Dermatology) | `emily@hms.com` |
| Doctor (Orthopedics) | `james@hms.com` |
| Doctor (General Medicine) | `robert@hms.com` |
| Patient | Register a new account from the Patient portal — self-registration is open. |

---

## Table of Contents
- [Features](#features)
- [Hospital Modules](#hospital-modules)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Auth & Security Model](#auth--security-model)
- [Project Structure](#project-structure)
- [Local Development](#local-development)
- [Environment Variables](#environment-variables)
- [Testing](#testing)
- [Docker](#docker--docker-compose)
- [CI/CD](#cicd)
- [Deployment — What's Live and How It's Wired Together](#deployment--whats-live-and-how-its-wired-together)
- [Known Limitations](#known-limitations)

---

## Features

**Patient**
- Register/login, browse doctors by specialization, book appointments against live slot availability
- View appointment history, download prescriptions, rate completed appointments
- AI chatbot (Gemini) that recommends a specialization from symptoms and can book directly through chat

**Doctor**
- Dashboard with today's/tomorrow's schedule and stats
- View and filter appointments, mark completed/cancelled
- Upload prescriptions (notes + PDF/image) against a completed appointment

**Admin**
- Manage patients and doctors (create doctor accounts with profile photos, edit, delete)
- Manage appointments across the whole system
- Manage doctor slot availability (block/unblock days, regenerate slots)

**Core scheduling logic**
- 15-minute slots, auto-generated on a rolling 14-day window, cleaned up daily via cron
- Row-level locking (`SELECT ... FOR UPDATE`) prevents two patients double-booking the same slot under concurrent load
- Doctor availability lookups are cached in Redis (cache-aside, invalidated immediately on any booking/cancellation/admin slot change)

## Hospital Modules

Seven operational modules sit on top of the scheduling core. Staff pages are shared between the doctor and admin portals (`/doctor/...` and `/admin/...`); admin-only actions are hidden for doctors.

| Module | What it does | Main routes (UI → API) |
|---|---|---|
| Notifications | In-app bell with unread count, polled every 30 s; sent on bookings, payments, emergencies, blood requests | header bell → `/api/notifications` |
| Payments | Razorpay Orders + checkout signature check; mock mode in development/test; webhook dedupe | `/patient/payments`, `/patient/history`, `/admin/payments` → `/api/payments` |
| Teleconsultation | Jitsi Meet room per video appointment, joinable only when paid and inside the join window | `/consult/:appointmentId` → `/api/teleconsult` |
| Bed management | Wards, beds, allocation and discharge with row locks | `/admin/beds`, `/doctor/beds` → `/api/beds` |
| Blood bank | Donors, donations, FEFO stock, compatibility-checked requests | `/admin/blood`, `/doctor/blood` → `/api/blood` |
| Emergency | ESI v4 triage board ordered by acuity then arrival, admit to a bed | `/admin/emergency`, `/doctor/emergency` → `/api/emergency` |
| Navigation | Public hospital map, Dijkstra routing with an accessible (no-stairs) mode | `/navigate` → `/api/navigation` |

## Tech Stack

**Frontend** — React 19, TypeScript, Vite, Tailwind CSS, React Router, Axios

**Backend** — Node.js, Express 5, MySQL (`mysql2`), Redis (`ioredis`), JWT (httpOnly cookies), Zod (validation), bcryptjs, Multer (uploads), Google Gemini API (chatbot)

**Testing** — Jest, Supertest (unit tests mock the DB/cache; integration tests run against a real MySQL + Redis)

**Infra** — Docker, docker-compose (local), GitHub Actions (CI), ESLint (both apps)

**Deployed on** — Vercel (frontend), Render (backend + Redis), Aiven (MySQL)

## Architecture

```
Browser
  │
  │  https://hms-seven-khaki.vercel.app
  ▼
┌─────────────────────────┐
│  Vercel (static + edge) │  serves the built React app
│                         │  rewrites /api/* ──────────────┐
└─────────────────────────┘                                  │  server-side proxy
                                                               ▼
                                              ┌───────────────────────────────┐
                                              │  Render (Docker web service)  │
                                              │  Express API                  │
                                              └───────┬───────────────┬───────┘
                                                       │               │
                                            TLS, CA-verified      internal network
                                                       ▼               ▼
                                          ┌────────────────┐   ┌──────────────┐
                                          │  Aiven (MySQL)  │   │ Render Redis │
                                          └────────────────┘   └──────────────┘
```

**Why the browser never talks to Render directly:** the frontend and backend are on different domains. Cookie-based auth across different domains makes every auth cookie a *third-party* cookie from the browser's perspective — Safari blocks these by default, and Chrome increasingly does too, regardless of correct `SameSite`/`Secure` attributes. Routing `/api` through a Vercel rewrite makes the backend appear same-origin to the browser, so the cookies are first-party and reliably stored. The Vercel → Render hop is a server-to-server proxy call, which isn't subject to browser cookie policy at all. This is the same reverse-proxy pattern the local Docker/nginx setup uses, and what the Vite dev server's proxy does for local development — three different mechanisms, same underlying trick.

See [`ARCHITECTURE_GUIDE.md`](./ARCHITECTURE_GUIDE.md) for the database schema and per-role data flow diagram.

## Auth & Security Model

- **httpOnly cookies, not localStorage** — the JWT is never reachable by page JS, closing off the classic XSS-token-theft vector.
- **Short-lived access token (15 min) + longer-lived refresh token (7 days)**, signed with separate secrets. The frontend silently refreshes the access token on a 401 before falling back to a login redirect.
- **CSRF double-submit cookie** — required because cross-site cookies (`SameSite=None`, used in the split-domain deployment) are attached by the browser to *any* request to that domain, not just ones from your own frontend. A readable `csrf_token` cookie is echoed back in a header on every mutating request; an attacker's page can trigger the request but can't read the cookie's value to forge the header.
- **Centralized error handling** — a typed `AppError` hierarchy (`ValidationError`, `AuthError`, `ForbiddenError`, `NotFoundError`, `ConflictError`) normalizes into one consistent JSON error shape, with Zod validation on every mutating route.
- **Rate limiting** on `/auth/login`, `/auth/register`, and the public chatbot endpoint.

## Project Structure

```
.
├── backend/
│   ├── app.js                 # Express app (routes, middleware) — no side effects, testable
│   ├── server.js               # entry point: starts app.js, cron jobs
│   ├── start.sh                 # Docker CMD: applies schema/migrations, then starts the server
│   ├── config/                  # MySQL pool, Redis client
│   ├── controllers/             # one per resource (auth, patient, doctor, admin, appointment, chatbot)
│   ├── routes/                  # Express routers, wire validation + auth middleware per endpoint
│   ├── middleware/               # auth, role guard, CSRF, rate limiting, validation, error handler
│   ├── validators/                # Zod schemas, one per resource
│   ├── utils/                     # errors, cookies, cache, date helpers, slot generation
│   ├── database/                  # schema.sql + migrations, and the scripts that apply them
│   └── tests/
│       ├── unit/                   # mocked DB/cache — no external services needed
│       ├── integration/            # real MySQL + Redis, via Supertest against app.js
│       └── setup/
├── frontend/
│   └── src/
│       ├── pages/                  # patient/, doctor/, admin/, auth/
│       ├── components/              # Layout (role-based nav), Chatbot
│       ├── context/                  # AuthContext + useAuth hook
│       ├── services/                  # axios instance + one service module per resource
│       └── config.ts                   # same-origin vs cross-origin URL resolution
├── docker-compose.yml            # frontend + backend + MySQL + Redis, for local dev
├── render.yaml                   # Render Blueprint (backend + Redis)
└── .github/workflows/
    ├── ci.yml                     # lint + unit + integration tests + docker build, on every push/PR
    └── keep-alive.yml             # pings the DB-aware health check every 12h (see Deployment)
```

## Local Development

**Prerequisites:** Node 20+, a local MySQL instance (XAMPP/MAMP/Homebrew), Redis (optional — the app degrades gracefully without it, just always cache-misses).

```bash
# Backend
cd backend
npm install
cp .env.example .env        # fill in JWT_SECRET, JWT_REFRESH_SECRET, GEMINI_API_KEY
npm run db:migrate          # creates the schema on your local MySQL instance
npm run db:seed-demo        # optional: fills it with demo patients, appointments, beds, blood stock (runs once)
npm run dev                 # http://localhost:5001 (PORT in .env; the Vite proxy expects 5001)

# Frontend (separate terminal)
cd frontend
npm install
npm run dev                 # http://localhost:5173, proxies /api to the backend
```

Seed sample doctors/slots: `node backend/seedData.js` (schema.sql already includes a handful of doctors; this adds more).

## Environment Variables

**`backend/.env`** (see `backend/.env.example` for the full annotated list) — highlights:

| Variable | Purpose |
|---|---|
| `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` | MySQL connection |
| `DB_SSL` / `DB_CA_CERT` | Set `DB_SSL=true` + paste the host's CA cert for a managed MySQL provider (local dev leaves these unset) |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | Separate signing secrets for access vs. refresh tokens |
| `ACCESS_TOKEN_TTL_MIN` / `REFRESH_TOKEN_TTL_DAYS` | Token lifetimes |
| `CORS_ORIGIN` | The frontend's origin (only matters for direct cross-origin calls, not the Vercel-proxied path) |
| `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` | Redis connection (optional locally) |
| `GEMINI_API_KEY` | Google Gemini API key for the chatbot |
| `NODE_ENV` | `production` flips cookies to `Secure; SameSite=None` for cross-site deployment |
| `TZ` | Must be `Asia/Kolkata`. Slot `date` + `time` columns are IST wall-clock values and are parsed in the Node process timezone, so a UTC host (Render's default) would shift the teleconsult join window and the "slot has passed" check by 5.5 h. Set in `render.yaml`, `docker-compose.yml` and `backend/Dockerfile` (which installs `tzdata`) |
| (DB session zone) | Not an env var: `config/db.js` runs `SET time_zone = '+05:30'` on every pool connection (and `applySchema` does the same), because mysql2 reads `DATETIME`/`TIMESTAMP` values as Node local time. Without it a UTC MySQL server (Aiven, the compose `mysql:8.0`) would return every `NOW()`/`CURRENT_TIMESTAMP` value 5.5 h early. Change both together with `TZ` |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | Razorpay API key pair. With both empty, payments run in mock mode only under `NODE_ENV=development`/`test` or `PAYMENT_MODE=mock`. Otherwise online payment is off: `/api/payments/orders` returns 503 and **video appointments are rejected at booking (400)**, since a video room can only be joined once paid |
| `RAZORPAY_WEBHOOK_SECRET` | The secret configured on the Razorpay webhook (not the key secret), used to verify `/api/payments/webhook` |
| `JITSI_DOMAIN` | Jitsi server for video rooms (default `meet.jit.si`). meet.jit.si restricts IFrame embedding for third-party sites, so production should use JaaS (`8x8.vc`) or a self-hosted Jitsi domain |

**`frontend/.env.example`** — one variable, `VITE_BACKEND_URL`, left **unset** in every environment that can proxy `/api` itself (local dev, docker-compose, Vercel). Only needed if deploying the frontend somewhere without a same-origin proxy option — see the [Architecture](#architecture) note on why that's a fallback, not the preferred path.

## Testing

Prerequisites: Node 20+, and for integration and E2E tests a local MySQL whose credentials are in `backend/.env.test` (the test DB name must contain `test`; it is dropped and recreated). Redis is optional: the app fails open without it (only the Redis cache test needs it).

```bash
cd backend
npm test                 # unit tests only — mocked DB/cache, no external services needed
npm run test:integration # real MySQL required; provisions a throwaway hms_db_test schema
npm run test:coverage    # coverage report for the unit suite

cd frontend
npm test                 # vitest component tests (jsdom)
npm run test:e2e         # Playwright end-to-end tests in a real browser
```

Unit tests cover: JWT auth middleware (valid/expired/tampered/wrong-type tokens), the booking conflict-resolution logic (double-booking rejection, back-to-back slots, past-slot rejection) via a mocked DB connection, error-handler response shaping, and SQL-migration parsing. Integration tests exercise the real HTTP layer end-to-end via Supertest, including an actual double-booking race against real row locking and the Redis cache-aside/invalidation sequence.

**End-to-end (Playwright).** `frontend/e2e/` has seven specs, one per flow: booking + notification bell, mock payment, teleconsult join (the Jitsi script is stubbed), bed allocate/discharge, blood bank donation → request → fulfil, emergency triage → alert → admit, and accessible navigation. Each spec logs in through the real login form.

- Uses the system Google Chrome (`channel: 'chrome'`), so no `npx playwright install` is needed.
- Starts the backend (`npm run start:e2e`, port 5001, `NODE_ENV=test` so payments run in mock mode) and Vite (port 5173) itself, or reuses them if already running.
- Global setup resets `hms_db_test` and seeds an admin, a doctor, two patients, appointments and a ward; the generated logins go to `frontend/e2e/.auth-fixtures.json` (git-ignored).
- dotenv never overrides variables already set, so if your local MySQL password differs from `backend/.env.test`, pass it in: `DB_PASSWORD=<yours> npm run test:e2e`.
- Reports: `npx playwright show-report` (traces are kept for failed tests).

## Docker / docker-compose

```bash
cp backend/.env.example backend/.env   # fill in secrets
docker-compose up --build
```

Spins up MySQL, Redis, the backend (Docker), and the frontend (built + served via nginx, which also reverse-proxies `/api` to the backend container — the same same-origin trick as the Vercel deployment). Frontend: `http://localhost:8080`. The backend container applies `schema.sql` + migrations automatically on every start (`backend/start.sh`), so a fresh `docker-compose up` needs no manual schema import.

## CI/CD

`.github/workflows/ci.yml` runs on every push and PR into `main`:
- **backend job** — lint, unit tests, and the full integration suite against real MySQL + Redis service containers (not mocks)
- **frontend job** — lint + production build (`tsc -b && vite build`)
- **docker-build job** — builds both Docker images, gated behind the two jobs above actually passing

`.github/workflows/keep-alive.yml` — see below.

## Deployment — What's Live and How It's Wired Together

Three separate providers, chosen because none of them offer a free tier covering the whole stack (see the `render.yaml` and `.env.example` comments for the reasoning behind each choice):

### 1. MySQL — [Aiven](https://aiven.io)
Free tier, real MySQL (not a Vitess-style rewrite, so foreign keys/cascades work normally — this ruled out PlanetScale's free tier, which doesn't support them by default). The schema is applied automatically: the Render backend runs `database/migrate.js` (idempotent — creates the DB if missing, applies `schema.sql` + all migrations, safe to re-run on every boot) before starting the server, via `backend/start.sh`. Connection uses TLS with the host's CA certificate verified (`DB_SSL=true` + `DB_CA_CERT`), not just opportunistic encryption.

Aiven's free tier auto-powers-off after ~24h with no *database query* activity (not just HTTP traffic) — that's why `/api/health` runs a real `SELECT 1` instead of returning a static response, and why the keep-alive workflow below targets it specifically.

### 2. Backend + Redis — [Render](https://render.com)
- **Backend**: a Docker web service built from `backend/Dockerfile`, deployed via the `render.yaml` Blueprint. Connects to Aiven (TLS) and to Render's own managed Redis over its internal network.
- **Redis**: Render's managed Redis add-on, same account/region as the backend for low latency.
- Both auto-deploy on every push to `main`.
- Render's free web services have no persistent disk and no Shell access — see [Known Limitations](#known-limitations).
- `render.yaml` sets `TZ=Asia/Kolkata` and prompts for `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` and `JITSI_DOMAIN` at import. Until the Razorpay keys are set, payments are disabled and video appointments cannot be booked (see [Environment Variables](#environment-variables)).

### 3. Frontend — [Vercel](https://vercel.com)
Static Vite build, deployed from the `frontend/` directory. `frontend/vercel.json` rewrites `/api/*` to the Render backend's URL server-side, which is what makes the auth cookies first-party (see the [Architecture](#architecture) section — this was the fix for a real bug where Chrome was silently discarding the backend's cookies as third-party). `VITE_BACKEND_URL` must stay **unset** in Vercel's project settings for this proxy to actually be used; setting it makes the frontend call Render directly, cross-origin, reintroducing the cookie problem.

### 4. Keeping Aiven awake — `.github/workflows/keep-alive.yml`
A scheduled GitHub Action pings `/api/health` (which runs a real DB query) every 12 hours — comfortably inside Aiven's ~24h inactivity window. Requires a repository variable `BACKEND_HEALTH_URL` set to the deployed backend's health endpoint. Caveat: GitHub disables scheduled workflows on a repo after 60 days with no commits pushed to it at all, so this isn't fully "set and forget" if the repo goes fully dormant.

### Connecting them: the order that actually matters
1. Aiven first (backend needs its credentials at boot to migrate the schema)
2. Render second (needs Aiven's credentials as env vars; produces the backend URL the frontend needs)
3. Vercel third (needs the Render URL to configure `vercel.json`'s rewrite destination)
4. Back to Render to set `CORS_ORIGIN` to the Vercel URL (only matters for direct, non-proxied API calls, but costs nothing to set correctly)
5. GitHub repo variable for the keep-alive workflow, pointed at the Render health URL

## Known Limitations

- **Uploaded files are stored in MySQL** — prescription files and doctor photos go into the `prescription_files` and `doctor_images` tables (5 MB and 2 MB limits), because Render's free tier has no persistent disk. Prescription files are served only to their patient and doctor via `/api/files/prescriptions/:id`.
- **Cold starts** — Render's free web services spin down after ~15 minutes idle; the first request after that takes 30–60s.
- **Aiven free tier storage** — 1GB, more than enough for this schema's realistic data volume, but not built for production load.
- **No structured metrics/monitoring yet** — logging is currently `morgan` request logs + a DB-aware health check, not a full Prometheus/Grafana setup.
