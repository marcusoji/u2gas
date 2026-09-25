import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError, type ShopItem } from "../../lib/api";
import { BackButton } from "../../components/primitives";
import { FigmaRouteFrame } from "../../figma/FigmaRouteFrame";
import { mediaUrl } from "../../lib/media";

const IMAGE_NODES = [
  "1:1448", "1:1446", "1:1447", "1:1445",
  "1:1451", "1:1453", "1:1452", "1:1450",
];

const imageUrl = (basePath?: string | null) => mediaUrl(basePath, "grid");

export default function Shop() {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [items, setItems] = useState<ShopItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const query = params.get("q") ?? "";
  const category = params.get("category") ?? "";

  const load = useCallback(() => {
    setError(null);
    setItems(null);
    api.shop({ category: category || undefined, q: query || undefined })
      .then((r) => setItems(r.items))
      .catch((e: ApiError) => setError(e.message));
  }, [category, query]);

  useEffect(load, [load]);

  const images = useMemo(() => {
    const out: Record<string, string> = {};
    (items ?? []).slice(0, IMAGE_NODES.length).forEach((item, i) => {
      const src = imageUrl(item.image_path);
      if (src) out[IMAGE_NODES[i]] = src;
    });
    return out;
  }, [items]);

  // The heading (`1:1457`) and the price readout (`1:1460`) are drawn into the
  // artboard: the heading carries its own `<br>` and the readout is the rate,
  // not the result count. Both are containers, so writing a value into either
  // would replace the file's own markup with a single string — the heading lost
  // its line break and the readout grew past its 82px LED. The artwork already
  // says what it should, so nothing is substituted here.
  const values = undefined;

  const setQuery = (value: string) => {
    const next = new URLSearchParams(params);
    value ? next.set("q", value) : next.delete("q");
    setParams(next, { replace: true });
  };

  return (
    <div className="screen figma-route-scroll">
      <FigmaRouteFrame node="1:1438" values={values} images={images}>
        <BackButton to="/home" />
        {IMAGE_NODES.map((node, i) => {
          const item = items?.[i];
          return item ? (
            <button
              key={node}
              className="figma-route-interactive"
              style={slotStyle(i)}
              aria-label={`Open ${item.name}`}
              onClick={() => nav(`/shop/${item.kind}/${item.id}`)}
            />
          ) : null;
        })}
        <input
          aria-label="Search accessories"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setQuery("");
          }}
          className="figma-route-input"
          style={{ left: 326, top: 79, width: 94, height: 52, fontSize: 12 }}
          placeholder="SEARCH"
        />
      </FigmaRouteFrame>

      {error && <div className="error-state" role="alert">{error}</div>}
      {!error && !items && <div className="sr-only">Loading accessories…</div>}
      {items && items.length > IMAGE_NODES.length && (
        <div className="sr-only">Showing the first {IMAGE_NODES.length} accessories in the Figma artboard.</div>
      )}
    </div>
  );
}

function slotStyle(i: number): CSSProperties {
  const slots = [
    { left: 20, top: 215, width: 200, height: 240 },
    { left: 220, top: 215, width: 200, height: 240 },
    { left: 20, top: 470, width: 200, height: 260 },
    { left: 220, top: 470, width: 200, height: 260 },
    { left: 20, top: 760, width: 200, height: 240 },
    { left: 220, top: 760, width: 200, height: 240 },
    { left: 20, top: 1010, width: 200, height: 260 },
    { left: 220, top: 1010, width: 200, height: 260 },
  ];
  return slots[i] ?? slots[0];
}
