#!/usr/bin/env bash
# Local-only demo data for the preview: catalogue, tank stock and one account
# per role. Nothing here is production content; the checked-in migration
# 0007_seed.sql intentionally ships an empty catalogue.
set -euo pipefail

SB="${SUPABASE_URL:-http://127.0.0.1:54321}"
KEY="${SUPABASE_SERVICE_ROLE_KEY:?set SUPABASE_SERVICE_ROLE_KEY}"
AUTH=(-H "apikey: $KEY" -H "Authorization: Bearer $KEY")
DEPOT=00000000-0000-0000-0000-00000000d001

rest() { # rest <method> <path> [json]
  local m="$1" p="$2" body="${3:-}"
  # `resolution=merge-duplicates` is required: a plain POST with
  # `on_conflict` still raises 23505 on an existing row and the write is
  # dropped, which is how the first seed pass lost the whole catalogue.
  local prefer="return=representation"
  [ "$m" = "POST" ] && prefer="resolution=merge-duplicates,return=representation"
  if [ -n "$body" ]; then
    curl -sS -X "$m" "$SB/rest/v1/$p" "${AUTH[@]}" \
      -H "Content-Type: application/json" -H "Prefer: $prefer" -d "$body"
  else
    curl -sS -X "$m" "$SB/rest/v1/$p" "${AUTH[@]}" \
      -H "Content-Type: application/json" -H "Prefer: $prefer"
  fi
}

# --- Storage bucket + product pictures --------------------------------------
if ! curl -sS "$SB/storage/v1/bucket/public-media" "${AUTH[@]}" | grep -q '"id"'; then
  curl -sS -X POST "$SB/storage/v1/bucket" "${AUTH[@]}" \
    -H "Content-Type: application/json" \
    -d '{"id":"public-media","name":"public-media","public":true}' >/dev/null
fi

# image_asset only accepts webp (image_mime), so convert the source PNGs once.
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
python3 - "$TMP" <<'PY'
import sys
from PIL import Image
out = sys.argv[1]
for name in ("image1", "image2", "image3", "image4"):
    Image.open(f"web/public/images/{name}.png").convert("RGBA").save(f"{out}/{name}.webp", "WEBP")
PY

upsert_image() { # upsert_image <asset_uuid> <name> <w> <h>
  local id="$1" name="$2" w="$3" h="$4" path="products/$2.webp"
  curl -sS -X POST "$SB/storage/v1/object/public-media/$path" "${AUTH[@]}" \
    -H "Content-Type: image/webp" -H "x-upsert: true" \
    --data-binary "@$TMP/$name.webp" >/dev/null
  rest POST "image_asset?on_conflict=asset_id" \
    "[{\"asset_id\":\"$id\",\"owner_type\":\"product\",\"bucket\":\"public-media\",\"base_path\":\"$path\",\"sha256\":\"$(printf '%-64s' "$name" | tr ' ' '0')\",\"width\":$w,\"height\":$h,\"bytes_source\":1,\"bytes_grid\":1,\"mime\":\"image/webp\"}]" >/dev/null
  echo "$id"
}

A1=$(upsert_image 00000000-0000-0000-0000-0000000a0001 image1 90 119)
A2=$(upsert_image 00000000-0000-0000-0000-0000000a0002 image2 116 116)
A3=$(upsert_image 00000000-0000-0000-0000-0000000a0003 image3 134 135)
A4=$(upsert_image 00000000-0000-0000-0000-0000000a0004 image4 96 109)

# --- Catalogue --------------------------------------------------------------
CYL=00000000-0000-0000-0000-0000000000c1
HOSE=00000000-0000-0000-0000-0000000000c2
CLAMP=00000000-0000-0000-0000-0000000000c4
BATT=00000000-0000-0000-0000-0000000000c5

rest POST "product?on_conflict=product_id" "[
 {\"product_id\":\"00000000-0000-0000-0000-0000000b0001\",\"category_id\":\"$CYL\",\"sku\":\"U2-CYL-125\",\"name\":\"U2 GAS CYLINDER\",\"subtitle\":\"12.5KG\",\"description\":\"12.5KG\",\"price_kobo\":1500000,\"stock_qty\":24,\"image_asset\":\"$A1\"},
 {\"product_id\":\"00000000-0000-0000-0000-0000000b0002\",\"category_id\":\"$HOSE\",\"sku\":\"U2-HOSE-6\",\"name\":\"U2 POWER HOSE\",\"subtitle\":\"6 FEET\",\"description\":\"6 FEET\",\"price_kobo\":1100000,\"stock_qty\":40,\"image_asset\":\"$A2\"},
 {\"product_id\":\"00000000-0000-0000-0000-0000000b0003\",\"category_id\":\"$BATT\",\"sku\":\"U2-BATT-6\",\"name\":\"U2 IGNITION BATTERY\",\"subtitle\":\"6-PACK ENERGIZER\",\"description\":\"6-PACK ENERGIZER\",\"price_kobo\":600000,\"stock_qty\":60,\"image_asset\":\"$A4\"},
 {\"product_id\":\"00000000-0000-0000-0000-0000000b0004\",\"category_id\":\"$CLAMP\",\"sku\":\"U2-CLAMP-HD\",\"name\":\"U2 HOSE CLAMPS\",\"subtitle\":\"HEAVY DUTY\",\"description\":\"HEAVY DUTY\",\"price_kobo\":450000,\"stock_qty\":80,\"image_asset\":\"$A3\"},
 {\"product_id\":\"00000000-0000-0000-0000-0000000b0005\",\"category_id\":\"$HOSE\",\"sku\":\"U2-HOSE-8\",\"name\":\"U2 POWER HOSE\",\"subtitle\":\"8 FEET\",\"description\":\"8 FEET\",\"price_kobo\":1400000,\"stock_qty\":35,\"image_asset\":\"$A2\"},
 {\"product_id\":\"00000000-0000-0000-0000-0000000b0006\",\"category_id\":\"$HOSE\",\"sku\":\"U2-HOSE-4\",\"name\":\"U2 POWER HOSE\",\"subtitle\":\"4 FEET\",\"description\":\"4 FEET\",\"price_kobo\":850000,\"stock_qty\":50,\"image_asset\":\"$A2\"}
]" >/dev/null

# --- Tank stock -------------------------------------------------------------
rest PATCH "gas_stock?depot_id=eq.$DEPOT" '{"total_received_kg":5000,"rate_kobo_per_kg":140000}' >/dev/null

# --- One account per role ---------------------------------------------------
mkuser() { # mkuser <email> <password> <role> <first> <last> <phone>
  local email="$1" pass="$2" role="$3" first="$4" last="$5" phone="$6"
  local uid
  uid=$(curl -sS -X POST "$SB/auth/v1/admin/users" "${AUTH[@]}" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$email\",\"password\":\"$pass\",\"email_confirm\":true}" \
    | python3 -c "import sys,json;print(json.load(sys.stdin).get('id',''))")
  if [ -z "$uid" ]; then
    uid=$(curl -sS "$SB/auth/v1/admin/users?per_page=200" "${AUTH[@]}" \
      | python3 -c "import sys,json;print(next((u['id'] for u in json.load(sys.stdin).get('users',[]) if u['email']=='$email'),''))")
  fi
  rest POST "profile?on_conflict=auth_user_id" \
    "[{\"auth_user_id\":\"$uid\",\"role\":\"$role\",\"first_name\":\"$first\",\"last_name\":\"$last\",\"email\":\"$email\",\"phone\":\"$phone\"}]" >/dev/null
  local pid
  pid=$(curl -sS "$SB/rest/v1/profile?auth_user_id=eq.$uid&select=profile_id" "${AUTH[@]}" \
    | python3 -c "import sys,json;print(json.load(sys.stdin)[0]['profile_id'])")
  case "$role" in
    staff)  rest POST "staff_member?on_conflict=profile_id" "[{\"profile_id\":\"$pid\"}]" >/dev/null ;;
    driver) rest POST "driver?on_conflict=profile_id" "[{\"profile_id\":\"$pid\",\"phone\":\"$phone\"}]" >/dev/null ;;
  esac
  echo "$role  $email  /  $pass"
}

mkuser admin@u2gas.test   password123 admin  Ada   Okafor  08030000001
mkuser cashier@u2gas.test password123 staff  Chidi  Eze     08030000002
mkuser driver@u2gas.test  password123 driver Musa   Bello   08030000003
mkuser customer@u2gas.test password123 customer Ngozi Umeh   08030000004
