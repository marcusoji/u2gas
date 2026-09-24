import type { MiddlewareHandler } from "hono";
import type { AppEnv, Ctx } from "../types";
import { appError } from "../lib/errors";

/**
 * Rate limiting (spec 45).
 *
 * Backed by a Durable Object so the count is consistent across colos. A
 * module-scope Map would reset whenever the isolate recycles and would count
 * separately in every data centre, which enforces nothing.
 *
 * Sliding window, because a fixed window lets an attacker send 2x the limit
 * across a boundary.
 */
export class RateLimiter implements DurableObject {
  private hits: number[] = [];

  constructor(private state: DurableObjectState) {}

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const limit = Number(url.searchParams.get("limit") ?? 60);
    const windowMs = Number(url.searchParams.get("window") ?? 60_000);
    const now = Date.now();

    this.hits = (await this.state.storage.get<number[]>("hits")) ?? [];
    this.hits = this.hits.filter((t) => now - t < windowMs);

    if (this.hits.length >= limit) {
      const retryAfter = Math.ceil((windowMs - (now - this.hits[0])) / 1000);
      return Response.json({ allowed: false, retryAfter }, { status: 200 });
    }

    this.hits.push(now);
    await this.state.storage.put("hits", this.hits);
    // Let the entry fall out of storage on its own rather than accumulating.
    await this.state.storage.setAlarm(now + windowMs);

    return Response.json({ allowed: true, remaining: limit - this.hits.length });
  }

  async alarm() {
    await this.state.storage.deleteAll();
  }
}

/**
 * @param bucket  logical name, so login attempts and scans count separately
 * @param limit   requests allowed per window
 * @param windowMs window length
 * @param keyFn   what to count by. Defaults to caller id, falling back to IP.
 */
export function rateLimit(
  bucket: string,
  limit: number,
  windowMs = 60_000,
  keyFn?: (c: Ctx) => string,
): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const key = keyFn
      ? keyFn(c)
      : c.get("caller")?.profileId ?? c.req.header("CF-Connecting-IP") ?? "anon";

    const id = c.env.RATE_LIMITER.idFromName(`${bucket}:${key}`);
    const stub = c.env.RATE_LIMITER.get(id);

    const res = await stub.fetch(
      `https://rl/?limit=${limit}&window=${windowMs}`,
    );
    const { allowed, retryAfter } = await res.json() as any;

    if (!allowed) {
      c.header("Retry-After", String(retryAfter ?? 60));
      throw appError("RATE_LIMITED", { retry_after_seconds: retryAfter });
    }
    await next();
  };
}
