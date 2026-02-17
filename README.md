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

Rules:
- Backend code only in `server/`
- Frontend code only in `client/`
- No Next.js API routes

## Services

- `client` (Next.js): `http://localhost:3000`
- `server` (Express): `http://localhost:4000`
- `db` (PostgreSQL): `localhost:5432`

## Quick Start (Docker)

```powershell
docker compose up --build
```

Health checks:
- `http://localhost:4000/health`
- `http://localhost:4000/api/stats`

Stop/reset:

```powershell
docker compose down
docker compose down -v
```

## Local Dev (npm only)

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

## Main API

Auth:
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`

Public domain:
- `POST /api/domain/check`
- `POST /api/domain/report`
- `GET /api/domain/:domain/reputation`
- `POST /api/domain/:domain/verify-request`
- `POST /api/domain/:domain/verify-check`
- `POST /api/domain/:domain/dispute`
- `GET /api/domain/:domain/badge.svg`

Stats:
- `GET /api/stats`
- `GET /api/stats/tld`
- `GET /api/stats/transparency`

User:
- `GET /api/me`
- `GET /api/usage`
- `GET /api/tickets`
- `POST /api/tickets`
- `POST /api/tickets/:id/messages`

Admin:
- `GET /api/admin/*` + `PATCH/POST/DELETE /api/admin/*` for users, keys, logs, abuse, reports, feedback, tickets, disputes, intel, incidents, exports.

## Notes

- RBAC roles: `USER`, `MODERATOR`, `ADMIN`, `SUPERADMIN`
- API keys are stored hashed; only masked values are returned after creation.
- Admin/mod mutations write `AdminAuditLog`.
