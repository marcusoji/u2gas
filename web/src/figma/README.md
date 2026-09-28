# The app's visual layer

`web/src/figma/` carries the live U2-GAS Figma file's artboards as the exact
markup the screens render — 61 of them. The **live Figma file is the only
design source**: there is no committed HTML snapshot, and nothing is generated
from one. The artboards here were taken from the file
(`v4xgWC0Q0wtSKmAff3EOzU`, page `u2`) through the Figma MCP, and that file is
where every future change is made and re-read.

This exists because the app and the screens used to be two drawings of the same
design, kept in step by hand. They drifted: corrections made while matching the
file (the gauge's 91 tick lines, the tank's chamber colour, the 40% fade on an
unavailable item, the opened notification rows, the product cut-outs) landed in
the screens and not in the app.

## Using it

```tsx
import { FigmaScreen } from "../figma/FigmaScreen";

<FigmaScreen
  node="1:251"                                  // HOME
  values={{ "1:296": `${home.available_kg}KG` }} // live text, by node id
/>
```

`values` replaces the **text** of the element carrying that node id. Every
measurement, colour and effect stays exactly as the file draws it — live data
can never restyle the design.

## Keeping it in step with Figma

There is no generator to run. To change a screen:

1. Change it in the live Figma file.
2. Re-read the frame through the Figma MCP (same file key) and update the
   matching module in `screens/` (and `artboards.ts` / `assets.ts`) by hand.
3. Compare the app's render against the live frame. When a leaf's text, colour,
   geometry or `visible` flag moved, follow it.

Nothing should hand-edit a `screens/*.ts` module without a matching live-file
change, and the file is the only thing that decides what "correct" means.

## What this does not do

It carries the design, not the behaviour. Routes still own state, data loading
and interaction; they render an artboard and bind values into it. Interactive
controls (the keypad, the cart steppers) remain React components on top —
styled by `styles/figma.css`, which is the artboards' own stylesheet.
