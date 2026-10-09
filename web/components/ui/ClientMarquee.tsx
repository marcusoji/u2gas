"use client";

import { useSyncExternalStore, type ComponentProps } from "react";
import MarqueeSlider from "@abundiko/react-marquee";

/**
 * SSR-safe wrapper around `@abundiko/react-marquee`.
 *
 * The library names its keyframes with `Math.random()` *during render*
 * (`randomUID()` in its `useMemo`), so the server and the client produce
 * different animation names for the same node. React sees two different
 * `<style>` children and throws a hydration mismatch on every screen that
 * draws a ticker, which makes it regenerate the whole subtree on the client.
 *
 * Mounting the slider only after hydration keeps the server output and the
 * first client render identical (both empty), so hydration is clean; the
 * animation then starts on the next tick. The box it sits in reserves the
 * space, so there is no layout shift.
 */
export default function ClientMarquee(
  props: ComponentProps<typeof MarqueeSlider>,
) {
  // `false` on the server and the first client render, `true` thereafter —
  // the documented hydration-safe way to branch on "are we on the client".
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  if (!mounted) return null;
  return <MarqueeSlider {...props} />;
}
