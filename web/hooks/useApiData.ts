"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { GasStock, Notification } from "@/types";
import { ApiError } from "@/lib/api";
import {
  getHome,
  getNotifications,
  getShop,
  type HomePayload,
} from "@/lib/endpoints";
import type { Product } from "@/types";

interface AsyncState<T> {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
  reload: () => void;
}

/** Shared fetch-on-mount helper so every hook reports state the same way. */
function useAsync<T>(load: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  // Keep the latest loader without making it a dependency: callers pass an
  // inline closure, and depending on it would refetch on every render. The ref
  // is written from an effect so it is never updated during render.
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadRef
      .current()
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((cause) => {
        if (!cancelled) {
          setError(
            cause instanceof ApiError
              ? cause
              : new ApiError({
                  code: "INTERNAL",
                  status: 0,
                  message: cause instanceof Error ? cause.message : "FAILED",
                }),
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data, error, loading, reload };
}

/** Rate, availability and unread count for the customer terminal. */
export function useHome() {
  return useAsync<HomePayload>(() => getHome(), []);
}

/** The shop grid. `q` narrows the listing server-side. */
export function useShop(params: { category?: string; q?: string } = {}) {
  const key = `${params.category ?? ""}:${params.q ?? ""}`;
  return useAsync<{ items: Product[] }>(() => getShop(params), [key]);
}

/** The signed-in person's notifications. */
export function useNotifications(enabled: boolean) {
  return useAsync<{ notifications: Notification[] }>(
    () => (enabled ? getNotifications() : Promise.resolve({ notifications: [] })),
    [enabled],
  );
}

/** Project the home payload onto the GasStock shape the terminal already takes. */
export function homeToStock(home: HomePayload | null): GasStock | undefined {
  if (!home) return undefined;
  return {
    total_received_kg: home.available_kg,
    reserved_kg: 0,
    deducted_kg: 0,
    available_kg: home.available_kg,
    rate_kobo_per_kg: home.rate_kobo_per_kg,
    fill_percent: 0,
    days_remaining: null,
    updated_at: new Date().toISOString(),
  };
}
