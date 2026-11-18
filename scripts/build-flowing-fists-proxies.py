#!/usr/bin/env python3
"""Reproducible, non-generative crops from source-reported Flowing Fists photos.

Run after the dated source-audit photos have been reviewed. We do not invent
card artwork, upscale via generative AI or pass these images off as scans.
The outputs are suitable only for provisional test proxies.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "public/assets/flowing-fists-leaks/source-audit"
DEST = ROOT / "public/assets/flowing-fists-leaks/cards"
DEST.mkdir(parents=True, exist_ok=True)
AUDIT = {row["name"]: row for row in json.loads((SRC / "audit.json").read_text())}

CROPS = [
    {
        "slug": "mega-lucario-z-ex-111",
        "name": "Mega Lucario Z ex",
        "number": "111",
        "source": "darkdex-three-card.jpg",
        "rectangle": [177, 20, 480, 446],
        "set_code": "FLO",
        "status": "unconfirmed-leak",
    },
    {
        "slug": "mega-garchomp-z-ex-112",
        "name": "Mega Garchomp Z ex",
        "number": "112",
        "source": "darkdex-three-card.jpg",
        "rectangle": [525, 20, 828, 446],
        "set_code": "FLO",
        "status": "unconfirmed-leak; number provisional",
    },
    {
        "slug": "blastoise-083",
        "name": "Blastoise",
        "number": "083",
        "source": "darkdex-blastoise.jpg",
        "rectangle": [348, 20, 650, 446],
        "set_code": "FLO",
        "status": "unconfirmed-leak",
    },
    {
        "slug": "ninetales-082",
        "name": "Ninetales",
        "number": "082",
        "source": "kantopost-ninetales.jpg",
        "rectangle": [603, 29, 1332, 1047],
        "set_code": "FLO",
        "status": "unconfirmed-leak",
    },
]

manifest = {
    "schema": "tcg-lab-flowing-fists-proxy-images-v1",
    "artwork_status": "unconfirmed leaked card photographs; test proxy only",
    "output_size": [744, 1040],
    "source_note": "Individual card crops, not official scans. Raster resizing adds no image detail.",
    "cards": [],
}
for row in CROPS:
    source_info = AUDIT[row["source"]]
    path = SRC / row["source"]
    source_hash = hashlib.sha256(path.read_bytes()).hexdigest()
    assert source_hash == source_info["sha256"], f"Source image changed: {row['source']}"
    img = ImageOps.exif_transpose(Image.open(path)).convert("RGB")
    l, t, r, b = row["rectangle"]
    assert 0 <= l < r <= img.width and 0 <= t < b <= img.height
    crop = img.crop(row["rectangle"])
    assert 0.68 <= crop.width / crop.height <= 0.75, f"Not a card-shaped crop: {row['slug']}"
    # This is conventional bicubic image scaling, not AI enhancement.
    cropped = ImageOps.fit(crop, (744, 1040), Image.Resampling.LANCZOS, centering=(0.5, 0.5))
    output = DEST / (row["slug"] + ".jpg")
    cropped.save(output, format="JPEG", quality=93, subsampling=0, optimize=True)
    item = {
        "name": row["name"],
        "set_code": row["set_code"],
        "number": row["number"],
        "file": "cards/" + output.name,
        "sha256": hashlib.sha256(output.read_bytes()).hexdigest(),
        "size_bytes": output.stat().st_size,
        "image_dimensions": [744, 1040],
        "native_crop_dimensions": [crop.width, crop.height],
        "source_file": "source-audit/" + row["source"],
        "source_image_url": source_info["source_url"],
        "crop_rectangle": row["rectangle"],
        "status": row["status"],
        "print_quality": "readable-photo; visibly blurry; not a production scan",
    }
    manifest["cards"].append(item)
    print(f'BUILT {row["name"]} {row["number"]}: {crop.width}x{crop.height} native -> 744x1040 test proxy')
(DEST.parent / "manifest-v1.json").write_text(json.dumps(manifest, indent=2) + "\n")
print(f'PASS: {len(manifest["cards"])} exact-art provisional print images with source provenance')
