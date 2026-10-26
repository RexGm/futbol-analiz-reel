# Maç verisini bulmak

Amaç: her sayının bir kaynağı olsun. Uydurma sayı yok; bulunamayan istatistik videoya girmez veya kullanıcıya sorulur.

## Hangi veri gerekli
| Veri | Zorunlu mu | Nerede kullanılır |
|---|---|---|
| Skor, ilk yarı skoru, tarih, organizasyon/hafta, stat | evet | score-hook meta |
| Gol dakikası + oyuncu (+asist) | evet | score-hook, shot-map, timeline |
| Toplam şut, isabetli şut | evet | shot-map, stat-duel, bars |
| Topla oynama, korner, faul | iyi olur | stat-duel |
| xG (gol beklentisi) | varsa çok güçlü | bar, panel-stack, stat-duel |
| İlk 11 + diziliş, oyuncu bazlı şut | anlatı gerektirirse | lineup |
| Kartlar (dakika) | anlatı gerektirirse | timeline |
| Önceki 2–3 maçın aynı metrikleri | trend anlatısı için | panel-stack, bars, pins |
| Şut koordinatları | nadiren bulunur | yoksa temsili + "ŞUT YERLERİ TEMSİLİ" |

## Sıra
1. **API anahtarı varsa** (`APIFOOTBALL_KEY`): `python3 scripts/fetch_api_football.py --team "Fenerbahce" --opponent "Galatasaray" --date 2025-12-01 -o work/match_data.json`. Skor, istatistik (büyük liglerde xG dahil), olaylar, kadrolar tek seferde gelir.
2. **Web araması** (WebSearch + WebFetch). İyi çalışan sayfalar:
   - ESPN maç sayfası (`espn.com/.../partido/_/juegoId/...` veya `espn.com/soccer/match/_/gameId/...`): şut, isabet, topla oynama, korner, faul, diziliş, en çok şut atan.
   - Sporx / Fanatik / NTV Spor "maç anlatımı": gol dakikaları, asist, kartlar, ilk 11'ler (Türk ligleri için en eksiksiz).
   - FotMob / Sofascore / FBref / Understat: xG. FotMob maç URL'si sonradan aynı eşleşmenin yeni maçına dönebiliyor — sayfadaki tarihi kontrol et.
   - Arama sorguları: `"<ev> <deplasman>" <gün> <ay> <yıl> maç istatistikleri`, `"<ev> <deplasman>" xG`, `<ev> <deplasman> maç anlatımı`.
3. **Kaynaklar çelişirse** (ör. topla oynama ESPN %56, Sporx %54): birini seç, `match.notes`'a yaz, kaynağı ekrandaki `source` etiketine koy. Fark anlatıyı değiştiriyorsa kullanıcıya söyle.
4. **Bulunamazsa kullanıcıya sor** — tek mesajda, eksikleri liste halinde. Kullanıcı "bilmiyorum" derse o metriği kullanmayan bir anlatı kur (xG yoksa şut/isabet üzerinden git).

## Kontrol listesi (story.json'u yazmadan önce)
- Tarih ve skor iki kaynakta aynı mı?
- Gol dakikaları/oyuncu adları maç anlatımıyla aynı mı? (Türkçe karakterlerle: Durán, Sané, Skriniar)
- "İlk 11'de yoktu" gibi iddialar kadro listesinden doğrulandı mı?
- Yüzdeler hesaplandıysa (isabet oranı = isabet / şut) yuvarlama doğru mu?
- `match.sources` dolu mu?
