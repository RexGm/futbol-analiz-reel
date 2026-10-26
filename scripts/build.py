#!/usr/bin/env python3
"""story.json -> HyperFrames projesi (+ ses miksi) -> MP4.

Kullanım:
  python3 build.py <story.json> --out <proje_klasoru> [--voice none|say|edge|elevenlabs|piper]
                   [--voice-name ...] [--rate ...] [--render] [--quality draft|looks|delivery]
                   [--snapshots 1.0,5.2,...]

Adımlar:
  1. Seslendirme (voice != none): her altyazının `vo` (yoksa ekrandaki metin) metni okunur, süresi ölçülür.
  2. Zamanlama: altyazı süresi = VO süresi + boşluk; ses yoksa okuma hızından tahmin.
  3. Proje: index.html + story.js + engine (fontlar, gsap) kopyalanır. Kendi başına çalışır.
  4. Ses miksi: VO + sentez SFX (whoosh/impact/pop) + (ops.) müzik, VO altında ducking, -14 LUFS.
  5. --render: `npx hyperframes render` ile sessiz video, sonra ses ile mux -> <out>/output/<ad>.mp4
"""
import argparse
import json
import math
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SKILL = HERE.parent
ENGINE = SKILL / "assets" / "engine"
sys.path.insert(0, str(HERE))
import tts  # noqa: E402

SR = 48000
VISUALS = {"score-hook", "shot-map", "stat-duel", "stamp", "timeline", "lineup", "bars",
           "panel-stack", "pins", "pitch-dim", "cta", "none"}


def tr_upper(s):
    return s.replace("i", "İ").replace("ı", "I").upper()


def cap_text(cap):
    lines = cap.get("lines") or [cap.get("text", "")]
    return " ".join(l if isinstance(l, str) else l.get("text", "") for l in lines)


def spoken(cap):
    """VO metni: `vo` alanı varsa o, yoksa ekrandaki yazı (küçük harfe çevrilmiş)."""
    if cap.get("vo") is not None:
        return cap["vo"]
    t = cap_text(cap)
    return t.replace("İ", "i").replace("I", "ı").lower()


def est_duration(text, wps):
    words = len(re.findall(r"\S+", text))
    return max(1.5, words / wps + 0.55)


def build_timing(story, voice, voice_name, rate, cache_dir):
    t = 0.0
    vo_clips = []
    wps = story.get("readingSpeed", 2.7)  # kelime/sn (ses yokken)
    gap = story.get("capGap", 0.22)
    for si, sc in enumerate(story["scenes"]):
        if sc.get("type", "none") not in VISUALS:
            raise SystemExit(f"Sahne {si}: bilinmeyen type '{sc.get('type')}'. Geçerli: {sorted(VISUALS)}")
        sc["t"] = round(t, 3)
        lead = sc.get("lead", 0.25 if si else 0.15)  # sahne açılışı ile ilk altyazı arası
        ct = t + lead
        for cap in sc.get("caps", []):
            text = spoken(cap)
            if voice != "none" and text.strip():
                wav, d = tts.synth_cached(voice, text, cache_dir, voice_name, rate, story.get("voiceOptions"))
                vo_clips.append((ct + 0.05, wav))
                dur = d + gap + cap.get("hold", 0)
            else:
                dur = cap.get("dur") or est_duration(text, wps) + cap.get("hold", 0)
            cap["t"], cap["d"] = round(ct, 3), round(dur, 3)
            ct += dur
        end = ct + sc.get("tail", 0.35)
        if not sc.get("caps"):
            end = t + sc.get("dur", 3.0)
        sc["d"] = round(max(end - t, sc.get("minDur", 0)), 3)
        t += sc["d"]
    story["duration"] = round(t + story.get("outro", 0.6), 3)
    return vo_clips


# ---------------- audio ----------------
def np():
    import numpy
    return numpy


def load_wav(path):
    n = np()
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-f", "f32le", "-ac", "1", "-ar", str(SR), "-"],
                         capture_output=True, check=True).stdout
    return n.frombuffer(raw, dtype=n.float32).copy()


def synth_sfx():
    """Lisans derdi olmayan basit SFX'ler (numpy sentez)."""
    n = np()
    rs = n.random.default_rng(7)
    out = {}
    # whoosh: band geçiren gürültü + yükselen/düşen zarf
    L = int(SR * 0.55); x = rs.standard_normal(L).astype(n.float32)
    k = n.linspace(0, 1, L); env = n.sin(n.pi * k) ** 2
    # basit tek kutuplu alçak geçiren, kesim zamanla değişir
    y = n.zeros(L, n.float32); a_s = 0.02 + 0.25 * env
    for i in range(1, L):
        y[i] = y[i - 1] + a_s[i] * (x[i] - y[i - 1])
    out["whoosh"] = (y * env * 0.9 / (n.abs(y).max() + 1e-6)).astype(n.float32)
    # impact: düşük sinüs düşüşü + tık
    L = int(SR * 0.7); tt = n.arange(L) / SR
    f = 95 * n.exp(-tt * 5) + 38
    ph = 2 * n.pi * n.cumsum(f) / SR
    imp = n.sin(ph) * n.exp(-tt * 5.5)
    imp[:400] += rs.standard_normal(400) * n.exp(-n.arange(400) / 60) * 0.6
    out["impact"] = (imp / n.abs(imp).max()).astype(n.float32)
    # pop: kısa yükselen tik
    L = int(SR * 0.09); tt = n.arange(L) / SR
    pop = n.sin(2 * n.pi * (900 + 5000 * tt) * tt) * n.exp(-tt * 55)
    out["pop"] = (pop / n.abs(pop).max() * 0.8).astype(n.float32)
    return out


def sfx_cues(story):
    cues = []
    for si, sc in enumerate(story["scenes"]):
        caps = sc.get("caps", [])
        steps = [c["t"] for c in caps]
        if si > 0:
            cues.append((sc["t"] - 0.12, "whoosh", 0.35))
        tp = sc.get("type")
        p = sc.get("params", {})
        if tp == "score-hook":
            st = steps[p["scoreStep"]] if p.get("scoreStep") is not None and steps else sc["t"] + 0.25
            cues.append((st, "impact", 0.6))
            for i, g in enumerate(p.get("goals", [])):
                gs = steps[g["step"]] if g.get("step") is not None and steps else sc["t"] + 0.7
                cues.append((gs + i * 0.45 + 0.42, "pop", 0.35))
        elif tp == "stamp":
            for i, c in enumerate(p.get("cards", [])):
                k = c.get("step", i)
                if k < len(steps):
                    cues.append((steps[k] + 0.4, "impact", 0.55))
        elif tp in ("panel-stack", "bars", "stat-duel"):
            for c in steps[1:]:
                cues.append((c, "pop", 0.18))
        elif tp == "cta" and steps:
            cues.append((steps[-1] + 0.6, "pop", 0.4))
    return cues


def mix_audio(story, vo_clips, out_dir, music=None, sfx=True):
    n = np()
    total = int(SR * (story["duration"] + 0.5))
    vo = n.zeros(total, n.float32)
    for t, wav in vo_clips:
        a = load_wav(wav); i = int(t * SR)
        vo[i:i + len(a)] += a[: max(0, total - i)]
    fx = n.zeros(total, n.float32)
    if sfx:
        bank = synth_sfx()
        for t, name, g in sfx_cues(story):
            a = bank[name] * g; i = max(0, int(t * SR))
            fx[i:i + len(a)] += a[: max(0, total - i)]
    mus = n.zeros(total, n.float32)
    if music:
        m = load_wav(music)
        reps = math.ceil(total / len(m))
        mus = n.tile(m, reps)[:total] * 0.22
        # ducking: VO varken -10 dB, yumuşak zarf
        act = (n.abs(vo) > 0.01).astype(n.float32)
        win = int(SR * 0.25)
        ker = n.ones(win, n.float32) / win
        act = n.clip(n.convolve(act, ker, mode="same") * 4, 0, 1)
        mus *= 1 - 0.68 * act
        fade = int(SR * 1.2)
        mus[:fade] *= n.linspace(0, 1, fade); mus[-fade:] *= n.linspace(1, 0, fade)
    if not vo_clips and not sfx and music is None:
        return None
    mix = vo + fx * (0.5 if vo_clips else 0.8) + mus
    peak = n.abs(mix).max() or 1
    mix = (mix / peak * 0.89).astype(n.float32)
    raw = out_dir / "audio" / "mix_raw.f32"
    raw.parent.mkdir(parents=True, exist_ok=True)
    mix.tofile(raw)
    wav = out_dir / "audio" / "mix.wav"
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", str(raw),
                    "-af", "loudnorm=I=-14:TP=-1:LRA=11", "-ar", str(SR), "-ac", "2", str(wav)], check=True)
    raw.unlink()
    return wav


# ---------------- project ----------------
HTML = """<!doctype html>
<html lang="tr"><head><meta charset="utf-8">
<meta name="viewport" content="width=1080,height=1920">
<title>{title}</title>
<link rel="stylesheet" href="engine/style.css">
</head><body>
<div id="stage" data-composition-id="root" data-width="1080" data-height="1920" data-duration="{duration}" data-fps="30"></div>
<script src="engine/gsap.min.js"></script>
<script src="story.js"></script>
<script src="engine/engine.js"></script>
<script>window.__timelines = window.__timelines || {}; window.__timelines["root"] = window.__timelines.root;</script>
</body></html>
"""


def write_project(story, out):
    out.mkdir(parents=True, exist_ok=True)
    if (out / "engine").exists():
        shutil.rmtree(out / "engine")
    shutil.copytree(ENGINE, out / "engine")
    (out / "story.js").write_text("window.STORY = " + json.dumps(story, ensure_ascii=False, indent=1) + ";\n", encoding="utf-8")
    (out / "story.resolved.json").write_text(json.dumps(story, ensure_ascii=False, indent=1), encoding="utf-8")
    (out / "index.html").write_text(HTML.replace("{title}", story.get("title", "reel")).replace("{duration}", str(story["duration"])), encoding="utf-8")


def render(out, name, quality, audio):
    outdir = out / "output"; outdir.mkdir(exist_ok=True)
    silent = outdir / f"{name}_silent.mp4"
    cmd = ["npx", "--yes", "hyperframes", "render", "-o", str(silent), "-q", quality, "--fps", "30"]
    print("render:", " ".join(cmd), flush=True)
    r = subprocess.run(cmd, cwd=out, env=browser_env())
    if r.returncode != 0:
        raise SystemExit("hyperframes render başarısız")
    final = outdir / f"{name}.mp4"
    if audio:
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(silent), "-i", str(audio), "-map", "0:v", "-map", "1:a",
                        "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", str(final)], check=True)
        silent.unlink()
    else:
        os.replace(silent, final)
    print("ÇIKTI:", final)
    return final


def browser_env():
    """HYPERFRAMES_BROWSER_PATH yoksa Playwright'ın kurduğu Chromium'u dener (ör. claude.ai kod ortamı)."""
    env = dict(os.environ)
    if not env.get("HYPERFRAMES_BROWSER_PATH"):
        roots = [env.get("PLAYWRIGHT_BROWSERS_PATH"), "/opt/pw-browsers", str(Path.home() / ".cache" / "ms-playwright")]
        for root in filter(None, roots):
            hits = sorted(Path(root).glob("chromium-*/chrome-linux*/chrome"))
            if hits:
                env["HYPERFRAMES_BROWSER_PATH"] = str(hits[-1])
                break
    return env


def snapshots(out, times):
    cmd = ["npx", "--yes", "hyperframes", "snapshot", "--at", ",".join(f"{t:.2f}" for t in times)]
    subprocess.run(cmd, cwd=out, env=browser_env())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("story")
    ap.add_argument("--out", required=True)
    ap.add_argument("--voice", default=None, help="none|say|edge|elevenlabs|piper (story.voice.engine'i ezer)")
    ap.add_argument("--voice-name")
    ap.add_argument("--rate")
    ap.add_argument("--music", help="müzik dosyası (lisansı sende olan)")
    ap.add_argument("--no-sfx", action="store_true")
    ap.add_argument("--render", action="store_true")
    ap.add_argument("--quality", default="looks")
    ap.add_argument("--snapshots", help="virgüllü saniyeler veya 'auto'")
    a = ap.parse_args()

    story = json.loads(Path(a.story).read_text(encoding="utf-8"))
    out = Path(a.out).resolve()
    vcfg = story.get("voice", {})
    voice = a.voice or vcfg.get("engine", "none")
    voice_name = a.voice_name or vcfg.get("name")
    rate = a.rate or vcfg.get("rate")
    cache = Path.home() / ".cache" / "futbol-analiz-reel" / "vo"
    vo_clips = build_timing(story, voice, voice_name, rate, cache)
    write_project(story, out)
    audio_cfg = story.get("audio", {})
    sfx = not a.no_sfx and audio_cfg.get("sfx", voice != "none")
    music = a.music or audio_cfg.get("music")
    audio = mix_audio(story, vo_clips, out, music=music, sfx=sfx)
    print(f"Süre: {story['duration']:.1f} sn · sahne: {len(story['scenes'])} · ses: {voice}{' +sfx' if sfx else ''}{' +müzik' if music else ''}")
    for i, sc in enumerate(story["scenes"]):
        print(f"  {sc['t']:6.2f}–{sc['t'] + sc['d']:6.2f}  {sc['type']:<12} " + " | ".join(cap_text(c) for c in sc.get("caps", [])))
    if a.snapshots:
        ts = ([sc["t"] + sc["d"] * 0.8 for sc in story["scenes"]] if a.snapshots == "auto"
              else [float(x) for x in a.snapshots.split(",")])
        snapshots(out, ts)
    if a.render:
        render(out, story.get("slug", "reel"), a.quality, audio)


if __name__ == "__main__":
    main()
