import { useCallback, useEffect, useRef } from "react";

export interface Compressed {
  blob: Blob;
  width: number;
  height: number;
  bytes: number;
}

const MESSAGES: Record<string, string> = {
  UNSUPPORTED_IMAGE: "USE A JPEG, PNG OR WEBP",
  FILE_TOO_LARGE: "THAT PICTURE IS TOO BIG",
  IMAGE_DECODE_FAILED: "WE COULDN'T READ THAT PICTURE",
};

/**
 * One worker per component, reused across files. Spawning a fresh worker per
 * image costs a WASM-free but still real startup on every slot, which is
 * exactly the stall the three-slot form was meant to avoid.
 */
export function useImageCompressor() {
  const workerRef = useRef<Worker | null>(null);
  const pending = useRef(new Map<string, {
    resolve: (v: Compressed) => void;
    reject: (e: Error) => void;
  }>());

  useEffect(() => {
    const worker = new Worker(
      new URL("../workers/compress.worker.ts", import.meta.url),
      { type: "module" },
    );

    worker.onmessage = (e: MessageEvent) => {
      const { id, ok, blob, width, height, bytes, code } = e.data;
      const entry = pending.current.get(id);
      if (!entry) return;
      pending.current.delete(id);

      if (ok) entry.resolve({ blob, width, height, bytes });
      else entry.reject(new Error(MESSAGES[code] ?? "WE COULDN'T READ THAT PICTURE"));
    };

    worker.onerror = () => {
      for (const [, entry] of pending.current) {
        entry.reject(new Error("WE COULDN'T READ THAT PICTURE"));
      }
      pending.current.clear();
    };

    workerRef.current = worker;
    return () => { worker.terminate(); workerRef.current = null; };
  }, []);

  const compress = useCallback((file: File): Promise<Compressed> => {
    return new Promise((resolve, reject) => {
      const worker = workerRef.current;
      if (!worker) { reject(new Error("WE COULDN'T READ THAT PICTURE")); return; }

      const id = crypto.randomUUID();
      pending.current.set(id, { resolve, reject });
      worker.postMessage({ id, file });
    });
  }, []);

  /** Compress several at once — the three bundle slots go through here. */
  const compressAll = useCallback(
    (files: File[]) => Promise.all(files.map(compress)),
    [compress],
  );

  return { compress, compressAll };
}
