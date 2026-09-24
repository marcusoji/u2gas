#!/usr/bin/env bash
# ============================================================================
# U2GAS — true two-session concurrency tests
#
# The inline suite in 01_concurrency.sql proves the logic. It cannot prove the
# locking, because one session never contends with itself. These cases run two
# psql sessions that deliberately collide.
#
#   ./run_concurrency.sh "postgresql://..."
# ============================================================================
set -euo pipefail

DB="${1:-${DATABASE_URL:-}}"
[ -n "$DB" ] || { echo "usage: $0 <DATABASE_URL>"; exit 2; }

DEPOT='00000000-0000-0000-0000-00000000d001'
fails=0

pass() { echo "  PASS  $1"; }
fail() { echo "  FAIL  $1"; fails=$((fails+1)); }

q() { psql "$DB" -qtAX -c "$1"; }

# ---------------------------------------------------------------------------
echo
echo "TEST 1 — two customers, 10kg left, both want 10kg"
echo "--------------------------------------------------"

q "update gas_stock set total_received_kg=10, reserved_kg=0, deducted_kg=0 where depot_id='$DEPOT';"

mkfifo /tmp/gt_gate 2>/dev/null || true

# Session A opens a transaction, takes the row lock, then waits.
psql "$DB" -qtAX >/tmp/gt_a.out 2>&1 <<SQL &
begin;
select order_id from create_gas_order('$DEPOT', 10, 'pickup',
  null, null, null, 'online', 'A', '+2348000000101');
select pg_sleep(2);
commit;
SQL
A_PID=$!

sleep 0.4   # let A take the lock first

# Session B tries the same 10kg while A still holds it.
psql "$DB" -qtAX >/tmp/gt_b.out 2>&1 <<SQL || true
select order_id from create_gas_order('$DEPOT', 10, 'pickup',
  null, null, null, 'online', 'B', '+2348000000102');
SQL

wait $A_PID || true

if grep -q "INSUFFICIENT_GAS" /tmp/gt_b.out; then
  pass "second customer refused"
else
  fail "second customer was not refused — see /tmp/gt_b.out"
fi

reserved=$(q "select reserved_kg from gas_stock where depot_id='$DEPOT';")
[ "$reserved" = "10.000" ] && pass "exactly 10kg reserved, not 20" \
                           || fail "reserved_kg is $reserved, expected 10.000"

q "delete from \"order\" where guest_phone in ('+2348000000101','+2348000000102');"

# ---------------------------------------------------------------------------
echo
echo "TEST 2 — two staff scan the same QR at the same moment"
echo "------------------------------------------------------"

HASH=$(q "select encode(digest('concurrent-scan-'||now()::text,'sha256'),'hex');")

ORDER=$(q "
  insert into \"order\" (depot_id, guest_phone, order_type, gas_amount_kg,
    rate_at_purchase, gas_subtotal_kobo, total_kobo, fulfillment_type,
    status, payment_status)
  values ('$DEPOT','+2348000000103','gas',1,140000,140000,140000,'pickup',
          'confirmed','paid')
  returning order_id;")

q "select reserve_gas('$ORDER','$DEPOT',1,null);"
q "select issue_qr('$ORDER','$HASH',72);"
q "update gas_stock set deducted_kg=0 where depot_id='$DEPOT';"

psql "$DB" -qtAX -c "select redeem_qr('$HASH', null, 'pickup');" >/tmp/gt_s1.out 2>&1 &
psql "$DB" -qtAX -c "select redeem_qr('$HASH', null, 'pickup');" >/tmp/gt_s2.out 2>&1 &
wait

wins=0
grep -q '"fulfilled": true' /tmp/gt_s1.out && wins=$((wins+1))
grep -q '"fulfilled": true' /tmp/gt_s2.out && wins=$((wins+1))

[ "$wins" -eq 1 ] && pass "exactly one scan succeeded" \
                  || fail "$wins scans succeeded, expected 1"

deducted=$(q "select deducted_kg from gas_stock where depot_id='$DEPOT';")
[ "$deducted" = "1.000" ] && pass "stock deducted once" \
                          || fail "deducted_kg is $deducted, expected 1.000"

q "delete from \"order\" where order_id='$ORDER';"
q "update gas_stock set deducted_kg=0 where depot_id='$DEPOT';"

# ---------------------------------------------------------------------------
echo
echo "TEST 3 — payment lands while the expiry sweep is running"
echo "--------------------------------------------------------"

ORDER=$(q "
  insert into \"order\" (depot_id, guest_phone, order_type, gas_amount_kg,
    rate_at_purchase, gas_subtotal_kobo, total_kobo, fulfillment_type,
    hold_expires_at)
  values ('$DEPOT','+2348000000104','gas',2,140000,280000,280000,'pickup',
          now() - interval '1 minute')
  returning order_id;")

q "select reserve_gas('$ORDER','$DEPOT',2,now() - interval '1 minute');"

psql "$DB" -qtAX -c "select * from expire_order_holds(100);" >/tmp/gt_e.out 2>&1 &
psql "$DB" -qtAX -c "select confirm_payment('$ORDER','paystack','race_ref',280000,'paystack');" >/tmp/gt_p.out 2>&1 &
wait

status=$(q "select status || '/' || payment_status from \"order\" where order_id='$ORDER';")
case "$status" in
  confirmed/paid) pass "payment won — order confirmed, stock still held" ;;
  expired/pending) pass "sweep won — order expired, payment correctly rejected" ;;
  *) fail "inconsistent end state: $status" ;;
esac

# Whatever the outcome, the two must never disagree.
bad=$(q "select count(*) from \"order\" o
         where o.order_id='$ORDER'
           and o.status='expired' and o.payment_status='paid';")
[ "$bad" = "0" ] && pass "no expired-and-paid contradiction" \
                 || fail "order is both expired and paid"

q "delete from \"order\" where order_id='$ORDER';"

# ---------------------------------------------------------------------------
echo
if [ "$fails" -eq 0 ]; then
  echo "All concurrency tests passed."
else
  echo "$fails concurrency test(s) failed."
  exit 1
fi
