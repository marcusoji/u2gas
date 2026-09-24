import { useRef, useState } from "react";
import { useImageCompressor } from "../lib/useImageCompressor";
import { ApiError } from "../lib/api";
import { Stamp } from "./primitives";

/**
 * Pick a picture, compress it in the worker, hand back the blob.
 *
 * Compression happens on the device before anything is sent. A phone camera
 * produces 3–6MB per shot; on depot wi-fi that is the difference between an
 * upload that finishes and one the user gives up on. The worker keeps the
 * main thread free so the button does not feel stuck while it runs.
 *
 * This component does not upload. It hands the caller a compressed blob and
 * a preview, because the avatar and product paths post to different endpoints
 * with different permissions.
 */
export function ImagePicker({
  onPicked,
  label = "CHOOSE A PICTURE",
  preview,
  shape = "square",
  size = 142,
  busy = false,
}: {
  onPicked: (blob: Blob, previewUrl: string) => void;
  label?: string;
  preview?: string | null;
  shape?: "square" | "circle";
  size?: number;
  busy?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const { compress } = useImageCompressor();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [local, setLocal] = useState<string | null>(null);

  async function pick(file: File) {
    setError(null);
    setWorking(true);
    try {
      const result = await compress(file);
      const url = URL.createObjectURL(result.blob);
      setLocal(url);
      onPicked(result.blob, url);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "WE COULDN'T READ THAT PICTURE");
    } finally {
      setWorking(false);
    }
  }

  const shown = local ?? preview ?? null;
  const disabled = working || busy;

  return (
    <div className="stack is-tight" style={{ alignItems: "center" }}>
      <button
        onClick={() => input.current?.click()}
        disabled={disabled}
        aria-label={label}
        style={{
          width: size,
          height: size,
          padding: 0,
          border: shown ? "1px solid rgba(0,0,0,.2)" : "1px dashed var(--blue-soft)",
          borderRadius: shape === "circle" ? "50%" : 0,
          background: shown ? "var(--ink)" : "var(--field)",
          overflow: "hidden",
          display: "grid",
          placeItems: "center",
          opacity: disabled ? 0.6 : 1,
        }}
      >
        {shown ? (
          <img src={shown} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <span style={{
            fontSize: "var(--t-caption)", color: "var(--blue-soft)",
            letterSpacing: "var(--track)", textAlign: "center", padding: "0 10px",
          }}>
            {working ? "SHRINKING" : label}
          </span>
        )}
      </button>

      {/* Hidden rather than styled, so the OS picker behaves normally.
          capture is left off deliberately: staff often photograph stock in
          advance, and forcing the camera would block choosing from the roll. */}
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void pick(f);
          e.target.value = "";
        }}
      />

      {shown && !disabled && (
        <button
          onClick={() => input.current?.click()}
          style={{
            background: "none", border: "none", color: "var(--blue-faint)",
            fontSize: "var(--t-micro)", padding: "var(--s-2) 0",
          }}
        >
          CHANGE IT
        </button>
      )}

      {error && <Stamp>{error}</Stamp>}
    </div>
  );
}
