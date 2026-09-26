import { mediaUrl } from "../lib/media";
import type { CartLine } from "../lib/cart";

/**
 * A basket row, as 1:1517 CART - ITEM UNAVAILABLE draws it.
 *
 * The drawing's rows are artwork, not markup: each is a 400x120 card of four
 * absolutely positioned children and the whole basket is one 356x516 bottle
 * illustration. There is no `data-node` to bind a real line into, so this is
 * the row template with the file's own measurements and type, painted over the
 * card boxes the artboard reserves. Change the drawing and this changes with
 * it — the same contract as `HistoryReceiptCard`.
 *
 * Drawn values, for reference:
 *   1:1543 / 1:1521 / 1:1563   card   400x120 at x=20, radius 32, 1px dashed
 *                                      rgba(0,0,0,.4), 4 4
 *   1:1551                     image  left 13.09, top 14.98, 60x90.75,
 *                                      rotate -4deg, drop-shadow 0 4px 10px
 *   1:1550                     name   left 80, top 43, 24px, -0.96px,
 *                                      line-height 20, #1317e4
 *   1:1559                     minus  left 307, top 44, 32x32 disc, #1e1e1e
 *   1:1553                     plus   left 351, top 44, 32x32 disc, #1317e4
 *   (the `6-pack` row's 1x badge) left 335, top 70, 24x20, 1px rgba(19,23,228,.4)
 *
 * The `+` disc is drawn once per row (1:1553, 1:1533, 1:1573) with the same
 * size and fill, so one template row can be repeated: the cards and discs are
 * identical and only the name, image and price differ.
 */
export function BasketLine({ line, onAdd, onRemove }: {
  line: CartLine;
  onAdd: () => void;
  onRemove: () => void;
}) {
  const src = mediaUrl(line.image_path, "thumb");
  return (
    <div className="basket-line">
      <div className="basket-thumb">
        {src ? <img src={src} alt="" /> : null}
      </div>
      <p className="basket-name">{line.name.toUpperCase()}</p>
      <button type="button" className="basket-disc is-minus" aria-label={`One less ${line.name}`}
              onClick={onRemove}>
        <span className="basket-bar" />
      </button>
      <button type="button" className="basket-disc is-plus" aria-label={`One more ${line.name}`}
              onClick={onAdd}>
        <span className="basket-bar" />
        <span className="basket-bar is-v" />
      </button>
      <span className="basket-qty">{line.quantity}x</span>
    </div>
  );
}
