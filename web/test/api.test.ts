import { describe, expect, it, beforeEach, vi, afterEach } from "vitest";

/**
 * The API client's contract with the Worker.
 *
 * These cover the three ways the client and the Worker had drifted: a query
 * value the Worker reads as *repeated* parameters being comma-joined, an image
 * ref returned raw where the screens expect a URL, and a validation refusal
 * whose field detail the client threw away.
 *
 * `fetch` is stubbed — it is the network boundary, not application logic — and
 * everything else is the real module.
 */

const fetchMock = vi.fn();
(globalThis as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;

const { apiFetch, ApiError, mediaUrl } = await import("../lib/api");
const { getCompleteTheSet, normalizeProduct } = await import("../lib/endpoints");

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function lastUrl(): string {
  return String(fetchMock.mock.calls.at(-1)?.[0]);
}

beforeEach(() => {
  fetchMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("query serialisation", () => {
  it("emits repeated parameters for an array, not a comma-joined value", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, bundles: [] }));
    await getCompleteTheSet(["id-one", "id-two"]);

    const url = new URL(lastUrl());
    expect(url.searchParams.getAll("in")).toEqual(["id-one", "id-two"]);
  });

  it("carries the guest token as ?t=", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, order: {} }));
    await apiFetch("/orders/abc", { guestToken: "g-123" });
    expect(new URL(lastUrl()).searchParams.get("t")).toBe("g-123");
  });

  it("drops empty values rather than sending a blank parameter", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    await apiFetch("/catalog/shop", { query: { q: "", category: undefined } });
    const url = new URL(lastUrl());
    expect(url.searchParams.has("q")).toBe(false);
    expect(url.searchParams.has("category")).toBe(false);
  });
});

describe("error envelope", () => {
  it("maps detail.fields onto fieldErrors for form highlighting", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          ok: false,
          error: {
            code: "VALIDATION_FAILED",
            message: "CHECK THE HIGHLIGHTED FIELDS",
            detail: {
              fields: [
                { field: "phone", message: "Enter a valid number" },
                { field: "address", message: "Too short" },
              ],
            },
          },
        },
        400,
      ),
    );

    const error = await apiFetch("/orders/gas", { method: "POST", body: {} }).catch(
      (e) => e,
    );
    expect(error).toBeInstanceOf(ApiError);
    expect((error as InstanceType<typeof ApiError>).code).toBe("VALIDATION_FAILED");
    expect((error as InstanceType<typeof ApiError>).fieldErrors).toEqual({
      phone: "Enter a valid number",
      address: "Too short",
    });
  });

  it("treats a 5xx and RETRY as retryable", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ok: false, error: { code: "INTERNAL", message: "x" } }, 500),
    );
    const five = await apiFetch("/x").catch((e) => e);
    expect((five as InstanceType<typeof ApiError>).isRetryable).toBe(true);

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ok: false, error: { code: "RETRY", message: "busy" } }, 503),
    );
    const retry = await apiFetch("/x").catch((e) => e);
    expect((retry as InstanceType<typeof ApiError>).isRetryable).toBe(true);
  });

  it("reports a network failure as a retryable NETWORK error", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const error = await apiFetch("/x").catch((e) => e);
    expect((error as InstanceType<typeof ApiError>).code).toBe("NETWORK");
    expect((error as InstanceType<typeof ApiError>).status).toBe(0);
  });
});

describe("product image normalisation", () => {
  it("turns an image_asset ref into a URL", () => {
    const product = normalizeProduct({
      product_id: "p1",
      name: "Gas",
      image_asset: { base_path: "products/gas.webp", width: 800, height: 800 },
    });
    expect(product.image).toBe(mediaUrl("products/gas.webp"));
    expect(product.image).not.toBe("[object Object]");
  });

  it("accepts a bare image_path too", () => {
    const product = normalizeProduct({ product_id: "p2", image_path: "x/y.webp" });
    expect(product.image).toBe(mediaUrl("x/y.webp"));
  });

  it("yields an empty string when there is no picture", () => {
    expect(normalizeProduct({ product_id: "p3" }).image).toBe("");
  });

  it("passes an absolute URL through untouched", () => {
    const product = normalizeProduct({
      product_id: "p4",
      image_asset: "https://cdn.example.com/a.webp",
    });
    expect(product.image).toBe("https://cdn.example.com/a.webp");
  });
});
