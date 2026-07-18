# Quilt Planner 🧵

A cozy little web app for planning quilt patterns — made for quilters who have
been squinting at Excel grids for too long.

Sign in, set the size of your quilt and its cells, then paint each cell with a
fabric (a color plus an optional pattern like dots, stripes, or flowers). The
app totals up **exactly how much of each fabric you need** — square footage
including seam allowance, and a practical yardage estimate for the fabric
store. Save as many quilts as you like, switch between them, and copy one to
try a variation.

## Features

- **Grid editor** — click or drag to paint cells; works with mouse or touch
- **Your fabrics** — name each fabric, pick its color and pattern; add, edit,
  or remove them any time
- **Flexible sizing** — set quilt width/height and cell width/height in inches
  (cells don't have to be square); resizing keeps your painting
- **Fabric totals** — per-fabric cell counts, cut-piece sizes, square feet
  (with your chosen seam allowance), and yards off a standard 42″ bolt rounded
  up to the next ⅛ yard
- **Multiple quilts** — create, rename, copy, and delete; everything autosaves
- **Undo/redo** (Ctrl+Z / Ctrl+Shift+Z) and a print view for taking the
  pattern and shopping list to the store
- **Simple accounts** — email + password, sessions stored server-side

## How it's built

Everything runs on Cloudflare's free tier as a single Worker:

| Piece    | Technology                                              |
| -------- | ------------------------------------------------------- |
| Frontend | React + Vite, served as static assets from the Worker   |
| API      | [Hono](https://hono.dev) on Cloudflare Workers          |
| Database | Cloudflare D1 (SQLite) — users, sessions, quilts        |
| Auth     | PBKDF2-hashed passwords, HttpOnly session cookies       |

## Deploying to Cloudflare (free)

You need a free [Cloudflare account](https://dash.cloudflare.com/sign-up) and
Node.js 18+.

```sh
npm install
npx wrangler login                       # opens a browser to authorize

# 1. Create the database (one time)
npx wrangler d1 create quilt-planner-db
#    Copy the database_id it prints into wrangler.jsonc
#    (replace REPLACE_WITH_YOUR_DATABASE_ID)

# 2. Create the tables
npm run db:migrate:remote

# 3. Build and deploy
npm run deploy
```

Wrangler prints your URL, e.g. `https://quilt-planner.<your-subdomain>.workers.dev`.
Open it, create an account, and start quilting. Deploying again later is just
`npm run deploy`.

### Free-tier headroom

- **Workers**: 100,000 requests/day — a family of quilters won't dent this.
- **D1**: 5 GB storage, 5 million reads/day. A quilt design is a few KB.

### Closing the front door

Anyone who finds the URL can create an account (they can only ever see their
own quilts). Once your quilters have signed up, you can turn off new
registrations:

```sh
# in wrangler.jsonc, add:
#   "vars": { "DISABLE_REGISTRATION": "true" }
npm run deploy
```

## Local development

```sh
npm install
npm run db:migrate:local   # creates a local SQLite copy of the schema
npm run dev                # wrangler dev (API, :8787) + vite (UI, :5173)
```

Open <http://localhost:5173>. The Vite dev server proxies `/api/*` to the
Worker.

Other scripts:

```sh
npm test        # unit tests (fabric math, validation)
npm run check   # typecheck client and worker
npm run build   # production build into dist/client
```

## Project layout

```
migrations/          D1 schema migrations
src/shared/quilt.ts  Quilt model, fabric math, validation (client + server)
src/worker/          Cloudflare Worker: Hono API, auth, sessions
src/app/             React app: login, quilt list, grid editor, totals
tests/               Vitest unit tests for the shared math
```
