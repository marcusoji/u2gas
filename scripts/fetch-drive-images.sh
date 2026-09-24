#!/usr/bin/env bash
# Download the full-quality originals from the project's Drive folder into
# web/public/img/drive/. Run from the repo root with network access:
#   bash scripts/fetch-drive-images.sh
# The folder is shared 'anyone with the link', so no login is needed.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p web/public/img/drive

curl -fsSL "https://drive.google.com/uc?export=download&id=1DWC9tMjjn_jPBhh8763pUtLVZKXsn5V1" -o "web/public/img/drive/image-3.png" && echo "ok  image 3"
curl -fsSL "https://drive.google.com/uc?export=download&id=1pqXVCCzr-0daGkaSGs9R_kFIfsN3pkRi" -o "web/public/img/drive/image-4.png" && echo "ok  image 4"
curl -fsSL "https://drive.google.com/uc?export=download&id=1JBQJJAnbz_XFi7LVwBx1-1Jk7PoMJqhZ" -o "web/public/img/drive/image-4-1.png" && echo "ok  image 4-1"
curl -fsSL "https://drive.google.com/uc?export=download&id=1dHZyX-R3Exl_56kH1uY-lItweNgLHjkc" -o "web/public/img/drive/image-5.png" && echo "ok  image 5"
curl -fsSL "https://drive.google.com/uc?export=download&id=1E2hSmseOrelKQudP_ZTQ8yLJiYy2Hu-M" -o "web/public/img/drive/image-7.png" && echo "ok  image 7"
curl -fsSL "https://drive.google.com/uc?export=download&id=18EzShicBBvVc4drZeKsvrdMHneT6YSoQ" -o "web/public/img/drive/image-9.png" && echo "ok  image 9"
curl -fsSL "https://drive.google.com/uc?export=download&id=11D_1Tajz0JqFlXqbMGr7bnLLxct7ioiR" -o "web/public/img/drive/image-10.png" && echo "ok  image 10"
curl -fsSL "https://drive.google.com/uc?export=download&id=1lvIQUuhZEiWhev5z5on9btvzsMYkZhvc" -o "web/public/img/drive/image-11.png" && echo "ok  image 11"
curl -fsSL "https://drive.google.com/uc?export=download&id=1t_Tkk3U3OpfdAVWP3CSIdQUeP980UOOk" -o "web/public/img/drive/image-13.png" && echo "ok  image 13"
curl -fsSL "https://drive.google.com/uc?export=download&id=18BX9in0BQoViG1bGc3mR1U46NZTCTiBm" -o "web/public/img/drive/shopping-basket-3-1.png" && echo "ok  shopping basket 3 1"
curl -fsSL "https://drive.google.com/uc?export=download&id=12yCqdRzyMlUtle_WTRK9AermyIrqi3wa" -o "web/public/img/drive/two-tone-thumbs-up-1.png" && echo "ok  TWO TONE THUMBS UP 1"
curl -fsSL "https://drive.google.com/uc?export=download&id=1dZA3LdJMfmjNQv5kRq0fF_n5SIAXlMv0" -o "web/public/img/drive/two-tone-thumbs-up-2.png" && echo "ok  TWO TONE THUMBS UP 2"

echo "Done. Check sizes with: file web/public/img/drive/*.png"
