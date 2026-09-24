/**
 * Error handling (spec 51).
 *
 * The database raises machine codes like INSUFFICIENT_GAS with a JSON DETAIL.
 * This file is the only place that turns those into something a person reads.
 * Routes never write user-facing copy themselves.
 *
 * Messages are written for the interface's voice: short, uppercase where they
 * land in a stamp, and specific about what to do next. They never apologise
 * and they never say "something went wrong".
 */

export class AppError extends Error {
  constructor(
    public code: string,
    public status: number,
    public userMessage: string,
    public detail: Record<string, unknown> = {},
  ) {
    super(code);
    this.name = "AppError";
  }
}

type Mapping = {
  status: number;
  /** Receives the DETAIL payload so the copy can carry real numbers. */
  message: (d: Record<string, any>) => string;
};

const naira = (kobo: number) =>
  "₦" + Math.round(kobo / 100).toLocaleString("en-NG");

const MAP: Record<string, Mapping> = {
  // --- Stock ---------------------------------------------------------------
  INSUFFICIENT_GAS: {
    status: 409,
    message: (d) =>
      Number(d.available_kg) > 0
        ? `ONLY ${d.available_kg}KG LEFT`
        : `NO GAS IN THE DEPOT RIGHT NOW`,
  },
  INSUFFICIENT_STOCK: {
    status: 409,
    // Spec 27: name the exact item and the exact shortfall.
    message: (d) =>
      Number(d.available) > 0
        ? `ONLY ${d.available} OF ${d.requested} ${d.product_name} LEFT`
        : `${d.product_name} IS OUT OF STOCK`,
  },
  PRODUCT_NOT_FOUND: { status: 404, message: () => "THAT ITEM IS NO LONGER SOLD" },
  BUNDLE_NOT_FOUND: { status: 404, message: () => "THAT BUNDLE IS NO LONGER SOLD" },
  DEPOT_NOT_FOUND: { status: 404, message: () => "DEPOT NOT FOUND" },
  INVALID_QUANTITY: { status: 400, message: () => "ENTER A QUANTITY ABOVE ZERO" },
  EMPTY_ORDER: { status: 400, message: () => "YOUR BASKET IS EMPTY" },

  // --- Delivery ------------------------------------------------------------
  ZONE_REQUIRED: { status: 400, message: () => "CHOOSE A DELIVERY ADDRESS FIRST" },
  ZONE_NOT_SERVED: { status: 400, message: () => "WE DON'T DELIVER HERE YET" },

  // --- Payment -------------------------------------------------------------
  AMOUNT_MISMATCH: {
    status: 402,
    message: (d) =>
      d.direction === "over"
        ? `THAT PAID ${naira(d.received_kobo)} — THIS ORDER IS ${naira(d.expected_kobo)}`
        : `THIS ORDER COSTS ${naira(d.expected_kobo)}`,
  },
  CURRENCY_MISMATCH: {
    status: 400,
    message: () => "WE ONLY TAKE NAIRA",
  },
  UNDERPAID: {
    status: 402,
    message: (d) => `THIS ORDER COSTS ${naira(d.expected_kobo)}`,
  },
  INSUFFICIENT_TENDER: {
    status: 400,
    message: (d) =>
      `TENDERED ${naira(d.tendered_kobo)} — ORDER IS ${naira(d.expected_kobo)}`,
  },
  ORDER_ALREADY_CLOSED: {
    status: 409,
    message: (d) =>
      d.order_status === "expired"
        ? "THIS HOLD EXPIRED — ORDER AGAIN"
        : "THIS ORDER WAS CANCELLED",
  },
  PAYSTACK_INIT_FAILED: {
    status: 502,
    message: () => "THE PAYMENT PAGE DIDN'T OPEN — TRY AGAIN",
  },
  PAYSTACK_REFUND_FAILED: {
    status: 502,
    message: (d) => d.reason
      ? `PAYSTACK REFUSED THE REFUND — ${String(d.reason).toUpperCase()}`
      : "THE REFUND DIDN'T GO THROUGH — IT'S STILL IN THE QUEUE",
  },
  REFUND_NOT_AUTOMATABLE: {
    status: 409,
    message: () => "THIS ONE WASN'T PAID ONLINE — REFUND IT IN PERSON",
  },
  REFUND_NOT_CLAIMABLE: {
    status: 409,
    message: (d) => `THIS REFUND IS ALREADY ${String(d.status ?? "").toUpperCase()}`,
  },
  REFUND_NOT_FOUND: { status: 404, message: () => "NO SUCH REFUND" },

  // Raised by SQL. Without a mapping these fall through to INTERNAL and the
  // customer or driver is told "we couldn't finish that", which is both
  // untrue and unactionable.
  DELIVERY_NOT_STARTABLE: {
    status: 409,
    message: (d) => d.status === "en_route"
      ? "YOU'RE ALREADY ON THIS ONE"
      : `THIS DROP IS ${String(d.status ?? "").toUpperCase().replace(/_/g, " ")}`,
  },
  INVALID_OUTCOME: {
    status: 400,
    message: () => "CHOOSE TRY AGAIN OR BACK TO DEPOT",
  },
  INVALID_RATE: {
    status: 400,
    message: () => "THE RATE HAS TO BE MORE THAN ZERO",
  },
  IMAGE_NOT_FOUND: {
    status: 404,
    message: () => "THAT PICTURE ISN'T THERE ANY MORE — ADD IT AGAIN",
  },
  INVALID_REFUND_STATUS: {
    status: 400,
    message: () => "THAT ISN'T SOMETHING A REFUND CAN BE SET TO",
  },
  INVALID_RELEASE_STATUS: {
    status: 400,
    message: () => "THAT ISN'T SOMETHING A RESERVATION CAN BE SET TO",
  },
  NOTHING_TO_REFUND: { status: 409, message: () => "NOTHING WAS PAID ON THIS ORDER" },
  PAYSTACK_VERIFY_FAILED: {
    status: 502,
    message: () => "WE COULDN'T CONFIRM THAT PAYMENT YET",
  },

  // --- QR ------------------------------------------------------------------
  QR_INVALID: { status: 404, message: () => "THIS CODE ISN'T OURS" },
  QR_EXPIRED: { status: 410, message: () => "THIS CODE HAS EXPIRED" },
  QR_ALREADY_SCANNED: {
    status: 409,
    message: (d) => `ALREADY SCANNED${d.order_number ? ` — ${d.order_number}` : ""}`,
  },
  ALREADY_FULFILLED: { status: 409, message: () => "THIS ORDER WAS ALREADY COLLECTED" },
  UNPAID: {
    status: 402,
    message: (d) => `NOT PAID — ${naira(d.total_kobo ?? 0)} DUE`,
  },
  WRONG_FULFILLMENT_TYPE: {
    status: 409,
    message: (d) =>
      d.actual === "delivery" ? "THIS IS A DELIVERY, NOT A PICK-UP"
                              : "THIS IS A PICK-UP, NOT A DELIVERY",
  },
  ORDER_NOT_FOUND: { status: 404, message: () => "NO SUCH ORDER" },
  ADDRESS_NOT_FOUND: { status: 404, message: () => "THAT ADDRESS IS GONE" },
  TOO_MANY_ADDRESSES: { status: 409, message: () => "THAT'S AS MANY ADDRESSES AS WE KEEP" },

  // --- Bundles -------------------------------------------------------------
  INCOMPATIBLE_ITEMS: {
    status: 409,
    // The rule's own message is written for this stamp, so use it verbatim.
    message: (d) => String(d.message ?? "THESE ITEMS DON'T FIT TOGETHER"),
  },
  BUNDLE_SIZE: { status: 400, message: () => "A BUNDLE HOLDS TWO OR THREE ITEMS" },
  BUNDLE_DUPLICATE_ITEM: { status: 400, message: () => "THAT ITEM IS ALREADY IN THIS BUNDLE" },
  OVERRIDE_FORBIDDEN: { status: 403, message: () => "ONLY A MANAGER CAN OVERRIDE THIS" },
  OVERRIDE_REASON_REQUIRED: {
    status: 400,
    message: () => "WRITE WHY YOU'RE OVERRIDING THIS — AT LEAST TEN CHARACTERS",
  },

  // --- Uploads -------------------------------------------------------------
  FILE_TOO_LARGE: { status: 413, message: () => "THAT PICTURE IS TOO BIG" },
  UNSUPPORTED_IMAGE: { status: 415, message: () => "USE A JPEG, PNG OR WEBP" },
  IMAGE_DIMENSIONS: { status: 400, message: () => "THAT PICTURE IS TOO LARGE TO PROCESS" },
  IMAGE_DECODE_FAILED: { status: 400, message: () => "WE COULDN'T READ THAT PICTURE" },

  // --- Auth ----------------------------------------------------------------
  UNAUTHENTICATED: { status: 401, message: () => "LOG IN TO CONTINUE" },
  FORBIDDEN: { status: 403, message: () => "NOT YOUR DOOR" },
  // Distinct from FORBIDDEN on purpose: the account is allowed here, it just
  // has not been finished. Telling someone "not allowed" when an admin needs
  // to add one row sends them to the wrong person. (Item 4)
  STAFF_RECORD_MISSING: {
    status: 403,
    message: () => "YOUR TILL ACCESS ISN'T SET UP — ASK AN ADMIN TO ADD YOU AS STAFF",
  },
  STAFF_RECORD_INACTIVE: {
    status: 403,
    message: (d) => `YOUR STAFF ACCOUNT IS ${String(d.status ?? "INACTIVE").toUpperCase()}`,
  },
  DRIVER_RECORD_MISSING: {
    status: 403,
    message: () => "YOUR DRIVER PROFILE ISN'T SET UP — ASK AN ADMIN TO ADD YOU",
  },
  EMAIL_NOT_VERIFIED: { status: 403, message: () => "CHECK YOUR MAIL TO VERIFY FIRST" },
  RATE_LIMITED: { status: 429, message: () => "TOO MANY TRIES — WAIT A MOMENT" },

  // --- Generic -------------------------------------------------------------
  VALIDATION_FAILED: { status: 400, message: () => "CHECK THE HIGHLIGHTED FIELDS" },
  OVER_MAX_GAS: {
    status: 400,
    message: (d) => `${d.max_kg}KG IS THE MOST PER ORDER`,
  },
  IDEMPOTENCY_IN_PROGRESS: {
    status: 409,
    message: () => "THAT'S ALREADY GOING THROUGH — GIVE IT A SECOND",
  },
  IDEMPOTENCY_MISMATCH: {
    status: 422,
    message: () => "THAT REQUEST CHANGED MIDWAY — START AGAIN",
  },
  REFUND_PENDING: {
    status: 200,
    message: () => "REFUND REQUESTED — WAITING TO BE PROCESSED",
  },
  INTERNAL: { status: 500, message: () => "WE COULDN'T FINISH THAT — TRY AGAIN" },
};

/**
 * Turn a Supabase RPC error into an AppError.
 *
 * Postgres puts our raised MESSAGE into `err.message` and our JSON into
 * `err.details`. Constraint violations arrive as SQLSTATE codes instead, which
 * we translate rather than leak.
 */
export function fromDbError(err: any): AppError {
  const raw: string = err?.message ?? "";
  let detail: Record<string, unknown> = {};

  if (err?.details) {
    try {
      detail = JSON.parse(err.details);
    } catch {
      detail = { raw: err.details };
    }
  }

  // Our own raised codes.
  const known = Object.keys(MAP).find((k) => raw === k || raw.startsWith(k));
  if (known) {
    const m = MAP[known];
    return new AppError(known, m.status, m.message(detail as any), detail);
  }

  // Constraint names, for the cases where the last line of defence fires.
  if (err?.code === "23505") {
    if (raw.includes("payment_provider_reference")) {
      return new AppError("DUPLICATE_PAYMENT", 409, "THIS PAYMENT WAS ALREADY RECORDED");
    }
    return new AppError("DUPLICATE", 409, "THAT ALREADY EXISTS");
  }
  if (err?.code === "23514") {
    if (raw.includes("gas_never_oversold")) {
      return new AppError("INSUFFICIENT_GAS", 409, "NOT ENOUGH GAS IN THE DEPOT");
    }
    if (raw.includes("nonneg") || raw.includes("reserved_lte_stock")) {
      return new AppError("INSUFFICIENT_STOCK", 409, "NOT ENOUGH STOCK");
    }
    return new AppError("VALIDATION_FAILED", 400, MAP.VALIDATION_FAILED.message({}));
  }
  if (err?.code === "42501" || err?.code === "PGRST301") {
    return new AppError("FORBIDDEN", 403, MAP.FORBIDDEN.message({}));
  }
  if (err?.code === "40P01") {
    // Deadlock. Should be impossible given the lock ordering, but if it ever
    // happens the client should retry rather than see a 500.
    return new AppError("RETRY", 503, "BUSY — TRY THAT AGAIN");
  }

  return new AppError("INTERNAL", 500, MAP.INTERNAL.message({}), {});
}

export function appError(code: keyof typeof MAP, detail: Record<string, any> = {}) {
  const m = MAP[code] ?? MAP.INTERNAL;
  return new AppError(code, m.status, m.message(detail), detail);
}

/** The shape every failed response takes. Stack traces never appear here. */
export function errorBody(e: AppError, requestId: string) {
  return {
    ok: false as const,
    error: {
      code: e.code,
      message: e.userMessage,
      // Numbers the UI needs to render the state, e.g. available_kg for the
      // "TAKE 6KG" button. Never internal identifiers or SQL.
      detail: e.detail,
    },
    request_id: requestId,
  };
}
