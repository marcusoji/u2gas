#!/usr/bin/env bash
# ============================================================================
# U2GAS — run the SQL suites (migrations + RLS + transitions) on a throwaway
# local Postgres, with the Supabase shim applied first.
#
#   bash supabase/tests/local/run_sql_suites.sh
#
# Needs Docker (or a reachable Postgres) and `psql`. It applies every migration
# in order, then 01_concurrency.sql, 02_rls.sql and 03_assets_and_transitions.sql,
# and prints each suite's PASS/FAIL tally. The hosted Supabase project remains
# the source of truth; this proves the migrations apply cleanly from scratch and
# that the assertions hold.
#
#   DB_URL=postgresql://...   use an existing database instead of Docker
# ============================================================================
set -euo pipefail

cd "$(dirname "$0")/../../.."   # repo root

CONTAINER="${CONTAINER:-u2gas-pg-test}"
PORT="${PORT:-55432}"
PGUSER="${PGUSER:-postgres}"
PGPASS="${PGPASS:-postgres}"
DBNAME="${DBNAME:-postgres}"
OWN_DOCKER=0

if [ -z "${DB_URL:-}" ]; then
  command -v docker >/dev/null 2>&1 || { echo "docker or DB_URL required" >&2; exit 2; }
  DOCKER="docker"
  docker info >/dev/null 2>&1 || DOCKER="sudo docker"
  $DOCKER rm -f "$CONTAINER" >/dev/null 2>&1 || true
  echo "==> starting $CONTAINER (postgres:16) on :$PORT"
  $DOCKER run -d --name "$CONTAINER" \
    -e POSTGRES_PASSWORD="$PGPASS" -e POSTGRES_DB="$DBNAME" \
    -p "$PORT:5432" postgres:16 >/dev/null
  OWN_DOCKER=1
  DB_URL="postgresql://$PGUSER:$PGPASS@127.0.0.1:$PORT/$DBNAME"
  echo "==> waiting for Postgres"
  for _ in $(seq 1 60); do
    if psql "$DB_URL" -qtAX -c 'select 1' >/dev/null 2>&1; then break; fi
    sleep 1
  done
  psql "$DB_URL" -qtAX -c 'select 1' >/dev/null 2>&1 || {
    echo "Postgres did not come up" >&2; $DOCKER logs "$CONTAINER" | tail -20; exit 1; }
fi

cleanup() {
  if [ "$OWN_DOCKER" = 1 ]; then
    docker rm -f "$CONTAINER" >/dev/null 2>&1 || sudo docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

run() { psql "$DB_URL" -v ON_ERROR_STOP=1 -q "$@"; }

echo "==> applying Supabase shim"
run -f supabase/tests/local/00_supabase_shim.sql

echo "==> applying migrations"
for f in supabase/migrations/*.sql; do
  printf '    %s\n' "$(basename "$f")"
  run -f "$f"
done

status=0
for suite in 01_concurrency 02_rls 03_assets_and_transitions; do
  echo
  echo "==> $suite.sql"
  # The suites are self-contained transactions; a failed assertion raises a
  # WARNING rather than an error, so ON_ERROR_STOP does not catch it. Capture
  # output and count, exactly as the psql invocation in the docs does.
  out=$(psql "$DB_URL" -v ON_ERROR_STOP=1 -f "supabase/tests/$suite.sql" 2>&1) || {
    echo "$out" | tail -30
    echo "  SUITE ERRORED"
    status=1
    continue
  }
  # A failed assertion raises an exception (ON_ERROR_STOP aborts), so a clean
  # exit already means every check passed; the tally below is the proof it was
  # not vacuous.
  fails=$(printf '%s\n' "$out" | grep -c 'FAIL:' || true)
  printf '%s\n' "$out" | grep 'FAIL:' | sed 's/^/    /' || true
  echo "    failures: $fails"
  printf '%s\n' "$out" | grep -E '^[[:space:]]*[0-9]+[[:space:]]*\|' | sed 's/^/    tally: /' || true
  [ "$fails" -eq 0 ] || status=1
done

echo
if [ "$status" -eq 0 ]; then
  echo "SQL SUITES: CLEAN"
else
  echo "SQL SUITES: FAILURES PRESENT" >&2
fi
exit "$status"
