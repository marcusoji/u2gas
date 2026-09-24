# The app's visual layer

`web/src/figma/` is generated from the HTML screens in `docs/` by
`build/gen_react.py`. Every artboard in the Figma file is here as the exact
markup the screens carry — 63 of them, byte for byte.

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

## Keeping them together

```
bash scripts/check-figma-parity.sh     # fails if the two have drifted
python3 build/gen_react.py             # regenerate after the screens change
```

Run the check in CI. If it fails, the screens changed and the app was not
regenerated — or somebody edited `web/src/figma/` by hand, which nothing should.

## What this does not do

It carries the design, not the behaviour. Routes still own state, data loading
and interaction; they render an artboard and bind values into it. Interactive
controls (the keypad, the cart steppers) remain React components on top —
styled by `styles/figma.css`, which is the screens' own stylesheet.
