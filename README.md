# U2GAS

Gas and accessories depot platform for U2 Oil and Gas. Four apps on one
deployment: customer, cashier, driver, admin.

```
web/                 Next.js 16 app (static export → Cloudflare Pages)
worker/              Cloudflare Workers API (Hono)
supabase/
  migrations/        Schema, functions, RLS, seed
  functions/         Scheduled Edge Functions
  tests/             Concurrency and integrity suite
docs/                Deployment, environment
```

## The one idea worth knowing

**Nothing touches stock except a database function.** Not the API, not the
frontend. `reserve_gas`, `reserve_products`, `release_reservations`,
`fulfill_reservations` and `redeem_qr` are the only code that moves inventory,
and each is one transaction. A route that reaches for `.update()` on
`product.reserved_qty` is a bug, not a shortcut.

That is what makes the guarantees hold:

- Two customers cannot reserve the same last 10kg — gas serialises on a single
  `FOR UPDATE` row lock.
- Two staff cannot fulfil one QR — `UPDATE … WHERE status = 'unscanned'` claims
  it atomically; the loser gets zero rows.
- A repeated Monnify webhook cannot deduct stock twice — three layers, ending
  in a unique index on the provider reference.
- The expiry sweep cannot release the same hold twice — it only touches
  reservations still marked `reserved`.
- `available_kg` cannot drift, because it is a function, not a column.

## Getting started

All twenty-five migrations, in order. There is no shorter path: stopping early
leaves real defects in the database, not just missing features.

```bash
for f in supabase/migrations/*.sql; do
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f" || break
done
```

Or explicitly:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f supabase/migrations/0001_schema.sql \
  -f supabase/migrations/0002_indexes.sql \
  -f supabase/migrations/0003_functions_inventory.sql \
  -f supabase/migrations/0004_functions_orders.sql \
  -f supabase/migrations/0005_functions_jobs.sql \
  -f supabase/migrations/0006_rls.sql \
  -f supabase/migrations/0007_seed.sql \
  -f supabase/migrations/0008_stock_adjust.sql \
  -f supabase/migrations/0009_audit_fixes.sql \
  -f supabase/migrations/0010_guest_and_notify.sql \
  -f supabase/migrations/0011_review_fixes.sql \
  -f supabase/migrations/0012_hardening.sql \
  -f supabase/migrations/0013_settings_binding.sql \
  -f supabase/migrations/0014_exact_amount.sql \
  -f supabase/migrations/0015_audit_correlation.sql \
  -f supabase/migrations/0016_rls_recursion_and_reserve_gas.sql \
  -f supabase/migrations/0017_saved_addresses.sql \
  -f supabase/migrations/0018_refunds.sql \
  -f supabase/migrations/0019_correctness_fixes.sql \
  -f supabase/migrations/0020_drop_stale_overloads.sql \
  -f supabase/migrations/0021_stock_entry_photo.sql \
  -f supabase/migrations/0022_low_stock_alert.sql \
  -f supabase/migrations/0023_asset_refs_and_transitions.sql \
  -f supabase/migrations/0024_staff_lifecycle.sql \
  -f supabase/migrations/0025_monnify.sql
```

**0019 and 0020 are not optional.** 0019 finishes the notification state
machine — without it a claimed row can stay claimed forever and its message is
never sent. It also scopes idempotency to the caller rather than the key alone
(otherwise one customer can receive another's response), and closes the
webhook, QR and delivery-state races. 0020 drops the old function overloads
0019 replaced; skip it and Postgres keeps both, so a call can resolve to the
stale version. 0020 ends by raising if any critical function still has more
than one overload, which is the check that an earlier migration applied.

```bash

cd worker && npm install && npm run dev
cd web && npm install && npm run dev
```

Full setup is in `docs/DEPLOYMENT.md`. Keys are in `docs/ENVIRONMENT.md`.

## Seeing the UI without an API

Every screen fetches from the Worker or Supabase, so there is no in-browser
fixture build: the Vite-era mock layer went with the old frontend. A screen
with no reachable API renders its own empty/offline state (the terminal ticker
goes dark, lists read `NO … FOUND`) rather than invented data. To see real
screens, run the Worker and point the app at it:

```
cd worker && npm install && npm run dev
cd web && npm install
# web/.env.local: NEXT_PUBLIC_API_BASE=http://127.0.0.1:8787/api
npm run dev
```

The build is a static export (`output: "export"`), so the emitted `out/`
directory is plain files Cloudflare Pages serves directly. Point a build at a
real API with `NEXT_PUBLIC_API_BASE`, `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. `NEXT_PUBLIC_EMBEDDED_API=true` is a
preview-only build that contacts no API: it skips Supabase sign-in and drops the
API origin from the CSP, so every API-backed screen shows its no-data state.
There is no fixture layer behind it.

## Testing

```bash
psql "$DATABASE_URL" -f supabase/tests/01_concurrency.sql   # 87 assertions
psql "$DATABASE_URL" -f supabase/tests/02_rls.sql            # 38 assertions
./supabase/tests/run_concurrency.sh "$DATABASE_URL"          # two live sessions
```

The shell script is the only thing that proves the locking, because one session
never contends with itself. Run it before every release.

## Before the first deploy

The build is a static export. `cd web && npm run build` writes `web/out/`, which
is what Cloudflare Pages serves. The design's typefaces and halftone imagery are
self-hosted under `web/public/fonts/` and `web/public/`; export any missing face
from the Figma file into those directories so nothing falls back. See
`docs/DEPLOYMENT.md` §5.

## Design source

The **live U2-GAS Figma file (`v4xgWC0Q0wtSKmAff3EOzU`) is the only design
source.** There is no committed HTML snapshot of the screens and no generator;
matching the design means reading the live file (page `MAIN SCREENS`,
`256:14758`) through the Figma MCP and changing the app to match. Change the
file first, then bring the change into the app.

## Documentation

| File | What it is |
|---|---|
| `docs/ARCHITECTURE.md` | How the pieces fit, and where each rule is enforced |
| `docs/HANDOVER.md` | Getting the dev server running with no API, adding a page, the asset workflow, and what is left to match Figma |
| `docs/SETUP-CHECKLIST.md` | Accounts, credentials and details needed to set the system up, in order |
| `docs/FRONTEND-API-CONTRACT.md` | Every backend model, endpoint, enum and error code the frontend binds to |
| `docs/DEPLOY-NO-CLI.md` | Step-by-step deployment using only web dashboards |
| `docs/PRODUCTION-READINESS.md` | What was fixed, what remains, the verdict |
| `docs/ENVIRONMENT.md` | Every variable, where it comes from, what rotating costs |
| `docs/DESIGN-SYSTEM.md` | Tokens and components taken from the Figma frames |
| `docs/SCREEN-GAP-ANALYSIS.md` | Which screens existed, which were missing |

## Status

See `PROGRESS.md` for what is built, what is assumed, and what has not been
verified against a live database.
