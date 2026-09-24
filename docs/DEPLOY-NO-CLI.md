# U2GAS — Deployment without the command line

Every step below is done in a web browser. No terminal, no CLI.

Work top to bottom. Each phase depends on the one before it. Where a step
genuinely cannot be done in a dashboard, it says so and gives you the closest
browser-based alternative.

Throughout, replace `YOURDOMAIN.com` with your actual domain.

---

## Phase 1 — GitHub

1. Go to **github.com** and sign in.
2. Click **+** (top right) → **New repository**.
3. Name it `u2gas`. Set it to **Private**.
4. Do **not** tick "Add a README" — the project already has one.
5. Click **Create repository**.
6. On your computer, open the `u2gas` folder. Drag the files into the GitHub
   upload page (**uploading an existing file** link on the empty repo page).
   Upload everything **except** any `node_modules` folder and any `.env` file.

**Production branch:** `main`.

**Must be committed:** everything in `web/`, `worker/`, `supabase/`, `docs/`,
`tools/`, `README.md`, `.gitignore`.

**Must NOT be committed:** `.env`, `.env.local`, `node_modules/`, `dist/`,
anything containing a key that starts with `sb_secret_`, `sk_`, or `re_`.

**Check before you continue.** In your repository, use the search box and type
each of these. Every one should return no results:

```
sb_secret_
sk_live_
sk_test_
re_
SUPABASE_SECRET_KEY=
```

If any returns a result, that key is now public. Delete the file, commit, and
**rotate that key** in the service it came from — deleting it from GitHub is
not enough, because the history keeps it.

---

## Phase 2 — Supabase project

1. Go to **supabase.com/dashboard** and sign in.
2. Click **New project**.
3. **Organization:** pick or create one.
4. **Name:** `u2gas-production`.
5. **Database Password:** click **Generate a password** and save it in your
   password manager. You will rarely need it, but you cannot recover it.
6. **Region:** choose the one closest to your customers. For Nigeria, pick
   **EU (Frankfurt)** — it is currently the lowest-latency option available.
7. Click **Create new project** and wait about two minutes.

### Where to find your keys

Go to **Project Settings** (gear icon, bottom left) → **API Keys**.

| What you need | Where | Looks like |
|---|---|---|
| Project URL | Settings → API → Project URL | `https://abcdefgh.supabase.co` |
| Publishable key | Settings → API Keys | `sb_publishable_...` |
| Secret key | Settings → API Keys → reveal | `sb_secret_...` |

If your project shows **anon** and **service_role** keys instead, it predates
the new key model. Those work — use the anon key wherever this guide says
publishable, and the service_role key wherever it says secret. The Worker
accepts both.

**The secret key is the master key to your entire database.** It bypasses every
security rule. It goes in the Cloudflare Worker only. It never goes in GitHub,
never in the frontend, never in a message to anyone.

---

## Phase 3 — Database

1. In Supabase, click **SQL Editor** in the left sidebar.
2. Click **New query**.
3. Open `supabase/migrations/0001_schema.sql` from your project folder in a
   text editor. Select all, copy.
4. Paste into the SQL Editor. Click **Run** (or press Ctrl+Enter).
5. Wait for **Success. No rows returned**.
6. Click **New query** again and repeat for each file **in this exact order**:

```
0001_schema.sql
0002_indexes.sql
0003_functions_inventory.sql
0004_functions_orders.sql
0005_functions_jobs.sql
0006_rls.sql
0007_seed.sql
0008_stock_adjust.sql
0009_audit_fixes.sql
0010_guest_and_notify.sql
0011_review_fixes.sql
0012_hardening.sql
0013_settings_binding.sql
0014_exact_amount.sql
0015_audit_correlation.sql
0016_rls_recursion_and_reserve_gas.sql
0017_saved_addresses.sql
0018_refunds.sql
0019_correctness_fixes.sql
0020_drop_stale_overloads.sql
0021_stock_entry_photo.sql
0022_low_stock_alert.sql
0023_asset_refs_and_transitions.sql
```

Order matters. Each file builds on the previous one. If one fails, stop and fix
it before continuing — running a later file against a half-built schema makes
the problem harder to unpick.

### Verify it worked

**Tables.** Left sidebar → **Table Editor**. You should see `order`, `product`,
`payment`, `profile`, `delivery`, `bundle` and about twenty more.

**Functions.** Left sidebar → **Database** → **Functions**. You should see
`create_gas_order`, `confirm_payment`, `redeem_qr`, `reserve_gas` and others.

**Triggers.** **Database** → **Triggers**. Look for `on_auth_user_created`.

**RLS.** **Authentication** → **Policies**. Every table should show
**RLS enabled**. Tables should show read policies only — no table should have
an INSERT, UPDATE or DELETE policy. That is deliberate: all writes go through
the Worker.

**Permissions check.** Run this in the SQL Editor. It should return **no rows**:

```sql
select p.proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('confirm_payment','create_gas_order','redeem_qr',
                    'adjust_product_stock','cancel_order')
  and has_function_privilege('anon', p.oid, 'execute');
```

If it returns rows, migration `0012` did not run. Those functions would be
callable from any browser. Do not continue until this returns nothing.

---

**Do not stop at 0018.** 0019 and 0020 carry the fixes for the notification
state machine, idempotency scoping, and the webhook, QR and delivery races.
0020 in particular drops the old function overloads that 0019 replaced; skip
it and Postgres keeps both versions, so a call can resolve to the stale one.
0020 ends with a guard that raises if any critical function still has more
than one overload — if that fires, an earlier migration did not apply.

### Run the test suites

Still in the SQL Editor, open a new query and paste the whole of
`supabase/tests/01_concurrency.sql`. Run it.

The last thing it prints is a row like:

    passed | failed | total
    -------+--------+------
        87 |      0 |    87

If `failed` is anything but 0, the rows underneath name which checks failed.
Stop and fix those before going further — everything below assumes the
database behaves.

Then do the same with `supabase/tests/02_rls.sql` (38 assertions). That one checks the
security fence: it pretends to be each kind of user and tries things they
should not be able to do. Same output format, same rule — 0 failures or stop.

Both suites end in `rollback`, so they leave nothing behind.

---

## Phase 4 — Supabase Auth

1. **Authentication** → **URL Configuration**.
2. **Site URL:** `https://YOURDOMAIN.com`
3. **Redirect URLs** — click **Add URL** for each:
   - `https://YOURDOMAIN.com/auth/callback`
   - `http://127.0.0.1:5173/auth/callback` (only while developing)
4. Click **Save**.

Supabase rejects any redirect not on this list. That is what stops someone
pointing your login flow at their own site.

### Sign-in providers

**Authentication** → **Providers**.

- **Email** — leave enabled. The app uses magic links, so make sure
  **Confirm email** is on.
- **Google** — if you want it: create an OAuth client at
  **console.cloud.google.com** → APIs & Services → Credentials → Create
  Credentials → OAuth client ID → Web application. Set the authorised redirect
  URI to the callback URL Supabase shows you on the Google provider page. Paste
  the Client ID and Secret back into Supabase and enable.
- **Apple** — needs a paid Apple Developer account. If you do not have one,
  toggle Apple **off**.

**If you disable Google or Apple, remove the matching button** from
`web/src/routes/auth/Login.tsx` before deploying. A button that always errors
is worse than no button.

There is no password login and no password reset. That is intentional.

---

## Phase 5 — Resend

1. Go to **resend.com** and sign up.
2. **Domains** → **Add Domain**. Enter `YOURDOMAIN.com`.
3. Resend shows you DNS records. Keep this tab open — you will add them in
   Cloudflare in Phase 11, then come back and click **Verify**.

The records are:
- **SPF** — a TXT record telling the world Resend may send as you.
- **DKIM** — a TXT or CNAME record that cryptographically signs your mail.
- **DMARC** — a TXT record at `_dmarc.YOURDOMAIN.com`. Resend may not supply
  this one; add it yourself with the value:
  `v=DMARC1; p=none; rua=mailto:you@YOURDOMAIN.com`
  Start with `p=none` so nothing is rejected while you watch the reports.

4. Once verified (green tick), go to **API Keys** → **Create API Key**.
5. Name it `u2gas-production`, permission **Sending access**.
6. Copy the key (`re_...`). **It is shown once.** Save it in your password
   manager.

### Test it

In Resend, go to **Emails** → **Send test email**, using
`no-reply@YOURDOMAIN.com` as the sender. If it arrives and is not in spam, the
domain is set up correctly.

---

## Phase 6 — Supabase SMTP

1. Supabase → **Project Settings** → **Authentication** → scroll to
   **SMTP Settings**.
2. Turn on **Enable Custom SMTP**.

| Field | Value |
|---|---|
| Sender email | `no-reply@YOURDOMAIN.com` |
| Sender name | `U2 Oil and Gas` |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | your Resend API key (`re_...`) |

3. Click **Save**.

### Test it

**Authentication** → **Users** → **Add user** → **Send invite**. Use your own
address. The invite should arrive within a minute. If it does not, the SMTP
settings are wrong or the Resend domain is not verified.

---

## Phase 7 — Edge Functions

**This is the one place a dashboard cannot do everything.**

The Supabase dashboard can edit and deploy an Edge Function once it exists, but
creating one from scratch normally uses the CLI. The browser-based way around
it is the dashboard's function editor.

1. Supabase → **Edge Functions** → **Deploy a new function** →
   **Via Editor**.
2. **Name:** `expire-order-holds`
3. Delete the sample code. Open
   `supabase/functions/expire-order-holds/index.ts` in a text editor, copy all
   of it, paste it in.
4. Click **Deploy**.
5. Repeat for `send-notifications`, using
   `supabase/functions/send-notifications/index.ts`.

If your dashboard does not offer **Via Editor**, that option has not rolled out
to your project. In that case these two functions are a genuine CLI
requirement. The system still works without them, with two consequences:
expired holds are never released (stock stays reserved forever) and no
transactional email is sent. Neither is acceptable for long, so ask a developer
to deploy them once.

### Function secrets

**Edge Functions** → **Secrets** (or **Project Settings** → **Edge Functions**).
Add:

| Name | Value |
|---|---|
| `RESEND_API_KEY` | your `re_...` key |
| `MAIL_FROM` | `U2 Oil and Gas <no-reply@YOURDOMAIN.com>` |
| `APP_ORIGIN` | `https://YOURDOMAIN.com` |

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.

**`MAIL_FROM` is required.** The function refuses to send without it rather
than falling back to an unverified sender that would be silently dropped.

---

### Function 3 — `cleanup-assets`

**What it does.** Deletes storage files for images an admin removed more than
an hour ago, then clears their database rows. The hour is deliberate: it gives
you time to undo a deletion made by mistake.

**Secrets needed.** None beyond the two Supabase injects automatically.

**Deploy it.** Same as the others: **Edge Functions → Deploy a new function →**
name it `cleanup-assets`, paste the contents of
`supabase/functions/cleanup-assets/index.ts`, and deploy.

**Test it.** Delete a product image under **Admin → Stock**, wait an hour (or
temporarily change `interval '1 hour'` to `interval '1 second'` in the SQL
Editor to test now), then invoke the function. Check **Storage → public-media**
and confirm all four files for that image are gone.

---

## Phase 8 — Scheduled jobs

Supabase → **Integrations** → **Cron** → **Enable**. Then **Create job**.

**Job 1**

| Field | Value |
|---|---|
| Name | `expire-order-holds` |
| Schedule | `* * * * *` (every minute) |
| Type | Supabase Edge Function |
| Function | `expire-order-holds` |
| Method | POST |

**Job 2**

| Field | Value |
|---|---|
| Name | `send-notifications` |
| Schedule | `*/2 * * * *` (every two minutes) |
| Type | Supabase Edge Function |
| Function | `send-notifications` |
| Method | POST |

The Cron integration passes the service-role key automatically, which is what
the functions check for. Do not paste any key into the job definition.

### Verify

After five minutes, **Integrations** → **Cron** → click the job → **Runs**.
You should see successful runs. Then in the SQL Editor:

```sql
select action, created_at from audit_log
 where action = 'order.hold_expired'
 order by created_at desc limit 5;
```

Empty is fine if no holds have expired yet — it means nothing was due.

---

### Job 3 — hourly asset cleanup

Same **Integrations → Cron** screen. Name it `cleanup-assets`, schedule
`0 * * * *` (the top of every hour), pointing at the `cleanup-assets`
function with the same Authorization header as the other two.

Nothing here is urgent, so hourly is right. Running it more often just means
more calls that find nothing to do.

---

## Phase 9 — Storage

1. Supabase → **Storage** → **New bucket**.
2. **Name:** `public-media`
3. **Public bucket:** ON — product images must load for signed-out shoppers.
4. **File size limit:** `1 MB`. The Worker compresses before upload, so
   anything larger is not coming from our app.
5. **Allowed MIME types:** `image/webp`
6. Click **Save**.

Then **SQL Editor** → new query → run:

```sql
-- Anyone may read product images.
create policy "media public read" on storage.objects
  for select using (bucket_id = 'public-media');

-- Nobody may write from a browser. Uploads go through the Worker on the
-- secret key, which validates the file before it is stored.
revoke insert, update, delete on storage.objects from anon, authenticated;
```

### Verify

- Open a product image URL in a private browser window → it loads. ✓
- In the Storage dashboard, try **Upload file** while signed out → blocked. ✓

---

## Phase 10 — Paystack

1. Go to **paystack.com** and create an account.
2. Complete business verification. Until you do, you are limited to test mode —
   which is exactly where you want to be for now.
3. **Settings** → **API Keys & Webhooks**.
4. Copy the **Test Secret Key** (`sk_test_...`) and **Test Public Key**
   (`pk_test_...`).
5. In the same page, set **Test Webhook URL** to:

```
https://api.YOURDOMAIN.com/api/payments/webhook/paystack
```

6. Click **Save**.

Paystack signs webhooks with your secret key — there is no separate webhook
secret to configure. The Worker verifies that signature on every delivery and
rejects anything that does not match.

You will test payments in Phase 20, once the Worker is live.

---

## Phase 11 — Cloudflare and DNS

1. Go to **dash.cloudflare.com**, sign up.
2. **Add a site** → enter `YOURDOMAIN.com` → **Continue**.
3. Choose the **Free** plan.
4. Cloudflare scans your existing DNS and shows you two nameservers.
5. Go to your domain registrar (Hostinger, Namecheap, GoDaddy — wherever you
   bought the domain). Find **Nameservers** or **DNS / Nameservers**. Choose
   **Use custom nameservers** and enter the two Cloudflare gave you. Save.
6. Back in Cloudflare, click **Check nameservers**. This usually takes under an
   hour, occasionally up to 24.

Once active:

7. **SSL/TLS** → **Overview** → set encryption mode to **Full (strict)**.
8. **SSL/TLS** → **Edge Certificates** → turn on **Always Use HTTPS**.

### Add the Resend records

**DNS** → **Records** → **Add record**, for each record Resend gave you in
Phase 5.

**Set the proxy status to DNS only (grey cloud) for every mail record.**
Proxying a TXT record breaks verification.

Then go back to Resend and click **Verify**.

---

## Phase 12 — Cloudflare Pages (the frontend)

1. Cloudflare → **Workers & Pages** → **Create** → **Pages** →
   **Connect to Git**.
2. Authorise GitHub, pick your `u2gas` repository.
3. Configure the build:

| Field | Value |
|---|---|
| Production branch | `main` |
| Framework preset | `Vite` |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | `web` |

4. Expand **Environment variables** and add these five:

| Name | Value |
|---|---|
| `VITE_API_BASE` | `https://api.YOURDOMAIN.com/api` |
| `VITE_SUPABASE_URL` | your Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | your `sb_publishable_...` key |
| `VITE_MEDIA_BASE` | `https://YOUR-PROJECT.supabase.co/storage/v1/object/public/public-media` |

5. Click **Save and Deploy**.

**Anything starting with `VITE_` is compiled into the JavaScript your customers
download.** Anyone can read it by opening developer tools. Never put a secret
key here. The publishable key is designed to be public; the secret key is not.

---

## Phase 13 — Cloudflare Worker (the API)

1. **Workers & Pages** → **Create** → **Workers** → **Import a repository**.
2. Select the `u2gas` repository.
3. Configure:

| Field | Value |
|---|---|
| Worker name | `u2gas-api` |
| Root directory | `worker` |
| Deploy command | `npx wrangler deploy` |

That deploy command runs on Cloudflare's build servers, not your computer. You
are not using a CLI; Cloudflare is.

4. Click **Create and deploy**. The first build takes a few minutes.

### Before it will work: the KV namespace

1. **Workers & Pages** → **KV** → **Create a namespace**.
2. Name it `u2gas-cache`. Copy the **Namespace ID**.
3. In your GitHub repository, open `worker/wrangler.toml`, click the pencil
   icon to edit, and replace **both** `YOUR-KV-ID` and
   `YOUR-PRODUCTION-KV-ID` with that ID. Replace every `YOUR-DOMAIN` with your
   real domain. Commit.

The Worker will redeploy automatically.

### Worker variables

**Workers & Pages** → `u2gas-api` → **Settings** → **Variables and Secrets**.

Add each of these. Use **Secret** for the type where the table says SECRET —
that encrypts it and hides it from the dashboard afterwards.

| Variable | Type | Where to get it |
|---|---|---|
| `SUPABASE_URL` | Text | Supabase → Settings → API |
| `SUPABASE_PUBLISHABLE_KEY` | Text | Supabase → API Keys |
| `SUPABASE_SECRET_KEY` | **SECRET** | Supabase → API Keys → reveal |
| `PAYSTACK_SECRET_KEY` | **SECRET** | Paystack → API Keys |
| `PAYSTACK_PUBLIC_KEY` | Text | Paystack → API Keys |
| `RESEND_API_KEY` | **SECRET** | Resend → API Keys |
| `QR_SIGNING_KEY` | **SECRET** | See below |
| `APP_ORIGIN` | Text | `https://YOURDOMAIN.com` |
| `DEPOT_ID` | Text | `00000000-0000-0000-0000-00000000d001` |
| `MAIL_FROM` | Text | `U2 Oil and Gas <no-reply@YOURDOMAIN.com>` |
| `ENVIRONMENT` | Text | `production` |

**To generate `QR_SIGNING_KEY`** without a terminal: open your browser's
developer console (F12) on any page and paste:

```js
crypto.randomUUID().replace(/-/g,'') + crypto.randomUUID().replace(/-/g,'')
```

Copy the 64-character result. Save it in your password manager.

Changing this key later invalidates every QR code customers are holding, so
generate it once and keep it.

Click **Deploy** after adding the variables.

---

## Phase 14 — The API domain

1. **Workers & Pages** → `u2gas-api` → **Settings** → **Domains & Routes** →
   **Add** → **Custom domain**.
2. Enter `api.YOURDOMAIN.com`. Cloudflare creates the DNS record for you.
3. Wait for the certificate (usually under two minutes).

### Verify

Open `https://api.YOURDOMAIN.com/api/health` in your browser. You should see:

```json
{"ok":true,"environment":"production","time":"..."}
```

If you get a 503 with `MISCONFIGURED`, a required variable is missing — the
Worker refuses to serve rather than half-working. Check the Worker logs under
**Observability** → **Logs**.

---

## Phase 15 — The frontend domain

1. **Workers & Pages** → your Pages project → **Custom domains** →
   **Set up a custom domain**.
2. Enter `YOURDOMAIN.com`. Follow the prompt.
3. Add `www.YOURDOMAIN.com` the same way.
4. To send `www` to the bare domain: **Rules** → **Redirect Rules** →
   **Create rule**.
   - **If** hostname equals `www.YOURDOMAIN.com`
   - **Then** dynamic redirect to `concat("https://YOURDOMAIN.com", http.request.uri.path)`
   - Status **301**.

---

## Phase 16 — Check CORS

Open `https://YOURDOMAIN.com`, press **F12**, go to the **Network** tab, and
reload. Click any request to `api.YOURDOMAIN.com` and look at **Response
Headers**. You should see:

```
access-control-allow-origin: https://YOURDOMAIN.com
```

If it says `*`, something is wrong — stop and check `APP_ORIGIN`. A wildcard
lets any website on the internet make authenticated calls using your customers'
sessions.

---

## Phase 17 — Check login

1. Open `https://YOURDOMAIN.com/auth/login`.
2. Enter your email, click **CONTINUE**.
3. Check your inbox, click the link.
4. You should land back on the site, signed in.

Then check the profile was created. Supabase → **Table Editor** → `profile`.
Your row should be there with role `customer`.

If there is no row, the trigger from migration `0012` did not run.

---

## Phase 18 — Full walkthrough

Work through this as a real user would.

**Customer**
- [ ] Sign up with a new email
- [ ] Verification email arrives
- [ ] Browse the shop, open a product
- [ ] Order gas — the keypad accepts an amount
- [ ] Try an amount above your configured maximum → refused
- [ ] Choose delivery, pick a zone, see the fee added
- [ ] Check out **as a guest** (signed out) — the order is visible afterwards
- [ ] Check out signed in
- [ ] Pay with a Paystack test card
- [ ] Order shows confirmed, QR appears
- [ ] Confirmation email arrives within two minutes
- [ ] Cancel an unpaid order → stock returns

**Staff** (set a user's role to `staff` in the Table Editor, then add a row to
`staff_member` linking their `profile_id`)
- [ ] Sign in, land on `/staff`
- [ ] Both queues load
- [ ] Create a walk-in order
- [ ] Record a cash payment, see the change due
- [ ] Scan the customer's QR → success
- [ ] Scan the same QR again → refused
- [ ] Close a shift

**Driver** (role `driver`, plus a row in `driver`)
- [ ] Sign in, land on `/driver`
- [ ] Availability toggle works
- [ ] See an assigned delivery, mark en route
- [ ] Scan at the door → delivered
- [ ] Mark one failed → reschedule and return both work

**Admin** (role `admin`)
- [ ] Sign in, land on `/admin`
- [ ] Tank shows the right numbers
- [ ] Add a stock entry
- [ ] Change the gas rate — old orders keep their old price
- [ ] Edit a product's stock
- [ ] Publish a compatible bundle
- [ ] Try an incompatible pair → refused with a reason
- [ ] Edit a delivery zone fee
- [ ] Audit log shows everything you just did

---

## Phase 19 — Security tests

Every one of these must be **denied**. If any succeeds, do not go live.

**1. A customer reaching the admin app.** Sign in as a customer, go to
`https://YOURDOMAIN.com/admin`. → You should see NOT YOUR DOOR.

**2. A customer calling an admin API.** Signed in as a customer, open the
console (F12) and run:

```js
const { data: { session } } = await (window.supabase?.auth.getSession() ?? {data:{}});
await fetch("https://api.YOURDOMAIN.com/api/admin/stock", {
  headers: { Authorization: `Bearer ${session.access_token}` }
}).then(r => r.status);
```

→ Must return **403**.

**3. A browser calling a payment function directly.** This is the one that used
to work. In the console on your site:

```js
await fetch("https://YOUR-PROJECT.supabase.co/rest/v1/rpc/confirm_payment", {
  method: "POST",
  headers: {
    apikey: "YOUR-PUBLISHABLE-KEY",
    "Content-Type": "application/json"
  },
  body: JSON.stringify({ p_order_id: "any-uuid", p_provider: "x",
                         p_reference: "x", p_amount_kobo: 1, p_method: "cash" })
}).then(r => r.status);
```

→ Must return **404** or **403**. If it returns **200**, migration `0012` did
not run and anyone can mark any order paid.

**4. A guest reading someone else's order.** Take a guest order URL, change the
token in it by one character, open it. → NO SUCH ORDER.

**5. Direct order manipulation.** In the console:

```js
await fetch("https://YOUR-PROJECT.supabase.co/rest/v1/order?order_id=eq.SOME-ID", {
  method: "PATCH",
  headers: { apikey: "YOUR-PUBLISHABLE-KEY", "Content-Type": "application/json" },
  body: JSON.stringify({ payment_status: "paid" })
}).then(r => r.status);
```

→ Must fail. Writes are revoked for browser roles.

**6. Self-promotion to admin.** As a customer:

```js
await fetch("https://YOUR-PROJECT.supabase.co/rest/v1/profile?auth_user_id=eq.YOUR-ID", {
  method: "PATCH",
  headers: { apikey: "YOUR-PUBLISHABLE-KEY", "Content-Type": "application/json" },
  body: JSON.stringify({ role: "admin" })
}).then(r => r.status);
```

→ Must fail. The column privilege does not exist for browser sessions.

**7. Driver seeing another driver's delivery.** Sign in as driver A, open
driver B's delivery URL. → Not found.

---

## Phase 20 — Payment tests

Use Paystack test mode. Test card: `4084 0840 8408 4081`, any future expiry,
CVV `408`, OTP `123456`.

**Normal payment**
1. Create a small order.
2. Pay with the test card.
3. You land back on the order page and it says confirmed.
4. Supabase → `payment` table → one row, status `paid`.
5. Supabase → `order` → `payment_status` is `paid`, `hold_expires_at` is null.
6. Confirmation email arrives.

**Duplicate webhook**
1. Paystack → **Transactions** → open the one you just made → **Resend
   Webhook**.
2. Check the `payment` table → **still one row**.
3. Check `gas_stock` → `deducted_kg` unchanged.

**Failed payment**
1. Use card `4084 0840 8408 4040` (declines).
2. Order stays unpaid. No stock is deducted.

**Refreshing the callback**
1. After paying, press F5 on the callback page several times.
2. Still one payment row.

**Expiry**
1. Create an order, choose **PAY IN THE DEPOT**, do not pay.
2. Note `gas_stock.reserved_kg` went up.
3. Wait for the hold to lapse plus a minute.
4. `reserved_kg` comes back down, order status is `expired`.

---

### Refund a test payment

After a successful test payment, go to **Admin → Orders → Flagged** and cancel
the order. A refund appears with **Process refund**. Press it.

Expected: the refund shows as refunded, the Paystack dashboard shows a matching
refund, and the customer gets an email. Press the button twice in quick
succession — the second press must report that it is already in progress, not
send a second refund.

For a cash order there is no Paystack transaction to reverse, so the button
says to refund it in person and the manual option closes it with a note.

---

### One more payment test

Paystack's dashboard lets you resend a webhook. Edit the amount in the payload
before resending — change `amount` to something larger than the order total.

Expected: the order stays unpaid, and a `payment.amount_mismatch` row appears
under **Admin → Log**. An overpayment is refused exactly like an underpayment,
because either one means the amount came from somewhere other than the order.

---

## Phase 21 — Going live

Only when every test above passes.

1. Paystack → complete business verification if you have not.
2. Paystack → **API Keys & Webhooks** → switch to **Live**. Copy the live keys.
3. Set the **Live Webhook URL** to the same
   `https://api.YOURDOMAIN.com/api/payments/webhook/paystack`.
4. Cloudflare Worker → **Variables and Secrets** → update
   `PAYSTACK_SECRET_KEY` and `PAYSTACK_PUBLIC_KEY` to the live values →
   **Deploy**.
5. Supabase → **Settings** → **Database** → confirm **Point in Time Recovery**
   or daily backups are on. On the free plan you get daily backups for 7 days;
   consider upgrading before taking real money.
6. Make **one real purchase** with your own card, for the smallest amount you
   sell.
7. Verify: the order is confirmed, the payment row is correct, the email
   arrived, the QR scans at the depot, and the stock moved.
8. Refund yourself through the Paystack dashboard to confirm that path works.

---

## Environment variable reference

| Variable | Service | Public or secret | Where from | Purpose |
|---|---|---|---|---|
| `VITE_API_BASE` | Pages | Public | You | Where the frontend calls the API |
| `VITE_SUPABASE_URL` | Pages | Public | Supabase | Auth from the browser |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Pages | Public | Supabase | Auth from the browser |
| `VITE_MEDIA_BASE` | Pages | Public | Supabase | Image URLs |
| `SUPABASE_URL` | Worker | Public | Supabase | Database connection |
| `SUPABASE_PUBLISHABLE_KEY` | Worker | Public | Supabase | Reads under RLS |
| `SUPABASE_SECRET_KEY` | Worker | **SECRET** | Supabase | All writes |
| `PAYSTACK_SECRET_KEY` | Worker | **SECRET** | Paystack | Charging and webhook signatures |
| `PAYSTACK_PUBLIC_KEY` | Worker | Public | Paystack | Checkout |
| `RESEND_API_KEY` | Worker + Edge | **SECRET** | Resend | Email |
| `QR_SIGNING_KEY` | Worker | **SECRET** | You generate | QR and guest tokens |
| `APP_ORIGIN` | Worker | Public | You | CORS |
| `DEPOT_ID` | Worker | Public | Migration 0007 | Which depot |
| `MAIL_FROM` | Worker + Edge | Public | You | Sender address |
| `ENVIRONMENT` | Worker | Public | You | `production` |

---

## Never do these

- Never commit `.env`, or any file containing `sb_secret_`, `sk_`, or `re_`.
- Never put a secret key in a `VITE_` variable. It ends up in the browser.
- Never set CORS to `*`.
- Never trust a payment amount sent by the browser.
- Never mark a payment as successful by editing the database by hand.
- Never deploy without running the migrations first.
- Never go live without testing the webhook, including a duplicate.
- Never run `delete from` or `update` in the SQL Editor without a `where`
  clause and a recent backup.
- Never give someone the `admin` role casually. An admin can see every order
  and every payment.
- Never rely on the frontend to enforce a price, a stock level, or a role.

---

## If something breaks

**Worker logs.** Workers & Pages → `u2gas-api` → **Observability** → **Logs**.
Every response carries an `X-Request-Id`; search for it.

**Database logs.** Supabase → **Logs** → **Postgres**.

**Email.** Resend → **Emails** shows every send with its status.

**Payments.** Paystack → **Transactions**, and the **Webhooks** tab of an
individual transaction shows delivery attempts and our responses.

Nothing in these logs contains a key, a token or a password. That is
deliberate — if you find one, treat it as a bug and tell whoever maintains the
code.
