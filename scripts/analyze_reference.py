#!/usr/bin/env python3
"""Referans videoyu kurgu analizi için parçalara ayırır.

Kullanım:
    python3 analyze_reference.py <video> <cikti_klasoru> [--fps 2] [--scene 0.25] [--transcribe]

Üretilenler (cikti_klasoru içinde):
    probe.json        çözünürlük, fps, süre
    scenes.json       kesme zamanları + plan süreleri + özet istatistik
    keyframes/        her planın orta karesi (sNNN_<zaman>.jpg)
    sheets/           zaman damgalı kontak sayfaları (6x2 ızgara)
    palette.json      baskın renkler (hex + oran)
    audio.json        loudness (LUFS) ve sessizlik aralıkları
    transcript.json   (--transcribe ile, hyperframes kuruluysa) kelime zamanlı transkript
    report.md         hepsinin okunabilir özeti; analiz buradan başlar

Sadece ffmpeg/ffprobe, Pillow ve numpy gerekir.
"""
import argparse
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path


def run(cmd, check=True):
    return subprocess.run(cmd, capture_output=True, text=True, check=check)


def probe(video):
    out = run(["ffprobe", "-v", "error", "-print_format", "json", "-show_format", "-show_streams", str(video)]).stdout
    data = json.loads(out)
    v = next((s for s in data["streams"] if s["codec_type"] == "video"), {})
    num, den = (v.get("r_frame_rate", "30/1").split("/") + ["1"])[:2]
    return {
        "width": v.get("width"),
        "height": v.get("height"),
        "fps": round(float(num) / float(den or 1), 3),
        "duration": round(float(data["format"]["duration"]), 3),
        "has_audio": any(s["codec_type"] == "audio" for s in data["streams"]),
    }


def detect_scenes(video, threshold, duration):
    # scdet skoru 0-100 arası; threshold 0-1 verildi -> 0-100'e çevir
    res = run(["ffmpeg", "-hide_banner", "-i", str(video), "-vf", f"scdet=threshold={threshold*100}", "-an", "-f", "null", "-"], check=False)
    raw = sorted({round(float(m.group(1)), 3) for m in re.finditer(r"lavfi\.scd\.time:\s*([\d.]+)", res.stderr)})
    times = []  # geçiş animasyonlarında art arda gelen tespitleri tek kesme say
    for t in raw:
        if not times or t - times[-1] > 0.2:
            times.append(t)
    bounds = [0.0] + [t for t in times if 0.05 < t < duration - 0.05] + [duration]
    shots = [{"index": i, "start": bounds[i], "end": bounds[i + 1], "length": round(bounds[i + 1] - bounds[i], 3)}
             for i in range(len(bounds) - 1)]
    lengths = sorted(s["length"] for s in shots)
    stats = {
        "cuts": len(shots) - 1,
        "shots": len(shots),
        "avg_shot": round(sum(lengths) / len(lengths), 2) if lengths else 0,
        "median_shot": lengths[len(lengths) // 2] if lengths else 0,
        "shortest": lengths[0] if lengths else 0,
        "longest": lengths[-1] if lengths else 0,
        "cuts_per_10s": round((len(shots) - 1) / duration * 10, 2) if duration else 0,
    }
    return shots, stats


def keyframes(video, shots, outdir):
    outdir.mkdir(parents=True, exist_ok=True)
    for s in shots:
        t = (s["start"] + s["end"]) / 2
        name = f"s{s['index']:03d}_{t:06.2f}.jpg"
        run(["ffmpeg", "-v", "error", "-y", "-ss", f"{t:.3f}", "-i", str(video), "-frames:v", "1", "-vf", "scale=360:-2", "-q:v", "4", str(outdir / name)], check=False)


def find_font():
    for p in ["/System/Library/Fonts/Supplemental/Arial.ttf", "/System/Library/Fonts/Helvetica.ttc",
              "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"]:
        if Path(p).exists():
            return p
    return None


def contact_sheets(video, fps, outdir):
    outdir.mkdir(parents=True, exist_ok=True)
    font = find_font()
    label = ""
    if font:
        label = (f",drawtext=fontfile='{font}':text='%{{pts\\:hms}}':x=6:y=6:fontsize=22:"
                 "fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=4")
    vf = f"fps={fps},scale=240:-2{label},tile=6x2:padding=4:color=black"
    run(["ffmpeg", "-v", "error", "-y", "-i", str(video), "-vf", vf, "-q:v", "3", str(outdir / "sheet_%02d.jpg")], check=False)


def palette(video, outpath, n=8):
    try:
        from PIL import Image
        import numpy as np
    except ImportError:
        return []
    tmp = outpath.parent / "_frames"
    tmp.mkdir(exist_ok=True)
    run(["ffmpeg", "-v", "error", "-y", "-i", str(video), "-vf", "fps=1,scale=96:-2", str(tmp / "f_%04d.png")], check=False)
    px = []
    for f in sorted(tmp.glob("*.png")):
        px.append(np.asarray(Image.open(f).convert("RGB")).reshape(-1, 3))
    shutil.rmtree(tmp, ignore_errors=True)
    if not px:
        return []
    data = np.concatenate(px).astype(np.float32)
    rng = np.random.default_rng(0)
    if len(data) > 60000:
        data = data[rng.choice(len(data), 60000, replace=False)]
    cent = data[rng.choice(len(data), n, replace=False)]
    for _ in range(25):  # basit k-means
        d = ((data[:, None, :] - cent[None, :, :]) ** 2).sum(-1)
        lab = d.argmin(1)
        for k in range(n):
            if (lab == k).any():
                cent[k] = data[lab == k].mean(0)
    counts = np.bincount(lab, minlength=n) / len(lab)
    order = counts.argsort()[::-1]
    return [{"hex": "#%02X%02X%02X" % tuple(int(c) for c in cent[k]), "share": round(float(counts[k]), 3)} for k in order]


def audio_stats(video):
    res = run(["ffmpeg", "-hide_banner", "-i", str(video), "-af", "ebur128=peak=true,silencedetect=n=-35dB:d=0.25", "-f", "null", "-"], check=False)
    err = res.stderr
    lufs = re.findall(r"I:\s+(-?[\d.]+) LUFS", err)
    peak = re.findall(r"Peak:\s+(-?[\d.]+) dBFS", err)
    starts = [float(x) for x in re.findall(r"silence_start: (-?[\d.]+)", err)]
    ends = [float(x) for x in re.findall(r"silence_end: (-?[\d.]+)", err)]
    silences = [{"start": round(s, 2), "end": round(e, 2)} for s, e in zip(starts, ends)]
    return {"integrated_lufs": float(lufs[-1]) if lufs else None,
            "true_peak_dbfs": float(peak[-1]) if peak else None,
            "silences": silences}


def transcribe(video, outdir):
    if not shutil.which("npx"):
        return None
    res = run(["npx", "-y", "hyperframes@latest", "transcribe", str(video), "-d", str(outdir), "--json"], check=False)
    try:
        return json.loads(res.stdout)
    except Exception:
        return {"error": res.stderr[-2000:]}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("outdir")
    ap.add_argument("--fps", type=float, default=2.0, help="kontak sayfası kare/sn")
    ap.add_argument("--scene", type=float, default=0.06, help="kesme eşiği 0-1 (düşük = daha hassas; aynı kadraj jump cut'ları için 0.04-0.08)")
    ap.add_argument("--transcribe", action="store_true")
    a = ap.parse_args()

    video, out = Path(a.video).resolve(), Path(a.outdir).resolve()
    out.mkdir(parents=True, exist_ok=True)
    info = probe(video)
    (out / "probe.json").write_text(json.dumps(info, indent=2))
    shots, stats = detect_scenes(video, a.scene, info["duration"])
    (out / "scenes.json").write_text(json.dumps({"stats": stats, "shots": shots}, indent=2))
    keyframes(video, shots, out / "keyframes")
    contact_sheets(video, a.fps, out / "sheets")
    pal = palette(video, out / "palette.json")
    (out / "palette.json").write_text(json.dumps(pal, indent=2))
    aud = audio_stats(video) if info["has_audio"] else {}
    (out / "audio.json").write_text(json.dumps(aud, indent=2))
    tr = transcribe(video, out) if a.transcribe else None
    if tr is not None:
        (out / "transcript.json").write_text(json.dumps(tr, indent=2, ensure_ascii=False))

    lines = [f"# Referans analizi: {video.name}", "",
             f"- Çözünürlük: {info['width']}x{info['height']} @ {info['fps']} fps, süre {info['duration']} sn",
             f"- Plan sayısı: {stats['shots']} (kesme {stats['cuts']}), 10 sn'de {stats['cuts_per_10s']} kesme",
             f"- Plan süresi: ort. {stats['avg_shot']} sn, medyan {stats['median_shot']} sn, en kısa {stats['shortest']} sn, en uzun {stats['longest']} sn",
             f"- Ses: {aud.get('integrated_lufs')} LUFS, tepe {aud.get('true_peak_dbfs')} dBFS, {len(aud.get('silences', []))} sessizlik",
             "", "## Baskın renkler", ""]
    lines += [f"- {p['hex']} ({p['share']*100:.1f}%)" for p in pal]
    lines += ["", "## Planlar", "", "| # | başlangıç | bitiş | süre |", "|---|---|---|---|"]
    lines += [f"| {s['index']} | {s['start']:.2f} | {s['end']:.2f} | {s['length']:.2f} |" for s in shots]
    lines += ["", "## Sonraki adım",
              "sheets/ ve keyframes/ içindeki görselleri Read ile tek tek incele; stili",
              "references/reference-style.md formatında yeni bir profil olarak yaz."]
    (out / "report.md").write_text("\n".join(lines))
    print(out / "report.md")


if __name__ == "__main__":
    sys.exit(main())
