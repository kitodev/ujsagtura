"""A térkép saját erőforrásainak előállítása (egyszer kell futtatni, az eredmény a repóban van):

- assets/map/glyphs-0-255.pbf, glyphs-9984-10239.pbf: betűkép (SDF) a címjelölők számaihoz és a ✓ jelhez
  (DejaVu Sans Bold – szabad licenc). Így a térképnek nem kell külső betűszerver, internet nélkül is működik.
- assets/map/arrow.png: a saját helyzet nyila.

Használat: python3 scripts/make-map-assets.py [betűtípus.ttf]
"""

import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy.ndimage import distance_transform_edt

FONT = sys.argv[1] if len(sys.argv) > 1 else "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
STACK = "UjsagturaBold"
SIZE = 24  # a MapLibre betűképei 24 px-esek
BUFFER = 3
RADIUS = 8
CUTOFF = 0.25
SCALE = 4  # nagyobb felbontású rajz, majd átlagolás (simább élek)
# a második tartományból csak a pipa kell
ONLY_SYMBOLS = {0x2713, 0x2714}
OUT = Path(__file__).resolve().parent.parent / "assets" / "map"


# ——— protobuf (glyphs.proto) kézzel ———
def varint(n: int) -> bytes:
    out = bytearray()
    while True:
        b = n & 0x7F
        n >>= 7
        if n:
            out.append(b | 0x80)
        else:
            out.append(b)
            return bytes(out)


def key(field: int, wire: int) -> bytes:
    return varint((field << 3) | wire)


def f_uint(field: int, v: int) -> bytes:
    return key(field, 0) + varint(v)


def f_sint(field: int, v: int) -> bytes:
    return key(field, 0) + varint((v << 1) ^ (v >> 31) if v < 0 else v << 1)


def f_bytes(field: int, b: bytes) -> bytes:
    return key(field, 2) + varint(len(b)) + b


def sdf(font_big: ImageFont.FreeTypeFont, ch: str, w: int, h: int, x0: int, y0: int) -> bytes:
    bw, bh = (w + 2 * BUFFER) * SCALE, (h + 2 * BUFFER) * SCALE
    img = Image.new("L", (bw, bh), 0)
    ImageDraw.Draw(img).text(((BUFFER - x0) * SCALE, (BUFFER - y0) * SCALE), ch, font=font_big, fill=255, anchor="ls")
    inside = np.array(img) > 127
    d = (distance_transform_edt(~inside) - distance_transform_edt(inside)) / SCALE  # kívül pozitív
    d = d.reshape(h + 2 * BUFFER, SCALE, w + 2 * BUFFER, SCALE).mean(axis=(1, 3))
    v = np.clip(np.round(255 - 255 * (d / RADIUS + CUTOFF)), 0, 255).astype(np.uint8)
    return v.tobytes()


def glyph(font, font_big, ascent: int, code: int) -> bytes | None:
    ch = chr(code)
    if code != 32 and not font.getmask(ch).getbbox():
        return None
    x0, y0, x1, y1 = font.getbbox(ch, anchor="ls")
    advance = round(font.getlength(ch))
    if code == 32 or x1 <= x0 or y1 <= y0:
        return f_uint(1, code) + f_uint(3, 0) + f_uint(4, 0) + f_sint(5, 0) + f_sint(6, -ascent) + f_uint(7, advance)
    w, h = x1 - x0, y1 - y0
    return (
        f_uint(1, code)
        + f_bytes(2, sdf(font_big, ch, w, h, x0, y0))
        + f_uint(3, w)
        + f_uint(4, h)
        + f_sint(5, x0)
        + f_sint(6, -y0 - ascent)
        + f_uint(7, advance)
    )


def glyph_range(start: int) -> bytes:
    font = ImageFont.truetype(FONT, SIZE)
    font_big = ImageFont.truetype(FONT, SIZE * SCALE)
    ascent = font.getmetrics()[0]
    rng = f"{start}-{start + 255}"
    body = f_bytes(1, STACK.encode()) + f_bytes(2, rng.encode())
    for code in range(start, start + 256):
        if code < 32 or 127 <= code < 160:
            continue
        if start > 255 and code not in ONLY_SYMBOLS:
            continue
        g = glyph(font, font_big, ascent, code)
        if g:
            body += f_bytes(3, g)
    return f_bytes(1, body)


def arrow() -> None:
    s = 64
    img = Image.new("RGBA", (s * 4, s * 4), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    c = s * 2
    d.ellipse((c - 104, c - 104, c + 104, c + 104), fill=(26, 115, 232, 255), outline=(255, 255, 255, 255), width=20)
    d.polygon([(c, c - 70), (c + 50, c + 55), (c, c + 28), (c - 50, c + 55)], fill=(255, 255, 255, 255))
    img.resize((s, s), Image.LANCZOS).save(OUT / "arrow.png")


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for start in (0, 9984):
        (OUT / f"glyphs-{start}-{start + 255}.pbf").write_bytes(glyph_range(start))
    arrow()
    print("kész:", sorted(p.name for p in OUT.iterdir()))
