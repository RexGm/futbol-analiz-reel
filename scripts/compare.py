#!/usr/bin/env python3
"""Referans video ile bizim render'ı aynı anlarda yan yana koyar (birebir kopyada kontrol için).

Kullanım:
  python3 compare.py <referans.mp4> <bizim.mp4> -o work/compare.png [--at 0.5,1.2,3] [--every 1.0]
                     [--offset 0.0] [--diff]

  --at      karşılaştırılacak saniyeler (referans zamanı). Verilmezse --every ile düzenli aralık.
  --offset  bizim videomuz referansa göre kaç sn kaymış (bizim = referans + offset).
  --diff    üçüncü sütun olarak fark görüntüsü (beyaz = farklı).

Çıktı: her satır bir an: [referans | bizim | (fark)], solda zaman etiketi. Read ile bak.
Gerekli: ffmpeg, Pillow.
"""
import argparse
import json
import subprocess
import tempfile
from pathlib import Path


def duration(p):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", p],
                         capture_output=True, text=True).stdout
    return float(json.loads(out)["format"]["duration"])


def grab(video, t, dst, height):
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{max(0, t):.3f}", "-i", video, "-frames:v", "1",
                    "-vf", f"scale=-2:{height}", dst], check=False)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("ref")
    ap.add_argument("ours")
    ap.add_argument("-o", "--output", default="compare.png")
    ap.add_argument("--at", default="")
    ap.add_argument("--every", type=float, default=1.0)
    ap.add_argument("--offset", type=float, default=0.0)
    ap.add_argument("--height", type=int, default=480)
    ap.add_argument("--diff", action="store_true")
    a = ap.parse_args()

    from PIL import Image, ImageChops, ImageDraw

    if a.at:
        times = [float(x) for x in a.at.split(",")]
    else:
        d = min(duration(a.ref), duration(a.ours) - a.offset)
        times, t = [], 0.0
        while t < d:
            times.append(round(t, 3))
            t += a.every
    rows = []
    with tempfile.TemporaryDirectory() as tmp:
        for i, t in enumerate(times):
            r, o = f"{tmp}/r{i}.png", f"{tmp}/o{i}.png"
            grab(a.ref, t, r, a.height)
            grab(a.ours, t + a.offset, o, a.height)
            if not (Path(r).exists() and Path(o).exists()):
                continue
            ri, oi = Image.open(r).convert("RGB"), Image.open(o).convert("RGB")
            oi = oi.resize(ri.size)
            cells = [ri, oi]
            if a.diff:
                cells.append(ImageChops.difference(ri, oi).convert("L").point(lambda v: 255 if v > 40 else 0).convert("RGB"))
            row = Image.new("RGB", (sum(c.width for c in cells) + 8 * len(cells), ri.height), (60, 60, 60))
            x = 0
            for c in cells:
                row.paste(c, (x, 0))
                x += c.width + 8
            ImageDraw.Draw(row).text((6, 6), f"{t:.2f}s", fill="yellow")
            rows.append(row)
    if not rows:
        raise SystemExit("Kare alınamadı")
    W = max(r.width for r in rows)
    sheet = Image.new("RGB", (W, sum(r.height + 8 for r in rows)), (60, 60, 60))
    y = 0
    for r in rows:
        sheet.paste(r, (0, y))
        y += r.height + 8
    sheet.save(a.output)
    print(a.output)


if __name__ == "__main__":
    main()
