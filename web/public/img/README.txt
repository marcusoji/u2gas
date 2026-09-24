U2GAS scanner glyphs
====================

  thumb-up.webp     halftone thumbs-up, scanner success state   320x320, alpha
  thumb-down.webp   halftone thumbs-down, scanner failure state 320x320, alpha

Both are in place.

Provenance: exported from Figma as "TWO TONE THUMBS UP/DOWN.jpg". JPEG cannot
carry transparency, so those files had the alpha flattened into a visible grey
checkerboard. The alpha was reconstructed by flood-filling the checkerboard
from the four corners — connectivity-based, so the black halftone dots inside
the sticker were untouched while the background was cleared.

Encoded lossless: at this size lossy WebP smears the halftone dots against the
alpha edge, and lossless costs only a few KB more.

If you re-export from Figma, export as PNG rather than JPEG and the alpha will
survive. To redo the reconstruction from a JPEG:

    convert "TWO TONE THUMBS UP.jpg" -alpha set -fuzz 12% \
      -fill none -draw "color 0,0 floodfill" \
      -fill none -draw "color 999,0 floodfill" \
      -fill none -draw "color 0,999 floodfill" \
      -fill none -draw "color 999,999 floodfill" \
      -trim +repage -resize 320x320 \
      -background none -gravity center -extent 320x320 thumb-up.png
    cwebp -lossless -alpha_q 100 thumb-up.png -o thumb-up.webp

Also supplied but not used: "Frame 124/125 image.mp4", animated versions of the
same glyphs. The scanner result is a single state, not a loop, and a 1.6MB
video on the success path would cost more than the entire JS budget. Kept out
of the build deliberately — revisit only if the design calls for motion there.

STILL NEEDED
------------
u2-script.woff in ../fonts — the handwriting face for names on profile
screens. See ../fonts/README.txt.
