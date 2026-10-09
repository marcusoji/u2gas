#!/usr/bin/env bash
#
# Proves the Monnify credentials the Worker will use can actually mint a token.
#
# The auth call is the gate for everything else: if it fails, initialize,
# verify and refund all fail, and the app only shows MONNIFY_INIT_FAILED. Run
# this after filling worker/.dev.vars, before chasing any payment symptom.
#
#   bash scripts/check-monnify.sh
#
# The secret is never echoed. Only the API key's first characters are shown, so
# the output is safe to paste into a chat or an issue.
set -uo pipefail

VARS_FILE="${1:-worker/.dev.vars}"

if [[ ! -f "$VARS_FILE" ]]; then
  echo "FAIL: $VARS_FILE not found."
  echo "      cp worker/.dev.vars.example worker/.dev.vars   and fill it in."
  exit 1
fi

# Read one key without sourcing the file: a .dev.vars is shell-shaped but
# sourcing it would run whatever else it contains.
read_var() {
  sed -n "s/^$1=//p" "$VARS_FILE" | tail -n1 | sed 's/^["'\'']//; s/["'\'']$//'
}

API_KEY="$(read_var MONNIFY_API_KEY)"
SECRET_KEY="$(read_var MONNIFY_SECRET_KEY)"
BASE_URL="$(read_var MONNIFY_BASE_URL)"
BASE_URL="${BASE_URL:-https://api.monnify.com}"
BASE_URL="${BASE_URL%/}"

placeholder() {
  case "$1" in
    ""|REPLACE_ME|MK_TEST|sk_test|sk_REPLACE_ME|MK_REPLACE_ME) return 0 ;;
    *) return 1 ;;
  esac
}

echo "Monnify credential check"
echo "  vars file : $VARS_FILE"
echo "  base url  : $BASE_URL"
echo "  api key   : ${API_KEY:0:8}… (len ${#API_KEY})"
echo "  secret    : (len ${#SECRET_KEY}, not shown)"

if placeholder "$API_KEY" || placeholder "$SECRET_KEY"; then
  echo
  echo "FAIL: placeholders, not real keys."
  echo "      Get the pair from Monnify → Developers → API Keys & Contracts."
  echo "      Sandbox keys work against $BASE_URL."
  echo "      A key minted for the other environment is rejected with"
  echo "      'check that the right credentials are being used for the right environment'."
  exit 1
fi

# A sandbox key pair is only accepted by sandbox, and vice versa. Warn rather
# than fail: the test-key naming is not guaranteed.
if [[ "$BASE_URL" == *sandbox* && "$API_KEY" != MK_TEST* ]]; then
  echo "  note      : base url is sandbox but the key is not MK_TEST — a prod key"
  echo "              will be rejected here."
fi
if [[ "$BASE_URL" != *sandbox* && "$API_KEY" == MK_TEST* ]]; then
  echo "  note      : base url is live but the key is MK_TEST — switch the url to"
  echo "              https://sandbox.monnify.com while testing."
fi

CREDS="$(printf '%s:%s' "$API_KEY" "$SECRET_KEY" | base64 | tr -d '\n')"

BODY="$(curl -s -X POST "$BASE_URL/api/v1/auth/login" \
  -H "Authorization: Basic $CREDS" -w '\n%{http_code}')"
CODE="$(printf '%s' "$BODY" | tail -n1)"
JSON="$(printf '%s' "$BODY" | sed '$d')"

echo
if [[ "$CODE" == "200" ]] && printf '%s' "$JSON" | grep -q '"accessToken"'; then
  echo "PASS: token minted. The Worker can reach Monnify and the pair is valid."
  exit 0
fi

echo "FAIL: HTTP $CODE"
# Monnify answers 200 with requestSuccessful:false for a business rejection, so
# print the message rather than the status alone.
printf '%s\n' "$JSON" | sed -n 's/.*"responseMessage":"\([^"]*\)".*/  message: \1/p'
echo "  Nothing else about payments can work until this returns PASS."
exit 1
