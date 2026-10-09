"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "./api";

export interface AsyncState<T> {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
  /** Re-run the loader. */
  reload: () => void;
  /** Replace the data locally after a mutation, without a refetch. */
  mutate: (data: T | null) => void;
}

/**
 * A small data hook: load once, expose loading/error/data, reload on demand.
 *
 * Deliberately not a cache. Every screen here is behind a session and reads
 * its own small payload, so a shared cache adds invalidation bugs without a
 * measurable win. The one thing it does guard is the stale-response race: a
 * reload that lands after a newer one must not overwrite it, and an unmount
 * must not set state.
 */
export function useAsync<T>(
  loader: () => Promise<T>,
  deps: unknown[] = [],
  options: { enabled?: boolean } = {},
): AsyncState<T> {
  const enabled = options.enabled ?? true;
  const [nonce, setNonce] = useState(0);

  // The identity of the current request. Deriving `loading` from whether the
  // latest result carries this key avoids a synchronous setState inside the
  // fetch effect; a stale response is simply dropped by its own `active` flag.
  const key = JSON.stringify([enabled, nonce, deps]);
  const [result, setResult] = useState<{
    key: string;
    data: T | null;
    error: ApiError | null;
  } | null>(null);

  const loaderRef = useRef(loader);
  // Sync the latest loader outside render so a reload never captures a stale
  // closure. Declared before the fetch effect so it runs first on every commit.
  useEffect(() => {
    loaderRef.current = loader;
  });

  useEffect(() => {
    if (!enabled) return;
    let active = true;

    loaderRef
      .current()
      .then((data) => {
        if (active) setResult({ key, data, error: null });
      })
      .catch((e) => {
        if (!active) return;
        setResult({
          key,
          data: null,
          error:
            e instanceof ApiError
              ? e
              : new ApiError("INTERNAL", 500, "SOMETHING WENT WRONG"),
        });
      });

    return () => {
      active = false;
    };
  }, [enabled, key]);

  const loading = enabled && result?.key !== key;
  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const mutate = useCallback(
    (next: T | null) => setResult({ key, data: next, error: null }),
    [key],
  );

  return {
    data: result?.data ?? null,
    error: loading ? null : (result?.error ?? null),
    loading,
    reload,
    mutate,
  };
}

/**
 * Run a mutation with its own pending/error state.
 *
 * The thrown ApiError is returned to the caller too, because the screens show
 * the server's own copy — `message` is written for the interface.
 */
export function useMutation<Args extends unknown[], Result>(
  fn: (...args: Args) => Promise<Result>,
) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const fnRef = useRef(fn);
  // Keep the latest mutation fn without touching the ref during render.
  useEffect(() => {
    fnRef.current = fn;
  });

  const run = useCallback(async (...args: Args): Promise<Result | undefined> => {
    setPending(true);
    setError(null);
    try {
      return await fnRef.current(...args);
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e
          : new ApiError("INTERNAL", 500, "SOMETHING WENT WRONG"),
      );
      return undefined;
    } finally {
      setPending(false);
    }
  }, []);

  return { run, pending, error, reset: () => setError(null) };
}
