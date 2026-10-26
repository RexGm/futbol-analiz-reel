# Referans video çözümlemesi — "Villa'nın 6-0'ı bir kaza değildi"

720x1280 · 30 fps · 70.7 sn · -14 LUFS · konuşma + hafif müzik yatağı + whoosh/impact.
Bu skill'in varsayılan stili bu videodan ölçüldü. Referansın kanal adı/maskotu (@pip.simule, sarı yağmurluklu karakter) **kopyalanmaz**; CTA'ya kullanıcının kendi hesabı konur.

## Anlatı yapısı (en önemli kısım)
Video bir **iddia** etrafında kurulu, maç özeti değil:
1. **Kanca (0–4 sn):** Skor + ters köşe cümle. "Villa'nın 6-0'ı bir kaza değildi." Dev skor, goller ağa gider.
2. **Tez:** "Savunma iki maçtır alarm veriyordu. Skorlar bunu sakladı." (diziliş + alarm halkaları + skor kartı)
3. **Kanıt 1:** Önceki maçın verisi — şut haritası, xG barı: "Rize 19 şut, gol beklentisi Rize'nin lehine; daha az pozisyonla 3-0 kazandı."
4. **Kanıt 2 (trend):** Panel yığını: rakibe verilen xG 0.72 → 1.52 → 3.15, "her maç neredeyse ikiye katlandı."
5. **Kanıt 3:** Pin'li 3B saha: rakip şutları 17 · 19 · 20. "Eyüp de Rize de kaçırdı. Villa kaçırmadı: 11 isabetli şut."
6. **Neden:** Kadro detayı: "Kanté sezonda ilk kez ilk 11'de yoktu." (hayalet halka + maç maç ✓ şeridi)
7. **Ters çevirme:** "Sorun hücum değildi; ilk yarıda tehlikeli olan Fenerbahçe'ydi." (xG pill'leri)
8. **Sonuç:** "Gol atmak değil" (üstü çizili) → "6-0'ın faturası üç maça kesilmeli." (üç mini saha + bar grafik)
9. **CTA sorusu:** "Sence bu 6-0 şanssızlık mı, yoksa üç maçtır gelen bir alarm mı?" + YORUMA YAZ ↓

Kural: her sahne tek bir sayı/olgu taşır, her cümle bir öncekini kanıtlar veya ters çevirir. Soru, iki savunulabilir yorum arasında seçim ister (yorum getirir).

## Görsel dil
- **Tipografi:** başlıklar sıkışık kalın grotesk (Anton ile eşlendi), BÜYÜK HARF, 2 satır: 1. satır kırık beyaz, 2. satır vurgu rengi (sarı/kırmızı/yeşil). Nokta ile biter. Sol hizalı, üstte (y≈%18–26).
- **Etiketler:** mono, büyük harf, geniş aralık (JetBrains Mono ile eşlendi): "ŞUT YERLERİ TEMSİLİ · XG: API-FOOTBALL", oyuncu adları, pill'ler.
- **Arka plan:** sahne başına tek renk radyal gradyan + vinyet + hafif grain. Sırayla: koyu gri → bordo (alarm) → hardal (önceki maç) → koyu (trend) → mavi (Villa maçı/kadro) → siyah (sonuç/CTA). Renk değişimi = bölüm değişimi.
- **Saha:** beyaz neon çizgi (glow), düz (şut haritası) veya perspektif (kadro, pin'ler). Çizgiler sahne başında kendini çizer.
- **Veri işaretleri:** lacivert dolgu + sarı halka (FB), takım rengi dolgu + kontrast halka (rakip); isabetli şutta ikinci halka; gol dakikası etiketi; kale ağzına kesikli çizgiler.
- **Kartlar:** krem kâğıt kart, hafif eğik, büyükten düşer + ekran sarsıntısı; arkada genişleyen kırmızı halkalar.
- **Hareket:** kelime kelime maskeden yükselen yazı (0.34 sn, power3.out, 0.055 stagger); sayılar sayaçla artar; kamera her sahnede 1.07→1 iter sonra yavaş yaklaşır; geçişler 0.3 sn çapraz.
- **Ritim:** ~70 sn'de ~25 altyazı; altyazı başı 2–3 sn; grafik olayı her zaman söylenen kelimeyle aynı anda.

## Ses
Erkek, enerjik, haber/analiz tonu TR seslendirme; altında düşük müzik; sahne geçişlerinde whoosh, kart düşüşünde impact. Seslendirme -14 LUFS.

## Referansta olup bu skill'de 2D'ye indirgenen
- 3B oyuncu yeniden kurgusu (31' Jackson, düşük poligon oyuncular): istenirse Blender gibi ayrı bir araçla klip üretilip `none` sahnesinin arkasına video olarak konabilir. Varsayılan akışta yok; gerektiğinde kullanıcıya teklif et.
- Gazete manşeti kağıt dokusu: `stamp` kartı ile karşılanıyor.
