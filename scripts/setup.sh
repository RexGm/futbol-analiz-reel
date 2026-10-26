#!/usr/bin/env bash
# futbol-analiz-reel kurulum / kontrol
# Kullanım: bash setup.sh [--voice none|say|edge|elevenlabs|piper]
set -u
VOICE="none"
while [ $# -gt 0 ]; do case "$1" in --voice) VOICE="$2"; shift 2;; *) shift;; esac; done
ok(){ printf "  \033[32m✓\033[0m %s\n" "$1"; }
no(){ printf "  \033[31m✗\033[0m %s\n" "$1"; MISSING=1; }
MISSING=0
echo "== Temel araçlar"
command -v node >/dev/null && ok "node $(node -v)" || no "Node.js 22+ gerekli (brew install node)"
command -v ffmpeg >/dev/null && ok "ffmpeg" || no "ffmpeg gerekli (brew install ffmpeg)"
command -v python3 >/dev/null && ok "python3" || no "python3 gerekli"
python3 -c "import numpy" 2>/dev/null && ok "numpy" || { echo "  numpy kuruluyor..."; python3 -m pip install --user numpy pillow >/dev/null 2>&1 && ok "numpy" || no "pip install numpy pillow"; }

echo "== HyperFrames (render motoru)"
if npx --yes hyperframes --version >/dev/null 2>&1; then ok "hyperframes $(npx --yes hyperframes --version 2>/dev/null)"; else no "npx hyperframes çalışmadı (internet / npm)"; fi
if [ -z "${HYPERFRAMES_BROWSER_PATH:-}" ]; then
  npx --yes hyperframes browser ensure >/dev/null 2>&1 && ok "chrome-headless-shell" || {
    for c in "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" /usr/bin/google-chrome /usr/bin/chromium; do
      [ -x "$c" ] && { echo "  export HYPERFRAMES_BROWSER_PATH=\"$c\"  (shell profiline ekle)"; break; }
    done; no "render tarayıcısı yok"; }
else ok "HYPERFRAMES_BROWSER_PATH=$HYPERFRAMES_BROWSER_PATH"; fi

echo "== Seslendirme: $VOICE"
case "$VOICE" in
  none) ok "sessiz video (süreler okuma hızından)";;
  say)
    if command -v say >/dev/null; then
      say -v '?' | grep -q "tr_TR" && ok "Türkçe macOS sesi: $(say -v '?' | grep tr_TR | awk '{print $1}' | tr '\n' ' ')" \
        || no "Türkçe ses yok: Sistem Ayarları › Erişilebilirlik › Seslendirilen İçerik › Sistem Sesi › Sesleri Yönet › Türkçe (Yelda) indir"
    else no "say sadece macOS'ta var"; fi;;
  edge)
    python3 -m pip install --user edge-tts >/dev/null 2>&1; python3 -c "import edge_tts" 2>/dev/null && ok "edge-tts (tr-TR-AhmetNeural / tr-TR-EmelNeural, internet gerekir)" || no "pip install edge-tts";;
  elevenlabs)
    [ -n "${ELEVENLABS_API_KEY:-}" ] && ok "ELEVENLABS_API_KEY var" || no "export ELEVENLABS_API_KEY=... (https://elevenlabs.io → Profile → API key)";;
  piper)
    python3 -m pip install --user piper-tts >/dev/null 2>&1
    D="$HOME/.cache/futbol-analiz-reel/piper"; mkdir -p "$D"
    U="https://huggingface.co/rhasspy/piper-voices/resolve/main/tr/tr_TR/dfki/medium"
    [ -f "$D/tr_TR-dfki-medium.onnx" ] || curl -fL -o "$D/tr_TR-dfki-medium.onnx" "$U/tr_TR-dfki-medium.onnx"
    [ -f "$D/tr_TR-dfki-medium.onnx.json" ] || curl -fL -o "$D/tr_TR-dfki-medium.onnx.json" "$U/tr_TR-dfki-medium.onnx.json"
    [ -f "$D/tr_TR-dfki-medium.onnx" ] && ok "piper + tr_TR-dfki-medium" || no "piper modeli indirilemedi";;
  *) no "bilinmeyen ses motoru: $VOICE";;
esac
echo
[ $MISSING = 0 ] && echo "Hazır." || echo "Eksikler var — yukarıdaki ✗ satırlarını çöz."
exit $MISSING
