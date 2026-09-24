# U2GAS — Screen gap analysis

60 prototype frames were supplied. Below is what exists, what's missing against the
functional spec, and how each missing screen should be built from the existing language.

Legend: ✅ designed · ⚠️ designed but incomplete · ❌ missing

---

## USER APP — `/`

### Auth
| Screen | State | Notes |
|---|---|---|
| Login intro (`MAKE GAS CONVINIENT`) | ✅ | Terminal peeking from top edge, `LOG IN`, Google/Apple |
| Email entry + CONTINUE | ✅ | |
| **Email verification sent** | ❌ | Terminal LED reads `CHECK YOUR MAIL`. Body: email echoed, `RESEND` ghost pill with a 60s countdown in the LED ticker |
| **Verification success** | ❌ | Reuse the thumbs-up halftone success frame; LED `!! VERIFIED !!` |
| **Verification expired / invalid link** | ❌ | Thumbs-down halftone; LED `LINK EXPIRED`; blue pill `SEND NEW LINK` |
| **Forgot password** | ❌ | Same as email-entry frame, label swapped to `RESET YOUR PASSWORD` |
| **Reset password (new password)** | ❌ | Two pill inputs, strength shown as a 5-segment LED bar not a coloured meter |
| **Session expired** | ❌ | Ticker `SESSION ENDED`, single `LOG IN AGAIN` pill |

### Gas order
| Screen | State | Notes |
|---|---|---|
| Terminal home + keypad | ✅ | |
| Rate ticker variants | ✅ | |
| Payment sheet (walk-in) | ✅ | `BANK TRANS` / `OPAY` / `PAY IN THE DEPOT` |
| Payment sheet (delivery) | ✅ | Map + `CONFIRM DELIVERY ADDRESS`, adds `CARD` |
| Amount confirm (`10kg ₦10,000 via OPAY`) | ✅ | |
| Payment success | ✅ | Thumbs up + LED `!! SUCCESS !!` |
| Payment failed | ✅ | Thumbs down + LED `FAILED` |
| Receipt printing + QR | ✅ | |
| Receipt modal + `KEEP` | ✅ | |
| **Insufficient stock** | ❌ | **Critical gap.** LED flashes `ONLY 6KG LEFT`, keypad dims to `--blue-soft`, sheet offers `TAKE 6KG` or `CANCEL`. Spec §17 requires this |
| **Reduced-quantity accept** | ❌ | Confirmation of the above before reservation is taken |
| **Hold countdown (pay-at-depot)** | ❌ | Ticker becomes a live countdown `HOLD EXPIRES IN 29:41`. Receipt shows `UNPAID` stamp |
| **Hold expired / order cancelled** | ❌ | Receipt overprinted with red `EXPIRED` stamp, stock released message |
| **Delivery zone not covered** | ❌ | Map frame with red dashed outline, `WE DON'T DELIVER HERE YET` stamp |
| **Pickup status / ready for collection** | ⚠️ | Only shown as a history row. Needs its own screen: live QR + `READY AT DEPOT` |
| **Delivery tracking (live)** | ⚠️ | Map exists in the driver app only. User needs the same map card with driver name + ETA |
| **Order detail** | ❌ | Receipt view with a status strip at the top, same as the `DELIVERY IN PROGRESS` bar seen in History |

### Accessories
| Screen | State | Notes |
|---|---|---|
| Shop grid | ✅ | |
| Product detail + `ADD to Cart` | ✅ | |
| Product unavailable | ✅ | `ITEM UNAVAILABLE` stamp, button disabled to `--blue-soft` |
| Cart with items | ✅ | |
| Cart empty | ✅ | |
| Cart checkout sheets (walk-in + delivery) | ✅ | |
| **Cart line-item became unavailable at checkout** | ❌ | Spec §27 requires naming the exact item/qty. Stamp the offending item in the basket, sheet lists `2 OF 3 AVAILABLE` |
| **Product search / category filter** | ❌ | Ticker becomes an input; results reuse the shop grid |
| **Compatible bundle offer** | ❌ | New feature — see spec addendum §71 |

### Account
| Screen | State | Notes |
|---|---|---|
| Profile menu | ✅ | `HISTORY / PERSONAL DETAILS / SUBSCRIPTIONS (coming soon)` |
| Personal details | ✅ | |
| History (month tabs + receipts) | ✅ | |
| **Notifications list** | ❌ | User has a bell badge but no destination. Reuse the staff `NOTIFS` frame with tabs `ORDERS / DELIVERY / STOCK` |
| **Saved addresses** | ❌ | List of dashed cards, each with the map thumbnail from the delivery sheet |
| **Empty history** | ❌ | Receipt slot with no paper + `NOTHING PRINTED YET` |

---

## STAFF / CASHIER APP — `/staff`

| Screen | State | Notes |
|---|---|---|
| Splash (`CASHIER APP`) | ✅ | |
| Scanner idle / success / fail | ✅ | |
| Walk-in keypad | ✅ | Grey metal terminal |
| Walk-in payment confirm | ✅ | `CASH` / `BANK TRANS` / `OPAY` chips |
| Notifs — IN-PERSON / ONLINE / BOOKINGS | ✅ | With `ALL / CASH / POS / TRANSFER` sub-tabs |
| Confirm pick-up | ✅ | |
| Staff profile | ✅ | |
| **Staff login** | ❌ | Grey terminal instead of blue, otherwise identical to user login |
| **Amount tendered → change due** | ❌ | Spec §32. LED shows `CHANGE ₦2,600` in green-tinted LED; requires explicit `CONFIRM CASH RECEIVED` press |
| **Order lookup by phone / order number** | ❌ | Keypad reused as a search pad, LED shows the digits entered |
| **Order detail** | ❌ | Receipt view + `MARK FULFILLED` |
| **Flagged order** | ❌ | Thumbs-down frame with the reason stamped: `ALREADY SCANNED` / `UNPAID` / `EXPIRED` |
| **Awaiting-payment queue (empty)** | ❌ | `NO ONE WAITING` |
| **Shift close / cash reconciliation** | ❌ | Receipt-style summary: expected vs counted, variance stamped red if non-zero, `CLOSE SHIFT` |
| **Offline / no camera permission** | ❌ | Scanner square greyed, stamp `CAMERA BLOCKED` |

---

## DRIVER APP — `/driver`

| Screen | State | Notes |
|---|---|---|
| Splash (`DRIVER`) | ✅ | |
| Scanner idle / success / fail | ✅ | |
| Deliveries list + expanded map + `SCAN` | ✅ | |
| Driver profile (`COMPLETED 328 DELIVERIES`) | ✅ | |
| Completed history | ✅ | |
| **Driver login** | ❌ | As staff |
| **Availability toggle** | ❌ | Spec §40. Segmented pill `AVAILABLE / BUSY / OFFLINE` on the profile screen; the live dot on the avatar reflects it |
| **Delivery detail** | ⚠️ | Only the inline expansion exists. Needs a full screen with customer phone, items, address, fee |
| **Mark en route** | ❌ | Blue pill `START TRIP`; ticker becomes `EN ROUTE — 12 MIN` |
| **Failed delivery** | ❌ | Thumbs-down; reason chips (dashed, rotated): `NO ANSWER` / `WRONG ADDRESS` / `REFUSED` |
| **Reschedule / return to depot** | ❌ | Spec §25 lists both states with no design |
| **Empty queue** | ❌ | `NO DROPS ASSIGNED` |

---

## ADMIN APP — `/admin`

| Screen | State | Notes |
|---|---|---|
| Splash (`ADMIN`) | ✅ | |
| Gas tank gauge + `UPDATE` | ✅ | |
| Tank + `UPDATE` / `HISTORY` | ✅ | |
| Update gas modal (tons, −/+) | ✅ | |
| Tank at 6 tons / 60% + prediction | ✅ | |
| Gas history (month tabs, ADDITION/REMOVAL, QR receipts) | ✅ | |
| Staff grid | ✅ | |
| Staff detail (role, account no., bank, `REMOVE STAFF`) | ✅ | |
| Add staff (`+` tile) | ✅ | |
| Staff history — driver & cashier variants | ✅ | |
| Notifs (STOCK / IN-PERSON / ONLINE / BOOKINGS) | ✅ | |
| **Admin login** | ❌ | |
| **Accessories inventory list** | ❌ | Big gap. Shop grid re-skinned: each tile gains a stock strip `STOCK 12 · RSVD 3 · AVAIL 9` |
| **Product create / edit** | ❌ | See spec addendum §71 for the multi-upload form |
| **Product deactivate confirm** | ❌ | Red `REMOVE STAFF` button style, relabelled |
| **Orders list** | ❌ | Notifs frame with a date filter |
| **Order detail + manual actions** | ❌ | Receipt + `CANCEL ORDER` / `REFUND` |
| **Flagged review queue** | ❌ | List of thumbs-down cards awaiting a decision |
| **Cash reconciliation (all staff)** | ❌ | Table as stacked dashed cards — no real tables in this design language |
| **Driver management** | ❌ | Mirror of the staff grid, roles swapped |
| **Delivery zones** | ❌ | Map card per zone with the fee in the LED strip, `ACTIVE / INACTIVE` toggle |
| **Delivery fee editor** | ❌ | Reuse the tons `−/+` modal, naira instead |
| **Hold-expiry settings** | ❌ | Same `−/+` modal, minutes |
| **Reports / analytics** | ❌ | Tank gauge language reused: fills and rulers, not charts |
| **Audit log** | ❌ | Dense dashed list, monospace timestamps |

---

## Cross-cutting states missing everywhere

The prototype has almost no non-happy-path states. Spec §42 requires all of these on
every screen, and they don't exist yet:

- **Loading** — build it as the LED ticker showing a scanning bar `▮▮▮▯▯▯`. Do not use a spinner
- **Empty** — always a stamped line in the red dashed style, as the cart already does
- **Error** — thumbs-down halftone + a stamp naming the cause
- **Permission denied** — `NOT YOUR DOOR` stamp, single pill back to the correct root
- **404** — receipt slot with a torn stub, `NO SUCH ORDER`
- **Offline** — ticker goes dark, stamp `NO SIGNAL`

---

## Priority order for building the missing screens

1. Insufficient stock + reduced quantity (user) — blocks the core spec §17 flow
2. Hold countdown + expiry (user) — blocks §37
3. Change due + confirm cash received (staff) — blocks §32
4. Accessories inventory + product create/edit (admin) — blocks §30 and the new §71
5. Flagged order / flagged queue (staff + admin) — blocks §22
6. Availability, en route, failed, reschedule (driver) — blocks §25
7. Delivery zones + fees (admin) — blocks §34
8. All auth recovery screens
9. Reconciliation, reports, audit log
10. Cross-cutting states
