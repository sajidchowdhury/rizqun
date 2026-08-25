# Rizqun

Order management system for receiving customer calls, building orders on the fly, splitting them vendor-wise, and tracking them through delivery.

> **Stack:** Node.js + Express + PostgreSQL + Prisma + JWT
> **Status:** Phase 0 — Project setup

## Setup

### Prerequisites

- Node.js ≥ 20
- npm ≥ 10
- PostgreSQL ≥ 14

### Install

```bash
git clone https://github.com/sajidchowdhury/rizqun.git
cd rizqun
npm ci
```

### Configure

```bash
cp .env.example .env
# edit .env — set DATABASE_URL, JWT secrets, super admin password
```

Generate strong JWT secrets:

```bash
openssl rand -hex 32  # use for JWT_ACCESS_SECRET
openssl rand -hex 32  # use for JWT_REFRESH_SECRET
```

### Run in development

```bash
npm run dev
```

Server boots on `http://localhost:3000`.

### Verify

```bash
curl http://localhost:3000/health
# expected: { "status": "ok", "service": "rizqun-api", ... }
```

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start with hot-reload (tsx watch) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled `dist/server.js` |
| `npm run lint` | Lint with ESLint |
| `npm run format` | Format with Prettier |

## Project structure

```
rizqun/
├── src/
│   ├── config/         # env, prisma client
│   ├── modules/        # feature modules (auth, users, products, orders, ...)
│   ├── middlewares/    # auth, role, category-scope guards
│   ├── utils/          # response, AppError, helpers
│   ├── app.ts          # express app + middlewares
│   └── server.ts       # entry point
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
├── .env.example
├── package.json
├── tsconfig.json
└── README.md
```

## Documentation

- [`implementation-guide.md`](./implementation-guide.md) — full system design
- [`implementation-plan.md`](./implementation-plan.md) — phase-by-phase build plan
