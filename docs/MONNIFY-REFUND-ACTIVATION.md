# Monnify: enabling refunds

Refunds are **off by default on every Monnify account**. Until they are
switched on, `POST /admin/refunds/:id/process` fails with
`MONNIFY_REFUND_FAILED` and Monnify answers `R2`, and no amount of code
changes that — it is an account setting.

This file is the request to send, the prerequisites to check first, and how to
confirm it worked. It is a manual step; nothing here can be automated from the
repository, because Monnify accepts it only from the account holder's own
address.

## 1. Send the request

From the **email address on the Monnify account** (support will not action it
from any other), to **integration-support@monnify.com**:

> Subject: Enable Refunds on our account — [BUSINESS NAME]
>
> Hello,
>
> Please enable the **Refund service** on our Monnify account.
>
> - Business name: **[BUSINESS NAME]**
> - Business code: **[BUSINESS CODE]**
> - Contract code: **[CONTRACT CODE]**
> - Environment: **Live**
>
> We need it enabled for **API** access (our backend initiates refunds) and
> **Dashboard** access (for manual reversals).
>
> Our refund webhook is already configured at
> `https://api.[YOUR DOMAIN]/api/payments/webhook/monnify` and we subscribe to
> `SUCCESSFUL_REFUND` and `FAILED_REFUND`.
>
> Please confirm when it is active.
>
> Thank you.

Replace the four bracketed values:

| Placeholder | Where to find it |
|---|---|
| Business name | The account's registered name. Not necessarily "U2" — see below. |
| Business code | Monnify dashboard, at the top of the side menu. **Not** exposed by the API. |
| Contract code | Dashboard → Developers → API Keys & Contracts. This is `MONNIFY_CONTRACT_CODE`. |
| Your domain | The production API host, e.g. `u2gas-api.example.com`. |

## 2. Check the business name first

The sandbox contract is registered as **"Marco Digital Limited"**. If the live
account is under a different name, the email must name the account as Monnify
holds it, or support cannot match the request to an account. Confirm this before
sending rather than guessing.

## 3. Prerequisites, all three of which cause a failed refund

1. **The webhook must subscribe to refund events.** Setting the URL is not
   enough — Monnify must also send `SUCCESSFUL_REFUND` and `FAILED_REFUND` to
   it. Without them a refund sits in `processing` forever: the Worker
   deliberately does not mark a refund `refunded` on acceptance, only when the
   gateway confirms (see §6.1 of the API contract).
2. **The wallet must hold the money.** Refunds are paid from the Monnify
   **wallet**, not the settlement bank account. An underfunded wallet fails the
   refund with `R5`.
3. **The original payment must have been a bank transfer.** Monnify refunds
   `ACCOUNT_TRANSFER` only. A card payment is refused with `R2` however healthy
   the wallet is, and the Worker now refuses it before calling the gateway at
   all, with `REFUND_METHOD_NOT_ELIGIBLE` — see the card decision below.

## 4. How to confirm it worked

Activation is usually within 24 hours. Confirm against the live account, not
the sandbox:

1. Take one real bank-transfer payment.
2. Raise a refund against it from `/admin`.
3. It should move `pending → processing`, and then to `refunded` when the
   `SUCCESSFUL_REFUND` webhook lands — **not** at the moment Monnify accepts it.
4. A refund that never leaves `processing` means the refund webhook is not
   subscribed, not that the refund failed.

## 5. The card decision

Monnify refunds bank transfers only, so **card payments cannot be reversed
through the gateway at all** — not by API, and not from the Monnify dashboard.
For a card payment the only route is to send the money back by transfer and
close the refund manually:

```
POST /admin/refunds/:id/manual   { "note": "..." }
```

That path exists and needs no Monnify cooperation, which is why it is the
answer for cards rather than waiting on an activation that would not help.

If most volume is cards, decide the operational answer — who sends the
transfer, and against which account — before taking real money. That is a
business decision, not a code one; the software already refuses the card
refund clearly instead of failing obscurely at the gateway.
