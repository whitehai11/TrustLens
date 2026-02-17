# TrustLensProject

![Node](https://img.shields.io/badge/node-20.x-339933?logo=node.js&logoColor=white)
![Next.js](https://img.shields.io/badge/next.js-15-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/typescript-5-3178C6?logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/postgresql-16-4169E1?logo=postgresql&logoColor=white)
![Docker](https://img.shields.io/badge/docker-compose-2496ED?logo=docker&logoColor=white)
![Status](https://img.shields.io/badge/status-active-success)

## Layout

```text
TrustLensProject/
  server/
  client/
  extension/
  scripts/
  README.md
```

- Backend is in `server/` only.
- Frontend is in `client/` only.
- No Next.js API routes are used.

## Server (port 4000)

Tech: Node, Express, TypeScript, Prisma, PostgreSQL, JWT, Helmet, rate limiting, Zod, CORS.

### Core endpoints

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `POST /api/domain/check` (public, optional `x-api-key`)
- `GET /api/domain/:domain/reputation` (public)
- `POST /api/domain/:domain/dispute` (auth, verified owner only)
- `POST /api/domain/:domain/verify-request` (auth)
- `POST /api/domain/:domain/verify-check` (auth)
- `GET /api/domain/:domain/badge.svg` (public, only eligible verified domains)
- `POST /api/domain/report` (public or authenticated)
- `POST /api/tickets`
- `GET /api/tickets`
- `POST /api/tickets/:id/messages`
- `GET /api/stats`
- `GET /api/stats/tld` (public, optional `?days=1|7|30|90`)
- `GET /api/stats/transparency` (public)
- `GET /api/me`
- `GET /api/usage`

### Admin & Moderator endpoints

- `GET /api/admin/overview`
- `GET /api/admin/users`
- `PATCH /api/admin/users/:id/role`
- `PATCH /api/admin/users/:id/status`
- `PATCH /api/admin/users/:id/tier`
- `PATCH /api/admin/users/:id/limit`
- `GET /api/admin/keys`
- `POST /api/admin/keys`
- `PATCH /api/admin/keys/:id/status`
- `PATCH /api/admin/keys/:id/tier`
- `PATCH /api/admin/keys/:id/limit`
- `POST /api/admin/keys/:id/regenerate`
- `GET /api/admin/logs`
- `GET /api/admin/keys/:id/logs`
- `GET /api/admin/abuse`
- `POST /api/admin/abuse/:id/resolve`
- `GET /api/admin/ip-rules`
- `POST /api/admin/ip-rules`
- `PATCH /api/admin/ip-rules/:id`
- `DELETE /api/admin/ip-rules/:id`
- `GET /api/admin/reports`
- `POST /api/admin/reports/:id/approve`
- `POST /api/admin/reports/:id/reject`
- `POST /api/admin/reports/:id/needs-info`
- `GET /api/admin/feedback`
- `POST /api/admin/feedback/:id/approve`
- `POST /api/admin/feedback/:id/reject`
- `GET /api/admin/domain/:domain/reputation/recompute`
- `GET /api/admin/domain-verifications`
- `POST /api/admin/domain-verifications/:id/approve`
- `PATCH /api/admin/domain-verifications/:id/revoke`
- `GET /api/admin/disputes`
- `PATCH /api/admin/disputes/:id`
- `POST /api/admin/tld/recalculate`
- `GET /api/admin/tickets`
- `POST /api/admin/tickets/:id/messages`
- `PATCH /api/admin/tickets/:id/status`
- `PATCH /api/admin/tickets/:id/assign`
- `PATCH /api/admin/tickets/:id/priority`

All admin/moderator mutation endpoints write `AdminAuditLog` records.

### Enterprise intelligence endpoints (ADMIN only)

- `GET /api/admin/domain/:domain/history`
- `GET /api/admin/ip/:ip/history`
- `GET /api/admin/intel/domain/:domain`
- `GET /api/admin/intel/ip/:ip`
- `GET /api/admin/incidents`
- `POST /api/admin/incidents`
- `POST /api/admin/incidents/:id/links`
- `POST /api/admin/incidents/:id/notes`
- `PATCH /api/admin/incidents/:id/status`
- `GET /api/admin/export/domain/:domain?format=json|csv`
- `GET /api/admin/export/ip/:ip?format=json|csv`
- `GET /api/admin/export/key/:keyId?format=json|csv`

`GET /api/stats` returns real DB counts:
- `reports_24h`
- `reports_7d`
- `reports_30d`
- `reports_1y`
- `total_domains_checked`

`POST /api/domain/check` returns:
- `riskLevel`, `score`
- `confidenceIndex`, `confidenceLabel`
- `riskFactors`, `abuseSignals`
- `historicalTrend`, `explanation`, `timestamp`

### API key plans

- `FREE`
- `RESEARCH`
- `BUSINESS` (hidden tier, admin-manageable)

## Client (port 3000)

Next.js + TypeScript + Tailwind UI.

- Hero with requested headline/subtext.
- Live animated stats from `http://localhost:4000/api/stats`.
- Education section with 15 long-form articles.
- Navbar: Education, API, Status + Login/user area.
- Dashboard: API usage graph + tickets.
- Admin page: user list, API key limits, report moderation, ticket management.

## Setup

### Option A: helper scripts

```bash
bash scripts/install.sh
bash scripts/dev.sh
```

### Option B: manual

```bash
cd server
npm install
npx prisma generate
npm run prisma:seed
npm run dev
```

```bash
cd client
npm install
npm run dev
```

## Docker (Windows)

From `C:\Users\maro\tlp\TrustLensProject`:

```powershell
docker compose up --build
```

Test:

- Frontend: `http://localhost:3000`
- Server health: `http://localhost:4000/health`
- Live stats: `http://localhost:4000/api/stats`

Useful commands:

```powershell
# stop containers
docker compose down

# stop and delete DB volume (full reset)
docker compose down -v

# view logs
docker compose logs -f
```

## Notes

- Default admin is created from `server/.env` (`ADMIN_EMAIL`, `ADMIN_PASSWORD`) during seed.
- Default moderator is created from `server/.env` (`MODERATOR_EMAIL`, `MODERATOR_PASSWORD`) during seed.
- Client fetches backend directly via `http://localhost:4000`.
- API keys are never returned in plaintext except at creation/regeneration.
