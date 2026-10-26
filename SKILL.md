---
name: futbol-analiz-reel
description: Futbol maçı veri-analiz reels'i (dikey 9:16, Instagram/TikTok/Shorts) üretir — skor kancası, şut haritası, xG barları, istatistik düellosu, dakika çizelgesi, diziliş, panel/bar karşılaştırma ve "YORUMA YAZ" sorusuyla biten, Türkçe altyazılı ve isteğe bağlı seslendirmeli motion-graphics video. Maç istatistiklerini kendisi internetten bulur, bulamazsa kullanıcıya sorar. Kullanıcı bir maç için analiz videosu, "maç analizi reels", "şu maçın verisini anlatan video", derbi/FB/GS/BJK/Avrupa maçı hakkında veri videosu, xG/şut haritası animasyonu veya "Villa 6-0 videosu gibi" bir şey istediğinde mutlaka kullan — "reel" veya "video" kelimesi geçmese bile maç verisinin görsel anlatımı isteniyorsa.
---

# Futbol Analiz Reel

Bir maçın verisinden, referans videodaki ("Villa'nın 6-0'ı bir kaza değildi") ile aynı görsel dilde 45–75 sn'lik dikey analiz videosu üretir. Motor: HyperFrames (HTML+GSAP → MP4, deterministik). Bu skill'in üstüne koyduğu katman: 11 hazır sahne tipi (`assets/engine/engine.js`), veri→story.json→video derleyicisi (`scripts/build.py`), çok motorlu TTS (`scripts/tts.py`) ve sentez SFX.

`<skill>` = bu klasör. Referansın ölçülmüş stili ve anlatı yapısı: `references/reference-style.md` (ilk kullanımda oku).

## Akış

### 0. Kurulum kontrolü (oturumda bir kez)
`bash <skill>/scripts/setup.sh --voice <motor>` — node, ffmpeg, numpy, hyperframes, render tarayıcısı ve seçilen ses motorunu kontrol eder/kurar. Eksik varsa ne yapılacağını söyler. Render tarayıcısı inmezse `HYPERFRAMES_BROWSER_PATH`'i kurulu Chrome/Chromium'a işaret et.

### 1. Maçı netleştir
Eksik olanı **tek mesajda** sor (bilinenleri tekrar sorma):
- Hangi maç? (takımlar + tarih ya da "son derbi"). Tarih yoksa önce web'de son karşılaşmayı bul, teyit için kullanıcıya göster.
- Açı/iddia: kullanıcının bir tezi var mı ("savunma çöktü", "hakem", "şanssızlık")? Yoksa veriden sen çıkar ve storyboard'da öner.
- Seslendirme (aşağıdaki tablo) ve CTA'da görünecek hesap adı (yoksa koyma).
- Önceki maçlarla trend isteniyorsa hangi maçlar.

### 2. Veriyi topla
`references/data-sources.md`'yi izle: `APIFOOTBALL_KEY` varsa `scripts/fetch_api_football.py`, yoksa WebSearch/WebFetch (ESPN + Türk maç anlatımı sayfaları + xG için FotMob/FBref). İki kaynakla doğrula. Bulunamayanı kullanıcıya sor; **hiçbir sayıyı uydurma** — bir analiz videosunun tek değeri sayılarının doğru olması. Kaynakları `match.sources`'a, çelişkileri `match.notes`'a yaz.

### 3. Anlatıyı kur → storyboard onayı
Referansın yapısı: **kanca (skor + ters köşe cümle) → tez → 2–3 kanıt (her sahne tek sayı) → neden → ters çevirme → sonuç → iki yorum arasında seçim isteyen soru.** Maç özeti yazma; tek bir iddiayı kanıtla. Ayrıntı ve örnek cümleler: `references/reference-style.md`.

Kullanıcıya kısa storyboard göster (sahne tipi · arka plan · altyazılar · kullanılan sayılar) ve onay al. Sahne tipleri ve parametreleri: `references/story-schema.md`. Tipik 8–10 sahne:

| amaç | tip | bg |
|---|---|---|
| kanca | `score-hook` | dark |
| hacim/üstünlük | `shot-map` (+ xG veya topla oynama barı) | gold |
| tablo | `stat-duel` | blue |
| şok sayı | `stamp` | maroon |
| maçın akışı | `timeline` | dark |
| oyuncu/kadro nedeni | `lineup` | blue |
| trend (çok maç) | `panel-stack`, `pins`, `bars` | dark |
| ara vurgu | `pitch-dim` + strike | black |
| kapanış | `cta` | black |

Ardışık iki sahnede aynı arka plan kullanma; renk değişimi bölüm değişimi demek.

### 4. story.json yaz
`examples/fb-gs-2025-12-01.json`'u kopyala, düzenle. Önemli kurallar:
- Altyazı ≤ 2 satır, satır ≤ ~24 karakter; 1. satır bağlam, 2. satır vurgu (renkli) ve nokta ile biter.
- `vo` alanına seslendirilecek metni **sayıları yazıyla** yaz ("1–1" → "bire bir", "90+5" → "doksan artı beş", "%56" → "yüzde elli altı"). Ekran yazısı rakamla kalır.
- Takım renkleri: `color` koyu zeminde parlak olmalı (GS için #E8202E, FB için #FFD21F); `dark` nokta dolgusu.
- Şut koordinatı yoksa `source`'a "ŞUT YERLERİ TEMSİLİ" yaz.

### 5. Derle, kontrol et, render al
```bash
python3 <skill>/scripts/build.py story.json --out <proje> --snapshots auto      # proje + kontrol kareleri
python3 <skill>/scripts/build.py story.json --out <proje> --render --quality delivery
```
- `build.py` zaman tablosunu basar; sahne < 2.5 sn veya > 9 sn ise düzelt.
- `--snapshots auto` her sahnenin %80 anından kare alır (`<proje>/.hyperframes/artifacts/snapshots/.../contact-sheet*.jpg`). Read ile **bak**: Türkçe karakterler (İ Ş Ğ Ü noktaları), taşan yazı (en uzun satır 920 px'i geçmemeli → `fontSize` küçült), üst üste binen etiketler, boş kalan sahne.
- `cd <proje> && npx hyperframes lint` → 0 hata olmalı.
- Render: 2 çekirdekte ~1 dk video ≈ 5–10 dk. Arka planda çalıştır. Çıktı `<proje>/output/<slug>.mp4` (1080x1920, 30 fps, H.264, varsa AAC).
- Önizleme için `npx hyperframes preview` (stüdyo) kullanıcının makinesinde açılabilir.

### 6. Teslim
MP4'ü gönder; bir satırda hangi maç/kaynaklar ve "şut yerleri temsili" notu. Revizyonda sadece story.json'u değiştir ve yeniden derle.

## Seslendirme seçenekleri
Kullanıcıya sor (ilk seferde; tercihi sonra tekrar sorma). Ses istemiyorsa `none` — video sessiz, süreler okuma hızından.

| motor | maliyet | gereksinim | kalite | not |
|---|---|---|---|---|
| `none` | – | – | – | sessiz; sonradan kendin seslendirebilirsin |
| `say` | ücretsiz, offline | macOS + Türkçe "Yelda" sesi | orta | Sistem Ayarları › Erişilebilirlik › Seslendirilen İçerik'ten indir |
| `edge` | ücretsiz | `pip install edge-tts`, internet | iyi | `tr-TR-AhmetNeural` (erkek, referansa yakın), `tr-TR-EmelNeural`; hız `--rate +8%` |
| `elevenlabs` | ücretli | `ELEVENLABS_API_KEY` | en iyi | multilingual v2; kullanıcının voice_id'si `voice.name` |
| `piper` | ücretsiz, offline | `setup.sh --voice piper` modeli indirir | orta | `tr_TR-dfki-medium` |

HyperFrames'in kendi `tts` komutu (Kokoro) Türkçe desteklemez — kullanma.
Ses varsa `build.py` otomatik olarak: TTS'i altyazı başına üretir (önbellek: `~/.cache/futbol-analiz-reel/vo`), sessizlikleri kırpar, süreleri ölçer, altyazıları sese kilitler, sentez SFX (whoosh/impact/pop) ekler, `audio.music` verilmişse VO altında ducking yapar, -14 LUFS'a normalize eder ve videoya mux'lar. Müzik yalnızca kullanıcının lisansına sahip olduğu dosyadan; telifli müzik ekleme. Claude sesi duyamaz — son dinlemeyi kullanıcıdan iste.

## Referans kopyalama / yeni stil
Kullanıcı başka bir analiz videosu verip "bu da böyle olsun" derse: `scripts/analyze_reference.py <video> <klasör> --fps 2` ile karelere ayır, kontak sayfalarına bak, `references/reference-style.md` formatında yeni bir profil yaz; yeni bir görsel gerekiyorsa `engine.js`'e `V["yeni-tip"]` olarak ekle (mevcut tiplerdeki `stepT`, `drawLines`, `counter` yardımcılarını kullan; Math.random ve CSS animasyonu kullanma — render deterministik olmalı). Kendi render'ını referansla kıyaslamak için `scripts/compare.py ref.mp4 bizim.mp4 -o compare.png --every 2`.

## Yapma
- Kaynağı olmayan sayı, tahmini xG'yi gerçekmiş gibi gösterme ("temsili" etiketini kaldırma).
- Referans kanalın adını, maskotunu, logosunu ya da kulüp armalarını videoya koyma; takımlar renk ve kısaltmayla gösterilir.
- Storyboard onayı olmadan final render alma (taslak snapshot serbest).
- Gerçek kişilere uydurma alıntı yazma.
