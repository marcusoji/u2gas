import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../types";
import { appError, AppError } from "../lib/errors";
import { rpc } from "../lib/db";
import { guestTokenHash, sha256Hex } from "../lib/crypto";

/**
 * Idempotency for unsafe operations.
 *
 * A double-tap, a mobile reconnect or an edge retry could create two orders
 * and reserve stock twice. The client sends an Idempotency-Key; the first
 * request stores its response, and a replay returns that response rather than
 * doing the work again.
 *
 * Migration 0019 widened the identity of a key from the key string alone to
 * (key, scope, caller, request hash). A key reused by a different person, for
 * a different endpoint, or with a different body is no longer treated as the
 * same request — matching on the key alone returned the first caller's
 * response, which is a cross-user data leak dressed up as a replay.
 */

/** What claim_idempotency returns. Exactly one of four states. */
type ClaimResult =
  | { state: "claimed"; reclaimed?: boolean }
  | { state: "replay"; response: unknown }
  | { state: "in_flight"; retry_after_seconds?: number }
  | { state: "conflict" };

export function idempotent(scope: string): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const key = c.req.header("Idempotency-Key");

    // Optional by design: a client that does not send one still works, it just
    // forfeits the protection.
    if (!key) return next();

    if (!/^[A-Za-z0-9_-]{8,128}$/.test(key)) {
      throw appError("VALIDATION_FAILED", {
        fields: [{ field: "Idempotency-Key", message: "Malformed key" }],
      });
    }

    const body = await c.req.raw.clone().text();
    const requestHash = await sha256Hex(body);

    // A guest has no profile, so the capability token they were issued at
    // checkout is what identifies them. Without it every anonymous caller
    // would share one identity and collide on a common key.
    const guestToken = c.req.query("t");
    // Same helper the order routes use, so the two can never drift apart and
    // hash the same token differently.
    const guestHash = guestToken
      ? await guestTokenHash(guestToken, c.env.QR_SIGNING_KEY)
      : null;

    // The scope has to travel with every call, or complete and release would
    // match a row belonging to a different endpoint.
    const identity = {
      p_key: key,
      p_scope: scope,
      p_profile_id: c.get("caller")?.profileId ?? null,
      p_guest_hash: guestHash,
    };

    const claim = await rpc<ClaimResult>(c.get("admin"), "claim_idempotency", {
      ...identity,
      p_request_hash: requestHash,
      p_lease_seconds: 60,
    });

    switch (claim.state) {
      case "replay":
        // The work was done before. Hand back exactly what it returned.
        c.header("Idempotency-Replayed", "true");
        return c.json(claim.response as any, 200);

      case "in_flight": {
        // Another worker holds a live lease. Nothing the customer did wrong,
        // and safe to retry once the lease expires.
        const retry = claim.retry_after_seconds ?? 2;
        c.header("Retry-After", String(retry));
        throw appError("IDEMPOTENCY_IN_PROGRESS", { retry_after_seconds: retry });
      }

      case "conflict":
        // Same key and caller, different body. Answering with the earlier
        // response would return the wrong order to the wrong request.
        // IDEMPOTENCY_MISMATCH rather than a generic VALIDATION_FAILED: 422
        // says the request was well formed but semantically wrong, and the
        // copy already written for it is clearer than a field error.
        throw appError("IDEMPOTENCY_MISMATCH", {
          fields: [{
            field: "Idempotency-Key",
            message: "This key was already used for a different request",
          }],
        });

      case "claimed":
        break;
    }

    try {
      await next();

      // Only a success is worth replaying. A 409 out of stock should be
      // re-evaluated on retry, because stock may have returned since.
      const ok = c.res.status >= 200 && c.res.status < 300;
      const payload = ok ? await c.res.clone().json().catch(() => null) : null;

      if (payload) {
        // waitUntil so storing the response never delays the customer. The
        // lease expires on its own if this never lands, so the key stays
        // reclaimable either way.
        c.executionCtx.waitUntil(
          rpc(c.get("admin"), "complete_idempotency", {
            ...identity,
            p_response: payload,
          }).catch(() => {}),
        );
      } else {
        // No body worth replaying, or a non-2xx. Free the key now rather than
        // making the customer wait out the lease.
        await rpc(c.get("admin"), "release_idempotency", identity)
          .catch(() => {});
      }
    } catch (err) {
      await rpc(c.get("admin"), "release_idempotency", identity).catch(() => {});
      throw err instanceof AppError ? err : appError("INTERNAL");
    }
  };
}
