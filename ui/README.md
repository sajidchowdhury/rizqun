# Rizqun UI — Operator Console

The frontend for the [Rizqun](https://github.com/sajidchowdhury/rizqun) order management API.

Lives in the `ui/` subfolder of the main `rizqun` repository so backend + frontend
ship together as a single deployable unit.

Built per the [frontend implementation plan](../frontend-implementation-plan.md).

## Tech Stack

- **React 19** + **Vite** + **TypeScript**
- **Tailwind CSS v4** (via `@tailwindcss/vite`)
- **shadcn/ui** (added in Phase 0.2)
- **ESLint 9** + **Prettier 3**

## Local Development

### Prerequisites

- Node.js ≥ 20
- The Rizqun backend running on `http://localhost:3000`
  (run `npm install && npm run dev` from the repo root, see
  the [main README](../README.md) for setup)

### Quickstart

```bash
# From the repo root
cd ui

# 1. Install dependencies
npm install

# 2. Copy env file (already includes default API URL)
cp .env.example .env.local

# 3. Start the dev server
npm run dev
```

The UI will be available at `http://localhost:5173`.

The backend API must be running on `http://localhost:3000` (already
allow-listed in the backend's `CORS_ORIGINS` env var — see
`../.env.example`).

### Available Scripts

Run from the `ui/` folder:

| Script | Description |
|--------|-------------|
| `npm run dev` | Start Vite dev server (HMR) on port 5173 |
| `npm run build` | Type-check + build for production to `dist/` |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Run ESLint |
| `npm run lint:fix` | Run ESLint with `--fix` |
| `npm run format` | Format all source files with Prettier |
| `npm run format:check` | Check formatting without modifying files |

## Project Structure

```
rizqun/                     # backend repo root
├─ src/                     # backend (Express API)
├─ prisma/                  # backend (schema + migrations)
├─ deploy/                  # backend (nginx, backups)
├─ frontend-implementation-plan.md  # this UI's plan
└─ ui/                      # ← this folder
   ├─ src/
   │  ├─ main.tsx           # Entry — mounts <App />
   │  ├─ App.tsx            # Root component
   │  ├─ index.css          # Tailwind v4 import
   │  └─ lib/
   │     └─ utils.ts        # cn() class merge helper
   ├─ public/
   ├─ index.html
   ├─ vite.config.ts        # Vite config (React + Tailwind + @/* alias)
   ├─ tsconfig.json         # TS root config (references app + node)
   ├─ tsconfig.app.json     # TS app config (with @/* path alias)
   ├─ tsconfig.node.json    # TS config for vite.config.ts
   ├─ eslint.config.mjs     # ESLint 9 flat config
   ├─ .prettierrc.json
   └─ package.json
```

## Path Alias

`@/*` resolves to `src/*` (configured in both `vite.config.ts` and `tsconfig.app.json`).

```ts
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
```

## Phase Progress

This scaffold completes **Phase 0.1** of the frontend implementation plan.
See [frontend-implementation-plan.md](../frontend-implementation-plan.md)
for the full 40-session roadmap.

- [x] 0.1 Scaffold Vite + React + TS + Tailwind v4
- [ ] 0.2 Install shadcn/ui + theme tokens
- [ ] 0.3 Routing shell + layout skeleton
- [ ] ...

## Deployment

Production: `npm run build` from `ui/` produces `ui/dist/`, which gets
copied to `/var/www/rizqun-ui/` on the VPS. The existing
`deploy/nginx/rizqun.conf` already serves that path. See
`../deploy/nginx/README.md` for the full deployment guide.

## License

Same as the Rizqun backend.

