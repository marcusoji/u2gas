# U2GAS — SPECIFICATION ADDENDUM (SECTIONS 71–76)

Append this to the existing prompt. It continues from section 70.

---

## 71. COMPATIBLE MULTI-ITEM UPLOAD (3-ITEM BUNDLES)

The system must support creating and selling **bundles of up to three accessories that are
compatible with one another**, uploaded and published in a single action.

### 71.1 What a bundle is

A bundle is a named set of 2–3 existing or newly created products that physically work
together — for example a cylinder, a hose of matching diameter, and a regulator of matching
thread. A bundle is sold as one cart line at a bundle price, but it consumes stock from each
member product individually.

A bundle is NOT a product. Do not create bundle stock. Bundle availability is derived:

```
bundle_available_qty = MIN(available_quantity of each member product / member quantity)
```

### 71.2 Compatibility model

Compatibility must be data-driven, not hardcoded and not free text.

Create the following:

**PRODUCT_ATTRIBUTE**
```
product_id
attribute_key        -- e.g. 'thread_type', 'hose_diameter_mm', 'cylinder_valve'
attribute_value
```

**COMPATIBILITY_RULE**
```
rule_id
category_a
category_b
attribute_key
match_type           -- 'equal' | 'in_set' | 'numeric_range'
tolerance            -- nullable, for numeric_range
active
```

Two products are compatible when every applicable `COMPATIBILITY_RULE` for their category
pair is satisfied by their attributes. Admins must be able to manage rules from the admin UI.

Do not allow an admin to publish a bundle whose members fail the active rules. Instead:

- Block the publish action.
- Name the exact conflict in the response, e.g. `HOSE 8MM DOES NOT FIT REGULATOR 10MM`.
- Offer an explicit `OVERRIDE` action available only to the `manager` role, which records an
  `AUDIT_LOG` entry with the overriding admin, the rule violated, and a required reason string.

### 71.3 Upload behaviour

The create-bundle form accepts up to three item slots in one submission. Each slot is either:

- a reference to an existing `product_id`, or
- a new product definition plus one image file.

All three slots must be validated, compressed, uploaded and persisted **in a single atomic
transaction**. Partial success is not permitted. If slot 3 fails validation, slots 1 and 2
must not be created, and any already-uploaded storage objects must be deleted before the
error is returned.

Implement uploads concurrently (`Promise.all`) against Supabase Storage, then open the
database transaction only once every object is confirmed stored. Storage writes happen
before the transaction; the transaction commits the rows referencing them; on rollback,
a compensating delete removes the orphaned objects.

### 71.4 Bundle tables

**BUNDLE**
```
bundle_id
name
description
bundle_price
active
created_by
created_at
updated_at
```

**BUNDLE_ITEM**
```
bundle_item_id
bundle_id
product_id
quantity             -- default 1
slot_index           -- 1..3
UNIQUE (bundle_id, slot_index)
CHECK (slot_index BETWEEN 1 AND 3)
```

Enforce a maximum of three members per bundle with a database-level constraint or trigger,
not application code alone.

### 71.5 Bundle reservation

When a bundle is ordered, the atomic reservation in spec §27 must reserve **every member
product in the same transaction**, in a deterministic order (ascending `product_id`) to
avoid deadlock. If any member has insufficient stock, the whole reservation fails and the
customer is told which member is short.

Fulfilment and release follow the same rule: all members move together, always transactionally.

### 71.6 Bundle UI

- **Admin:** a three-slot upload screen. Each slot is a dashed drop tile in the existing
  card style. As soon as two slots are filled, a compatibility strip appears under them —
  green `COMPATIBLE` or a red stamp naming the conflict, in the established stamp style.
- **Customer:** bundles appear in the shop grid as a single tile with the three product
  cut-outs overlapping. Product detail shows the members as three small dashed cards, the
  saving against buying separately, and `ADD BUNDLE to Cart`.
- **Unavailable:** if any member is out of stock, apply the existing `ITEM UNAVAILABLE`
  stamp and disable the button to `--blue-soft`, and name the short member beneath.

---

## 72. IMAGE UPLOAD, COMPRESSION AND RENDERING PIPELINE

All images entering the system must be compressed before they reach storage or the database.
No original-resolution camera file may ever be written to Supabase Storage.

### 72.1 Client-side pre-compression (mandatory first pass)

Before any network request, in the browser:

1. Read the file, reject anything not `image/jpeg`, `image/png`, `image/webp` or `image/heic`.
2. Reject files over 15 MB outright with a stamped error.
3. Strip EXIF, but read and apply the orientation tag first so the image is not rotated.
4. Draw to an `OffscreenCanvas`, resize so the longest edge is at most 1600px.
5. Encode to WebP at quality 0.82. If the browser cannot encode WebP, encode JPEG at 0.85.
6. If the result still exceeds 400 KB, re-encode stepping quality down by 0.05 to a floor
   of 0.6, then reduce the longest edge to 1200px.

Run this in a Web Worker so the UI does not block. This is what makes the three-slot upload
in §71 feel instant.

### 72.2 Server-side re-processing (authoritative)

Never trust the client. The Cloudflare Worker receiving the upload must:

1. Verify the content type by reading the **magic bytes**, not the declared header.
2. Reject anything over 1 MB after client compression, since a legitimate client cannot
   exceed that.
3. Reject images whose decoded dimensions exceed 1600×1600 (decompression-bomb guard).
4. Generate the derivative set below.
5. Compute a SHA-256 of the final original-tier bytes and store it. If a hash already
   exists for the same uploader and category, reuse the existing object rather than
   storing a duplicate.

### 72.3 Derivative set

Every uploaded image produces exactly four objects, all WebP:

| Tier | Longest edge | Quality | Used by |
|---|---|---|---|
| `thumb` | 96px | 0.75 | List-card thumbnails, basket items, avatars |
| `grid` | 320px | 0.80 | Shop grid tiles, staff grid |
| `detail` | 800px | 0.82 | Product detail, profile header |
| `source` | 1600px | 0.85 | Retained for re-derivation only, never served to the app |

Store under a deterministic key: `products/{product_id}/{tier}.webp`.

### 72.4 Database

Do **not** store image bytes in PostgreSQL. Store references only.

**IMAGE_ASSET**
```
asset_id
owner_type           -- 'product' | 'profile' | 'bundle' | 'stock_entry'
owner_id
bucket
base_path
sha256               -- UNIQUE per (owner_type, sha256)
width
height
bytes_source
bytes_grid
mime                 -- always 'image/webp'
uploaded_by
created_at
```

Products reference `asset_id`. Deleting a product soft-deletes the asset and schedules
storage cleanup through the scheduled Edge Function.

### 72.5 Rendering to match the design exactly

The design uses **cut-out product images on white with no card, no crop and no letterbox**.
Reproduce that precisely:

- Uploaded images must be background-removed or supplied pre-cut as transparent PNG before
  compression. WebP preserves alpha — do not flatten onto white during encoding, or the
  cut-out effect is lost against the `--paper` background.
- Render with `object-fit: contain`, never `cover`. The design never crops a product.
- Every `<img>` declares explicit `width` and `height` attributes so no layout shift occurs.
- Serve with `srcset` across the `thumb`/`grid`/`detail` tiers and `sizes` matching the
  grid column width.
- `loading="lazy"` and `decoding="async"` on everything below the fold; the first four
  grid tiles are `loading="eager"` with `fetchpriority="high"`.
- Avatars are the only circular crop: `border-radius: 50%` with `object-fit: cover`.
- Cache headers on storage objects: `public, max-age=31536000, immutable`. Keys are
  content-addressed via the hash, so cache-busting happens through a new key, never a
  query string.

---

## 73. PERFORMANCE BUDGET — 2 SECOND TARGET

Every route must be interactive within **2000 ms on a 4G connection on a mid-range Android
device** (Moto G-class, 4× CPU throttle). This is a hard budget, not an aspiration, and it
must be measured in CI, not eyeballed.

### 73.1 Budget breakdown

| Metric | Budget |
|---|---|
| Largest Contentful Paint | ≤ 1800 ms |
| Time to Interactive | ≤ 2000 ms |
| First Input Delay / INP | ≤ 100 ms |
| Cumulative Layout Shift | ≤ 0.05 |
| Initial JS, compressed | ≤ 160 KB |
| Initial CSS, compressed | ≤ 30 KB |
| Fonts, total | ≤ 90 KB |
| Largest single API response on first paint | ≤ 40 KB |

### 73.2 How to hit it

**Fonts.** The pixel face is the brand and must not flash. Self-host it, subset to the
characters actually used (`A–Z a–z 0–9 ₦ · , . : ! ? − + /`), serve WOFF2, preload the one
weight used for headings, and set `font-display: swap` with a metric-matched fallback so
no reflow occurs. The script face loads only on profile routes.

**Route splitting.** `/`, `/staff`, `/admin`, `/driver` are four separate lazy chunks. A
customer must never download the admin bundle. Share only the design-system chunk.

**Data.** The first paint of every route depends on at most one API call. Aggregate on the
Worker — `/api/user/home` returns rate, stock availability and unread count in one response.
Do not fan out three calls from the client.

**Edge caching.** Cache the gas rate and shop catalogue at the Cloudflare edge with
`stale-while-revalidate`. Purge on write. Availability numbers are never cached — they are
read live inside the reservation transaction anyway.

**The terminal graphic.** It is the LCP element on the user route. Build it in CSS and inline
SVG, not as a raster image. No bitmap on the critical path.

**Halftone imagery.** The thumbs-up/down images are large decorative rasters. Preload
neither. Load them only when the scan resolves.

**Skeletons.** Use the LED loading bar described in the gap analysis rather than spinners,
and reserve the exact final dimensions so CLS stays at zero.

### 73.3 Enforcement

Add a Lighthouse CI run to the build with the budgets above as failing thresholds. A pull
request that regresses any budget does not merge. Record a `PERFORMANCE_BUDGET.json` in the
repository as the single source of truth for these numbers.

---

## 74. ROUTING AND ROLE SEPARATION

The four applications are served from one Cloudflare Pages deployment under distinct path
prefixes.

```
/                      Customer app
/staff                 Cashier app
/driver                Driver app
/admin                 Admin app
/auth/*                Shared authentication (login, verify, reset)
/api/*                 Cloudflare Workers
```

### 74.1 Rules

- Each prefix has its own root layout, its own splash frame, and its own lazy bundle.
- A logged-in user landing on the wrong prefix is redirected to their own root. They are
  never shown a partially rendered screen of a role they do not hold.
- A logged-out user on any protected prefix is redirected to `/auth/login?next=<path>`.
- Deep links are preserved through login via the `next` parameter, validated against an
  allowlist of internal paths so it cannot be used as an open redirect.
- `/admin` and `/staff` must send `X-Robots-Tag: noindex` and must not appear in the sitemap.

### 74.2 Authorisation

Path prefixes are navigation, not security. Every `/api/*` route independently verifies the
caller's role from the Supabase JWT on the server. Hiding a route must never be the only
thing preventing access. Row Level Security enforces the same boundaries at the database
level, so that a compromised Worker still cannot read another role's data.

Roles: `customer`, `staff`, `driver`, `manager`, `admin`. `manager` is a superset of `staff`
and is the only role permitted the compatibility override in §71.2.

---

## 75. ADDITIONS TO THE TESTING REQUIREMENTS (extends §62)

**Bundles**
- publish a compatible three-item bundle
- rejection of an incompatible pair, with the conflict named
- manager override recorded in the audit log
- bundle availability derived correctly when one member is short
- concurrent purchase of the last bundle by two customers — only one succeeds
- partial upload failure leaves no products, no bundle, and no orphaned storage objects

**Images**
- oversized file rejected client-side
- spoofed content type rejected server-side by magic bytes
- decompression bomb rejected
- all four derivatives generated
- transparency preserved through compression
- duplicate upload deduplicated by hash
- rendered product image is uncropped and matches the design's cut-out treatment

**Performance**
- Lighthouse CI passes every budget on all four routes
- no layout shift on image load
- admin bundle absent from the customer route's network waterfall

**Routing**
- each role redirected correctly from every foreign prefix
- deep link preserved through login
- external URL in `next` rejected
- API rejects a role-mismatched JWT even when the path is reachable

---

## 76. PRECEDENCE

Where this addendum conflicts with sections 1–70, this addendum wins, except on visual
design — the Figma frames remain the visual source of truth in all cases, and any screen
introduced here must be built from the tokens and components catalogued in the design system
document rather than invented.
