import { describe, expect, it } from "vitest";
import {
  koboToNaira, nairaToKobo, monnifyMeta, monnifyTransactionReference,
  monnifyRefundable,
} from "../src/lib/monnify";

/**
 * Monnify gateway helpers.
 *
 * The amount conversions are the reason this file exists. Paystack took kobo
 * as an integer and Monnify takes naira as a decimal, so a value that is not
 * converted is not slightly wrong — it is wrong by a factor of one hundred,
 * in the direction that charges the customer too much. These are pure
 * functions, so they are tested directly rather than through a mocked fetch.
 */

describe("amount conversion", () => {
  it("converts kobo to the naira decimal Monnify expects", () => {
    expect(koboToNaira(500000)).toBe(5000);
    expect(koboToNaira(140000)).toBe(1400);
    expect(koboToNaira(100)).toBe(1);
    expect(koboToNaira(1)).toBe(0.01);
  });

  it("converts Monnify's naira decimal back to kobo", () => {
    expect(nairaToKobo(5000)).toBe(500000);
    expect(nairaToKobo("5000.00")).toBe(500000);
    expect(nairaToKobo(0.01)).toBe(1);
    expect(nairaToKobo("1400.5")).toBe(140050);
  });

  it("round-trips a kobo amount without drift", () => {
    // Every amount the app stores is an integer number of kobo. Converting
    // out and back must return exactly the same integer, or a payment would
    // fail the exact-amount check against its own order total.
    for (const kobo of [1, 99, 100, 5050, 140000, 999999, 1_000_000_000]) {
      expect(nairaToKobo(koboToNaira(kobo))).toBe(kobo);
    }
  });

  it("does not lose a kobo to floating-point rounding", () => {
    // 0.1 + 0.2 arithmetic would give 999.9999999999999 here. Rounding at
    // the boundary is what stops that reaching a comparison.
    expect(nairaToKobo(koboToNaira(99999))).toBe(99999);
    expect(nairaToKobo("33.33")).toBe(3333);
    expect(koboToNaira(3333)).toBe(33.33);
  });
});

describe("metadata extraction", () => {
  it("reads metaData when Monnify returns it as an object", () => {
    expect(monnifyMeta({ metaData: { order_id: "abc" } })).toEqual({ order_id: "abc" });
  });

  it("parses metaData when Monnify returns it as a JSON string", () => {
    expect(monnifyMeta({ metaData: '{"order_id":"abc"}' })).toEqual({ order_id: "abc" });
  });

  it("returns null rather than throwing on unusable metadata", () => {
    // A malformed value must not take the webhook handler down with it: the
    // caller checks for the missing order id and refuses the payment.
    expect(monnifyMeta({ metaData: "not json" })).toBeNull();
    expect(monnifyMeta({})).toBeUndefined();
    expect(monnifyMeta(undefined)).toBeUndefined();
  });
});

describe("transaction reference", () => {
  it("reads the top-level transactionReference from a verify payload", () => {
    expect(monnifyTransactionReference({ transactionReference: "MNFY|1|20240101" }))
      .toBe("MNFY|1|20240101");
  });

  it("falls back to the product reference", () => {
    expect(monnifyTransactionReference({ product: { reference: "MNFY|9|20240102" } }))
      .toBe("MNFY|9|20240102");
  });

  it("returns null when the payload carries no Monnify id", () => {
    // The webhook's eventData has only the merchant `paymentReference`, which
    // a refund will not accept — so this must be null, not the wrong string.
    expect(monnifyTransactionReference({ paymentReference: "u2gas-abc" })).toBeNull();
    expect(monnifyTransactionReference(undefined)).toBeNull();
    expect(monnifyTransactionReference({ transactionReference: "" })).toBeNull();
  });
});

describe("refund eligibility", () => {
  it("allows a bank transfer, the only method Monnify refunds", () => {
    expect(monnifyRefundable("ACCOUNT_TRANSFER")).toBe(true);
    expect(monnifyRefundable("account_transfer")).toBe(true);
  });

  it("refuses a card, which Monnify answers with R2", () => {
    // "Refund not permitted for specified transaction — Refund is currently
    // only possible for payments via Account_Transfer." No wallet balance
    // makes this work, so it must be refused before the gateway is called.
    expect(monnifyRefundable("CARD")).toBe(false);
    expect(monnifyRefundable("card")).toBe(false);
  });

  it("refuses the other collection channels too", () => {
    expect(monnifyRefundable("USSD")).toBe(false);
    expect(monnifyRefundable("PHONE_NUMBER")).toBe(false);
    expect(monnifyRefundable("DIRECT_DEBIT")).toBe(false);
  });

  it("allows an unknown method, leaving the gateway as the authority", () => {
    // A payload that does not say how the customer paid must not block a
    // refund that would have gone through.
    expect(monnifyRefundable(null)).toBe(true);
    expect(monnifyRefundable(undefined)).toBe(true);
    expect(monnifyRefundable("")).toBe(true);
    expect(monnifyRefundable(42)).toBe(true);
  });
});
