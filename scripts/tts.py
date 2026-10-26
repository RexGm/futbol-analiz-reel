#!/usr/bin/env python3
"""Seslendirme (VO) üretimi — birden çok motor, aynı arayüz.

Motorlar:
  none        sessiz video (süreler okuma hızından tahmin edilir)
  say         macOS yerleşik `say` (Türkçe ses: Yelda). Ücretsiz, offline. Kalite: orta.
  edge        Microsoft Edge neural sesleri (pip edge-tts). Ücretsiz, internet ister.
              Türkçe: tr-TR-AhmetNeural (erkek), tr-TR-EmelNeural (kadın). Kalite: iyi.
  elevenlabs  ElevenLabs API (ELEVENLABS_API_KEY). Ücretli, en doğal; referans videodaki hisse en yakın.
  piper       Piper offline TTS (pip piper-tts + tr_TR model dosyası). Ücretsiz, offline. Kalite: orta.

Tek başına deneme:
  python3 tts.py --engine edge --voice tr-TR-AhmetNeural --text "Derbide skor bire bir." --out deneme.wav
"""
import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

DEFAULT_VOICES = {
    "say": "Yelda",
    "edge": "tr-TR-AhmetNeural",
    "elevenlabs": "pNInz6obpgDQGcFmaJgB",  # "Adam" — multilingual v2 ile Türkçe okur; kendi voice_id'ni ver
    "piper": str(Path.home() / ".cache/futbol-analiz-reel/piper/tr_TR-dfki-medium.onnx"),
}


def run(cmd, **kw):
    r = subprocess.run(cmd, capture_output=True, text=True, **kw)
    if r.returncode != 0:
        raise RuntimeError(f"Komut başarısız: {' '.join(map(str, cmd))}\n{r.stderr[-1500:]}")
    return r


def to_wav(src, dst, rate=48000):
    run(["ffmpeg", "-y", "-v", "error", "-i", str(src), "-ac", "1", "-ar", str(rate), str(dst)])


def duration(path):
    r = run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)])
    return float(r.stdout.strip())


def trim_silence(path):
    """Baş/son sessizliği kırp (TTS motorları 0.1–0.4 sn boşluk bırakır, ritmi bozar)."""
    tmp = str(path) + ".trim.wav"
    flt = ("silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.03,"
           "areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05,areverse")
    run(["ffmpeg", "-y", "-v", "error", "-i", str(path), "-af", flt, tmp])
    os.replace(tmp, path)


def synth(engine, text, out_wav, voice=None, rate=None, opts=None):
    """text -> out_wav (48k mono). Hata verirse RuntimeError fırlatır."""
    opts = opts or {}
    voice = voice or DEFAULT_VOICES.get(engine)
    out_wav = Path(out_wav)
    out_wav.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        if engine == "say":
            if not shutil.which("say"):
                raise RuntimeError("`say` yok — bu motor sadece macOS'ta çalışır.")
            cmd = ["say", "-v", voice, "-o", str(td / "a.aiff")]
            if rate:
                cmd += ["-r", str(rate)]
            run(cmd + [text])
            to_wav(td / "a.aiff", out_wav)
        elif engine == "edge":
            exe = shutil.which("edge-tts")
            base = [exe] if exe else [sys.executable, "-m", "edge_tts"]
            cmd = base + ["--voice", voice, "--text", text, "--write-media", str(td / "a.mp3")]
            if rate:
                cmd += [f"--rate={rate}"]  # örn. +8%
            if opts.get("pitch"):
                cmd += [f"--pitch={opts['pitch']}"]
            run(cmd)
            to_wav(td / "a.mp3", out_wav)
        elif engine == "elevenlabs":
            import urllib.request
            key = os.environ.get("ELEVENLABS_API_KEY")
            if not key:
                raise RuntimeError("ELEVENLABS_API_KEY ortam değişkeni yok.")
            body = json.dumps({
                "text": text,
                "model_id": opts.get("model", "eleven_multilingual_v2"),
                "voice_settings": {"stability": opts.get("stability", 0.45), "similarity_boost": 0.8,
                                   "style": opts.get("style", 0.35), "use_speaker_boost": True},
            }).encode()
            req = urllib.request.Request(
                f"https://api.elevenlabs.io/v1/text-to-speech/{voice}?output_format=mp3_44100_128",
                data=body, headers={"xi-api-key": key, "Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=120) as r:
                (td / "a.mp3").write_bytes(r.read())
            to_wav(td / "a.mp3", out_wav)
        elif engine == "piper":
            model = voice
            if not Path(model).exists():
                raise RuntimeError(f"Piper modeli yok: {model} — scripts/setup.sh --voice piper çalıştır.")
            exe = shutil.which("piper")
            base = [exe] if exe else [sys.executable, "-m", "piper"]
            cmd = base + ["--model", model, "--output_file", str(td / "a.wav")]
            if rate:
                cmd += ["--length_scale", str(rate)]  # <1 hızlı, >1 yavaş
            subprocess.run(cmd, input=text, text=True, capture_output=True, check=True)
            to_wav(td / "a.wav", out_wav)
        else:
            raise RuntimeError(f"Bilinmeyen motor: {engine}")
    trim_silence(out_wav)
    return duration(out_wav)


def synth_cached(engine, text, cache_dir, voice=None, rate=None, opts=None):
    key = hashlib.sha1(json.dumps([engine, voice, rate, opts, text], ensure_ascii=False).encode()).hexdigest()[:16]
    out = Path(cache_dir) / f"vo_{key}.wav"
    if out.exists():
        return out, duration(out)
    d = synth(engine, text, out, voice, rate, opts)
    return out, d


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--engine", required=True, choices=["say", "edge", "elevenlabs", "piper"])
    ap.add_argument("--voice")
    ap.add_argument("--rate")
    ap.add_argument("--text", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    d = synth(a.engine, a.text, a.out, a.voice, a.rate)
    print(f"{a.out}  {d:.2f} sn")


if __name__ == "__main__":
    main()
