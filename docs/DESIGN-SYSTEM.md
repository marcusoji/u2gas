# U2GAS — Design System

> **These are the uploaded frontend's own tokens.** The UI source of record is
> `U2gas_frontend-main.zip` (also deployed at `u2gass.vercel.app`); Figma is no
> longer a source. `web/` is a carbon copy of the uploaded app, so when a token
> changes there, mirror the change here and in `web/app/globals.css`.

Everything below is read from the reference app (`web/app/globals.css`, the
components, and the `@theme inline` block). Nothing here was invented.

---

## 1. The core idea of the design

The customer app is a **skeuomorphic gas-pump terminal**: a blue dispenser body
with a red dot-matrix LED readout, a hard plastic keypad, and a paper receipt
that feeds out of a slot. The staff, driver and admin apps reuse the same
language at desk scale.

The voice is short, uppercase, mechanical — `CONFIRM PICK-UP`, `ADD to Cart`,
`Continue to Pay`, `REMOVE STAFF`. The design mixes case deliberately on a few
buttons; keep that. Errors are stamped, not apologised for.

---

## 2. Colour tokens

Defined in `web/app/globals.css` (`@theme inline` and `:root`).

| Token | Value | Use |
|---|---|---|
| `--color-brand-primary` / `--color-blue-primary` | `#1317e4` | Dispenser body, primary pills, links |
| `--color-dark` | `#1e1e1e` | Dark chrome |
| `--color-light-gray` | `#d5d4d4` | Idle LEDs, disabled type |
| `--color-led-red` | `--led-red` | LED readout text (terminal) |
| `--color-keypad-btn` | `--keypad-btn` | Keypad key face |
| `--background` / `--foreground` | `oklch(1 0 0)` / `oklch(0.145 0 0)` | Page surface and text |

Component-level LED values (from `components/terminal-screen-box.tsx`):

| What | Value |
|---|---|
| LED red text | `#FF1B1B` with `drop-shadow(0 0 12px rgba(255,27,27,.95))` and `drop-shadow(0 0 4px #FF1B1B)` |
| LED green text | `#00FF44` with the matching green glow |
| Screen well (red) | `#140808` fill, `#0a0808` border, `inset 0 2px 6px rgba(0,0,0,.95)` |
| Screen well (green) | `#050b05` fill, `#030803` border |
| Bezel | `#1a1a1a` fill, `#0a0a0a` border, `inset 0 1px 1px rgba(255,255,255,.12)` |

---

## 3. Typography

Faces (see §6):

- **jgs7** — the pixel face. Every text style routes through it:
  `--font-sans`, `--font-mono`, `--font-heading`, `--font-pixel`, `--font-led`,
  `--font-caption` are all `var(--font-jgs7), "jgs7", monospace`.
- **Barlow Semi Condensed** — `--font-barlow`, loaded from Google Fonts for
  caption strings.

Sizes are Tailwind arbitrary values in the components (`text-[24px]`,
`text-4xl`, …). The LED readout switches between `text-[24px] tracking-wider`
for five or more characters and `text-4xl tracking-widest` for fewer, and the
marquee path uses `text-[25px] font-bold tracking-wider`.

---

## 4. Shape & elevation

- `--radius: 0.625rem`, with the scale `--radius-sm|md|lg|xl|2xl|3xl|4xl` as
  multiples of it in `@theme inline`.
- The terminal bezel uses `rounded-lg`; the screen well uses `rounded-[6px]`.
- Elevation is inset shadows on the well plus a soft outer shadow on the bezel;
  there is no drop-shadow elevation scale.

---

## 5. Component catalogue

Grouped the way `web/components/` is laid out:

- `terminal-screen-box.tsx` — the LED readout (red / green, static or marquee).
- `sign-box.tsx`, `footer.tsx` — shared chrome.
- `home/` — the customer terminal and shop entry points.
- `modals/` — `HistoryModal`, `ProfileModal`, `ReceiptModal`, `ShopModal`, and
  the `modals/shop/` basket, payment and product-detail views.
- `receipt/` — the paper receipt.
- `login/` — `LoginForm`, `SocialAuth`.
- `layout/` — `Navbar`.
- `admin/`, `cashier/`, `driver/` — the role apps.
- `ui/` — the primitives (`button`, `dialog`, `drawer`, `BottomSheetModal`,
  `modal-sheet`).

---

## 6. Fonts

Self-hosted under `web/public/fonts/`, wired through `next/font/local` in
`app/layout.tsx` and declared in `app/globals.css`. The uploaded frontend ships
**jgs7 only** (`jgs7.woff2` / `jgs7.woff`); Barlow Semi Condensed comes from
Google Fonts at build time. `scripts/fetch-fonts.sh` refreshes jgs7.

---

## 7. Voice

Short, uppercase, mechanical. Match the reference's copy character for
character, including its typos (`C0PYRIGHT`, `Please redude`, curly
punctuation). A straight quote where the reference draws a curly one is a
changed glyph, not a live value.
