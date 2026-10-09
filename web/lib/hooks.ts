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
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [nonce, setNonce] = useState(0);

  // Monotonic id per request so a late response cannot clobber a newer one.
  const seq = useRef(0);

  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    const id = ++seq.current;
    let active = true;
    setLoading(true);
    setError(null);

    loaderRef
      .current()
      .then((result) => {
        if (!active || id !== seq.current) return;
        setData(result);
      })
      .catch((e) => {
        if (!active || id !== seq.current) return;
        setError(
          e instanceof ApiError
            ? e
            : new ApiError("INTERNAL", 500, "SOMETHING WENT WRONG"),
        );
      })
      .finally(() => {
        if (!active || id !== seq.current) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, nonce, ...deps]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const mutate = useCallback((next: T | null) => setData(next), []);

  return { data, error, loading, reload, mutate };
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
  fnRef.current = fn;

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
