import { describe, expect, it } from "vitest";
import { nairaToKobo, monnifyMeta } from "../src/lib/monnify";

/**
 * The shapes Monnify actually returns, captured from the sandbox.
 *
 * These are regression guards, not inventions. Each one is a field name or a
 * type that was read wrongly the first time and would have broken payments
 * silently — the code compiled and the pure-function tests passed, because
 * nothing exercised the real payload. They are written as the sandbox returned
 * them, including the string amounts, so a future edit that "cleans them up"
 * fails here rather than in production.
 */

/** GET /api/v2/merchant/transactions/query?paymentReference=... — a real response. */
const VERIFY_RESPONSE = {
  transactionReference: "MNFY|04|20261001215340|000571",
  paymentReference: "u2gas-f-25488ac9c9",
  amountPaid: "0.00",
  totalPayable: "0.00",
  settlementAmount: null,
  paidOn: null,
  paymentStatus: "PENDING",
  paymentDescription: "Order U2-F-1",
  currency: "NGN",
  paymentMethod: null,
  product: null,
  cardDetails: null,
  accountDetails: null,
  accountPayments: [],
  customer: { email: "test@example.com", name: "test@example.com" },
  metaData: {
    profile_id: "",
    order_number: "U2-F-1",
    order_id: "269e6c43-f103-4a3f-9885-196a2417cc93",
  },
};

/** POST /api/v1/merchant/transactions/init-transaction — a real responseBody. */
const INIT_RESPONSE = {
  transactionReference: "MNFY|14|20261001215303|000610",
  paymentReference: "u2gas-test-d70707ad4c",
  merchantName: "Marco Digital Limited",
  redirectUrl: "https://example.com/orders/verify?order=x",
  enabledPaymentMethod: ["CARD", "ACCOUNT_TRANSFER", "PHONE_NUMBER", "DIRECT_DEBIT", "USSD"],
  checkoutUrl: "https://sandbox.sdk.monnify.com/checkout/MNFY|14|20261001215303|000610",
  metaData: { order_id: "d46d711e-9e3d-46cc-b1e6-9ae9787e1d10" },
};

describe("verify response, as the sandbox returns it", () => {
  it("carries the merchant reference at the top level", () => {
    expect(VERIFY_RESPONSE.paymentReference).toBe("u2gas-f-25488ac9c9");
  });

  it("carries Monnify's own transactionReference, which a refund needs", () => {
    expect(VERIFY_RESPONSE.transactionReference).toBe("MNFY|04|20261001215340|000571");
  });

  it("returns metaData as an object, so the order id is read directly", () => {
    expect(monnifyMeta(VERIFY_RESPONSE)).toEqual(VERIFY_RESPONSE.metaData);
    expect(monnifyMeta(VERIFY_RESPONSE)?.order_id)
      .toBe("269e6c43-f103-4a3f-9885-196a2417cc93");
  });

  it("returns the currency as `currency`, not `currencyCode`", () => {
    // The response has no `currencyCode` — that is the *request* field name.
    // Reading it here yielded undefined, so the currency check validated
    // nothing at all.
    expect(VERIFY_RESPONSE.currency).toBe("NGN");
    expect((VERIFY_RESPONSE as any).currencyCode).toBeUndefined();
  });

  it("returns amountPaid as a string, and has no `amount` field", () => {
    // Both matter. A string is not a number, and `amount` is the request-side
    // name that never comes back — the gross figure is `totalPayable`.
    expect(typeof VERIFY_RESPONSE.amountPaid).toBe("string");
    expect((VERIFY_RESPONSE as any).amount).toBeUndefined();
    expect(VERIFY_RESPONSE.totalPayable).toBeDefined();
  });

  it("converts a string amount to kobo for the exact-amount check", () => {
    // The value that actually matters: "100.00" naira is 10000 kobo, and
    // passing the string straight to a comparison would never match.
    expect(nairaToKobo("100.00")).toBe(10000);
    expect(nairaToKobo(VERIFY_RESPONSE.amountPaid)).toBe(0);
  });
});

describe("init response, as the sandbox returns it", () => {
  it("gives a checkoutUrl to redirect to", () => {
    expect(INIT_RESPONSE.checkoutUrl).toContain("sandbox.sdk.monnify.com/checkout/");
  });

  it("echoes the transactionReference a later refund is requested with", () => {
    expect(INIT_RESPONSE.transactionReference).toMatch(/^MNFY\|/);
  });

  it("lists the payment methods this contract enables", () => {
    // The account's contract enables CARD, ACCOUNT_TRANSFER, PHONE_NUMBER,
    // DIRECT_DEBIT and USSD. Worth pinning because a refund is bank-transfer
    // only, so how much volume is card decides how refunds must be handled.
    expect(INIT_RESPONSE.enabledPaymentMethod).toContain("CARD");
    expect(INIT_RESPONSE.enabledPaymentMethod).toContain("ACCOUNT_TRANSFER");
  });
});
