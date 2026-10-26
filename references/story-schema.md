# story.json şeması ve sahne tipleri

`scripts/build.py` bu dosyayı okur. Tam çalışan örnek: `examples/fb-gs-2025-12-01.json`.

## İçindekiler
1. Üst seviye alanlar
2. Sahne ve altyazı alanları
3. Renk adları
4. Sahne tipleri (11 adet) ve parametreleri
5. Zamanlama nasıl hesaplanır

## 1. Üst seviye

```jsonc
{
  "title": "FB 1-1 GS — ...",          // HTML başlığı
  "slug": "fb-gs-2025-12-01",           // çıktı dosya adı
  "seed": "fbgs-20251201",              // temsili şut yerleri için tohum (aynı tohum = aynı yerler)
  "match": { ... },                     // serbest: kaynaklar, notlar (render etmez, kayıt için)
  "voice": { "engine": "none|say|edge|elevenlabs|piper", "name": "...", "rate": "..." },
  "voiceOptions": { "stability": 0.45, "style": 0.35 },   // sadece elevenlabs
  "audio": { "sfx": true, "music": "/yol/muzik.mp3" },    // sfx: sentez whoosh/impact/pop; müzik ops.
  "readingSpeed": 2.7,                  // ses yokken kelime/sn
  "teams": {
    "home": { "name": "FENERBAHÇE", "short": "FB", "color": "#FFD21F", "dark": "#0B1F4F", "textDark": true },
    "away": { "name": "GALATASARAY", "short": "GS", "color": "#E8202E", "dark": "#4A0710" }
  },
  "scenes": [ ... ]
}
```
`color` = halka/etiket rengi (koyu zeminde parlak olmalı), `dark` = nokta dolgusu, `textDark: true` = bu rengin üstüne siyah yazı.

## 2. Sahne ve altyazı

```jsonc
{
  "type": "shot-map",          // aşağıdaki tiplerden biri
  "bg": "gold",                // dark | black | maroon | gold | blue | green | navy | ["#iç","#dış"]
  "accent": "y",               // 2. satır ve vurguların varsayılan rengi
  "capPos": "top",             // top | center | bottom   (altyazı yeri, sahne geneli)
  "capAlign": "left",          // left | center
  "flash": false,              // sahne girişinde beyaz flaş
  "lead": 0.25, "tail": 0.35,  // ilk altyazıdan önce / sondan sonra boşluk (sn)
  "params": { ... },           // tipe özel
  "caps": [
    { "lines": ["FENERBAHÇE", { "text": "17 ŞUT ÇEKTİ.", "color": "y" }],
      "vo": "Fenerbahçe on yedi şut çekti.",   // seslendirilecek metin (sayıları yazıyla!)
      "hold": 0.3,                            // ekstra bekleme
      "fontSize": 90,                         // otomatik boyutu ezer
      "append": false,                        // true: önceki altyazıyı silmeden üstüne kelime ekler
      "pos": "top" }
  ]
}
```
- Satır: string veya `{text, color, strike, strikeDelay, size, glow}`. 1. satır varsayılan beyaz, sonrakiler `accent`.
- `strike: true` → satırın üstünden kırmızı çizgi geçer ("GOL ATMAK DEĞİL," efekti).
- `append: true` zincirinde her altyazı **tüm** satırları tekrar yazar; sadece yeni kelimeler animasyonla gelir (referanstaki "EYÜP › RİZE › VİLLA" ve CTA sorusunun büyümesi). Zincirde `fontSize` sabit ver, yoksa boyut zıplar.
- **Adımlar:** sahnedeki i. altyazının başladığı an = görselin `step i`'si. Parametrelerde `step` alanı bu indeksi kullanır. Altyazıdan fazla adım varsa son altyazıdan sonra 0.9 sn arayla dağılır.
- Ekranda her şey otomatik büyük harfe (tr-TR) çevrilir.

## 3. Renk adları
`w` beyaz · `y` sarı #FFD21F · `r` kırmızı #FF4040 · `g` yeşil #3DDC84 · `b` mavi · `o` turuncu · `grey` · `home` / `away` (takım rengi) · `homeDark` / `awayDark` · veya herhangi bir hex.

## 4. Sahne tipleri

### score-hook — açılış: tel kafes kale, goller ağa gider, dev skor
```json
{ "score": "6–0", "meta": "ŞAMPİYONLAR LİGİ · 14 EKİM · VILLA PARK", "scoreTop": 1030, "scoreStep": 0,
  "goals": [{ "minute": "27", "team": "away", "label": "27' SANÉ", "step": 0 }] }
```
Gol sayısı çoksa (6 gol) hepsini ver; top sırayla 0.45 sn arayla gelir.

### shot-map — dikey tam saha, iki takımın şutları (referanstaki "RİZE 19 ŞUT")
```json
{ "home": { "shots": 17, "on_target": 2, "xg": 1.38, "goals": [{ "minute": "90+5", "player": "Durán" }], "step": 0, "label": "FB · 17 ŞUT" },
  "away": { "shots": 6, "on_target": 2, "goals": [...], "step": 1 },
  "order": ["home", "away"],          // 1. takım üst kaleye, 2. takım alt kaleye şut atar
  "bar": { "home": 1.04, "away": 0.66, "label": "XG", "step": 2, "leftText": "...", "rightText": "..." },
  "source": "ŞUT YERLERİ TEMSİLİ · XG: API-FOOTBALL" }
```
Gerçek koordinat varsa `shot_list: [{x, y, xg, minute, outcome: goal|on|off}]` (x 0–68 genişlik, y 0–105, y=0 hücum edilen kale). Yoksa yerler `seed`'den **temsili** üretilir: goller en yüksek xG'li konumlara, isabetliler sonrakilere. Bu durumda `source`'a mutlaka "ŞUT YERLERİ TEMSİLİ" yaz (referans da böyle yapıyor).

### stat-duel — satır satır karşılaştırma (iki takım)
```json
{ "rows": [{ "label": "TOPLA OYNAMA", "home": 56, "away": 44, "prefix": "%" }, { "label": "XG", "home": 1.38, "away": 0.7, "decimals": 2 }],
  "focus": [{ "step": 1, "row": 2 }], "top": 620, "source": "VERİ: ESPN" }
```
En fazla 5 satır. `focus` o satırı büyütüp diğerlerini karartır.

### stamp — kart düşer + alarm halkaları (referanstaki "8–0" kartı, "SERİ BAŞLADI" manşeti)
```json
{ "cards": [{ "kicker": "EYÜPSPOR MAÇI", "big": "8–0", "sub": "GALİBİYET", "color": "#1F7A3A", "step": 0, "rot": -5 }],
  "cardTop": 1180, "rings": "r", "pitch": true }
```
`rings: false` halkaları kapatır. Manşet için `big` uzun metin olabilir, `size: 150` ver.

### timeline — 0–90+ dakika ekseni, goller üstte, kartlar altta
```json
{ "events": [{ "minute": 27, "type": "goal|yellow|red", "team": "away", "label": "27' SANÉ", "step": 0 },
             { "minute": "90+5", "type": "goal", "team": "home", "label": "90+5' DURÁN", "step": 2 }],
  "note": "GOLLER ÜSTTE · SARI KARTLAR ALTTA", "max": 96 }
```
Oynatma çizgisi her adımda o adımın en geç olayına kadar ilerler; olaylar çizgi geldiğinde patlar.

### lineup — perspektif yarı saha + diziliş (referanstaki "KANTÉ İLK 11'DE YOKTU")
```json
{ "team": "home", "formation": "4-2-3-1",
  "players": ["GK", "LB", "LCB", "RCB", "RB", "DM1", "DM2", "LW", "AM", "RW", "ST"],   // soldan sağa, kaleciden forvete
  "positions": [[34,101], ...],          // ops. elle konum (x 0–68, y 52–105)
  "focus": [{ "step": 0, "names": ["Asensio"], "dim": false, "color": "y" }],
  "ghosts": [{ "name": "Kanté", "label": "YOK", "at": [34, 75], "step": 1, "color": "w" }],
  "footer": "VILLA MAÇI İLK 11 · 4-2-3-1 · YERLER TEMSİLİ" }
```
`ghost` = kesikli boş halka: kadroda olmayan / yedek oyuncu.

### bars — dikey sütunlar (final özet, xG karşılaştırma)
```json
{ "items": [{ "label": "EYÜP", "value": 0.72, "decimals": 2, "color": "g", "step": 0 }, ...],
  "baseline": 1400, "maxHeight": 560, "max": 3.5 }
```
`step` vermezsen sütunlar sahne başında 0.25 sn arayla büyür.

### panel-stack — üst üste paneller, her birinde dev sayı (referanstaki "RAKİBE VERİLEN GOL BEKLENTİSİ")
```json
{ "panels": [{ "title": "EYÜPSPOR MAÇI · 8–0 G", "value": 0.72, "decimals": 2, "sub": "RAKİBE GOL BEKLENTİSİ", "color": "g", "step": 0 }],
  "top": 600, "height": 1100 }
```
Başlığı append zinciriyle büyüt: "EYÜP ›" → "EYÜP › RİZE ›" → "EYÜP › RİZE › VİLLA".

### pins — perspektif saha, iğne şeklinde şutlar (referanstaki "RAKİP ŞUTU: 17 · 19")
```json
{ "groups": [{ "label": "EYÜP", "color": "g", "count": 17, "on_target": 4, "step": 0 },
             { "label": "RİZE", "color": "o", "count": 19, "step": 0 }] }
```

### pitch-dim — loş perspektif saha; ara cümle / strike için
`{ "opacity": 0.35 }` — altyazıyı `capPos: "center"`, `capAlign: "center"` ile kullan.

### cta — kapanış sorusu + "YORUMA YAZ ↓" butonu
```json
{ "button": "YORUMA YAZ ↓", "buttonTop": 720, "buttonStep": 2, "handle": "@hesabin",
  "recap": { "items": [ ...bars item... ] } }
```
`recap` önceki sonucu soluk (%18) arka planda tekrar çizer. `handle` sadece kullanıcı kendi hesabını verdiyse.

### none — sadece arka plan + altyazı.

## 5. Zamanlama
- Ses varsa: altyazı süresi = TTS süresi + 0.22 sn (+ `hold`). VO, altyazı başlangıcından 0.05 sn sonra başlar.
- Ses yoksa: kelime / `readingSpeed` + 0.55, en az 1.5 sn (ya da `dur`).
- Sahne = `lead` + altyazılar + `tail`. Sahneler arası 0.3 sn çapraz geçiş + kamera 1.07→1 itme.
- `build.py` çıktısındaki zaman tablosunu oku: 2.5 sn altı sahne çok hızlı, 9 sn üstü sıkıcı.
