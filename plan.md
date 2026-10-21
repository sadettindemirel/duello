# Düello — Sınıf İçi Bilgi Yarışması Planı

Kahoot benzeri, en fazla 50 öğrencilik, tamamen ücretsiz bir yarışma altyapısı.
Sorular tahtada, şıklar telefonda; cevaplar öğretmenin Google Sheet'ine gider, puanlama orada yapılır.
Puanları yalnızca öğretmen görür; istediğinde tahtada öğrencilere gösterir.

## 1. Hedefler ve sınırlar

- **Hedef:** Derste canlı yarışma; her sorudan sonra şık dağılımı, sonunda podyum (ilk 3).
- **Ölçek:** En fazla 50 eşzamanlı öğrenci, ders başına ~10–30 soru.
- **Maliyet:** 0 TL. GitHub + GitHub Pages (ücretsiz, public repo), Google Sheets + Apps Script (ücretsiz).
- **Gizlilik:** Puanlar ve dönem tablosu yalnızca öğretmenin Sheet'inde durur; repoda ya da GitHub Pages'te
  öğrenci verisi **bulunmaz**. Repo public olduğu için soru dosyaları (doğru cevaplar dahil) herkese açıktır;
  hile kapsam dışı olduğundan bu kabul edilmiştir.
- **Bilinçli olarak kapsam dışı:** Hile önleme, kullanıcı hesabı, gerçek zamanlı WebSocket,
  uygulama içi soru editörü.

## 2. Kararlar

| Konu | Karar |
|---|---|
| Öğrenci kimliği | Öğrenci adını yazar **ya da** 🎲 ile rastgele takma ad üretir (ör. "Cesur Tilki"). Telefon ayrıca görünmez bir `oyuncu_id` saklar; aynı adı yazan iki öğrenci karışmaz. |
| Gerçek kimlik | İsteğe bağlı **okul numarası** alanı: tahtada hiç görünmez, yalnızca Sheet'e yazılır. Takma adlı öğrencilerin puanını tanımak için. |
| Hız bonusu | Her zaman açık. Ayar yok. |
| Puan görünürlüğü | Yalnızca öğretmen. Tahtadaki sonuç, podyum ve dönem ekranları öğretmen anahtarı ile açılır; öğretmen isterse projeksiyonda gösterir. |
| Barındırma | GitHub Pages: `https://<kullanici>.github.io/duello/`. Netlify kullanılmaz. |
| GitHub Actions | Her push'ta soru dosyalarını doğrular; geçerse `site/` klasörünü Pages'e yayınlar. Puan verisi repoya **yazılmaz**. |

## 3. Mimari

```
Tahta (board.html)         Telefon (play.html)          Google Sheet + Apps Script (öğretmenin Drive'ı)
──────────────────         ───────────────────          ───────────────────────────────────────────────
öğretmen anahtarı ile ──────────────────────────────▶  durum: soru=N, başlangıç=t, süre=s
"Soru N'yi başlat"
                           ad / 🎲 / (okul no) ─────▶  katilimcilar
                           [A][B][C][D] basılır ────▶  cevaplar: zaman, oyuncu, soru, şık, ms, puan
                           (2 sn'de bir durum sorar ◀── durum: aktif soru / bekle)
"Süre bitti, sonuç" ◀───────────────────────────────── şık dağılımı + ilk 5
Podyum / Dönem tablosu ◀────────────────────────────── puanlar, donem sekmeleri

GitHub push ──▶ Actions: soru dosyalarını doğrula ──▶ GitHub Pages'e yayınla (yalnızca HTML/JS/sorular)
```

### Bileşenler

| Bileşen | Teknoloji | Görev |
|---|---|---|
| `site/board.html` | HTML + vanilla JS | Soru, sayaç, ilerleme, şık dağılımı, podyum, dönem tablosu. Akışı öğretmen yönetir. |
| `site/play.html` | HTML + vanilla JS | Ad / rastgele ad / okul no girişi, 4 renkli buton, geri bildirim. |
| `site/sorular/*.json` | JSON | Her ders için bir soru seti. |
| `apps-script/Code.gs` | Google Apps Script | Web uygulaması (`doGet` / `doPost`) + sekmeleri oluşturan `kurulum()`. |
| Google Sheet | Sheets | `durum`, `katilimcilar`, `cevaplar`, `anahtar`, `puanlar`, `donem` sekmeleri. |
| `scripts/*.py` | Python 3.11 (yalnızca stdlib) | Soru doğrulama, yerel sunucu, yük testi. |
| `.github/workflows/yayinla.yml` | GitHub Actions | Her push'ta soru dosyalarını doğrular, ardından GitHub Pages'e yayınlar. |

## 4. Veri biçimleri

### 4.1 Soru seti — `site/sorular/<oturum-id>.json`

```json
{
  "id": "2026-10-21-9A-kimya",
  "baslik": "Atom ve Periyodik Sistem",
  "varsayilan_sure": 20,
  "sorular": [
    {
      "metin": "Periyodik tabloda aynı gruptaki elementlerin ortak özelliği nedir?",
      "gorsel": null,
      "siklar": ["Kütle numarası", "Değerlik elektron sayısı", "Nötron sayısı", "Yoğunluk"],
      "dogru": 1,
      "sure": 20,
      "kazanim": "9.2.1"
    }
  ]
}
```

- `dogru` sıfır tabanlı indeks (A=0, B=1, C=2, D=3).
- `sure` verilmezse `varsayilan_sure` kullanılır. `gorsel` ve `kazanim` isteğe bağlı.
- Doğru cevap tahta dosyasında durur (karar: hile kapsam dışı). Telefon bu dosyayı **hiç yüklemez**.

### 4.2 Google Sheet sekmeleri

Sekmeleri elle açmak gerekmez; `kurulum()` fonksiyonu başlıklarıyla birlikte oluşturur.

| Sekme | Sütunlar | Kim yazar |
|---|---|---|
| `durum` | oturum, soru_no, baslangic_ms, sure_sn, faz (`bekle` / `soru` / `sonuc` / `bitti`) | Apps Script (tahtanın isteğiyle) |
| `katilimcilar` | oturum, oyuncu_id, ad, okul_no, katilma_zamani | Apps Script (telefonun isteğiyle) |
| `cevaplar` | sunucu_zamani, oturum, oyuncu_id, ad, soru_no, sik, sure_ms, dogru_mu, puan | Apps Script |
| `anahtar` | oturum, soru_no, dogru, sure_sn | Apps Script (oturum başlarken tahta gönderir) |
| `puanlar` | oturum, oyuncu_id, ad, okul_no, dogru_sayisi, puan, sira | Apps Script (oturum bitince) |
| `donem` | oyuncu_id, son_ad, okul_no, katildigi_ders, toplam_puan, dogru_orani | Apps Script (oturum bitince günceller) |

Öğretmen not vermek için `puanlar` ya da `donem` sekmesini doğrudan Sheet'te kullanır.

### 4.3 Puanlama

- Doğru cevap: **1000 × (1 − sure_ms / (sure_sn × 1000) / 2)**, en yakın tam sayıya yuvarlanır.
  Anında cevap 1000, son saniyede 500 puan. Yanlış ya da boş: 0.
- Puan, `cevap` isteği kaydedilirken Apps Script'te hesaplanır ve satıra yazılır.
- Dönem tablosu `oyuncu_id`'ye göre birikir. Öğrenci her derste aynı telefonu ve tarayıcıyı kullanırsa,
  adını değiştirse bile puanları aynı satırda toplanır. Okul numarası girildiyse eşleştirme okul no ile yapılır.

## 5. Apps Script uç noktaları

Tek web uygulaması URL'i, `action` parametresiyle. **Öğretmen** satırları `anahtar` parametresi ister;
değer Apps Script'in *Script Properties* kısmında `OGRETMEN_ANAHTARI` olarak saklanır, kodda yazmaz.

| İstek | Kim | Ne yapar |
|---|---|---|
| `POST action=oturumBaslat` | Öğretmen | Oturum id'si + cevap anahtarını `anahtar`'a yazar, `durum`'u sıfırlar. |
| `POST action=soruBaslat` | Öğretmen | `durum` = soru N, `baslangic_ms` = sunucu saati, faz = `soru`. |
| `POST action=soruBitir` | Öğretmen | faz = `sonuc`; o sorunun şık dağılımını + güncel ilk 5'i döner. |
| `POST action=oturumBitir` | Öğretmen | `puanlar`'ı yazar, `donem`'i günceller, podyum verisini döner. |
| `GET action=lobi` | Öğretmen | Katılımcı sayısı ve adlar (lobi ekranı için). |
| `GET action=donem` | Öğretmen | Dönem tablosu (tahtada göstermek için). |
| `POST action=katil` | Telefon | Katılımcıyı ekler. Ad bu oturumda başka bir oyuncuya aitse sonuna sayı ekler ("Ayşe 2") ve son adı döner. |
| `POST action=cevap` | Telefon | Faz `soru` değilse, süre dolduysa ya da oyuncu bu soruyu zaten cevapladıysa reddeder. Aksi halde puanlayıp satır ekler. |
| `GET action=durum` | Telefon | Aktif soru no + faz; faz `sonuc` ise oyuncunun o sorudaki sonucu. |

**Teknik notlar**
- Kayıtların çakışmaması için `LockService.getScriptLock()` kullanılır.
- Apps Script eşzamanlı çalışma sınırı (~30) yüzünden telefon, başarısız gönderimi 300–1500 ms rastgele bekleyip en fazla 3 kez yeniden dener.
- CORS ön kontrolüne (preflight) takılmamak için POST gövdesi `Content-Type: text/plain` ile gönderilir.
- Telefon `durum` sorgusu 2 sn aralıklıdır: 50 telefon için saniyede 25 istek. İlk testte sorun çıkarsa aralık 3 sn'ye çıkarılır.
- Süre kontrolünde, ağ gecikmesi için sunucu tarafında 1.5 sn tolerans vardır.

## 6. Ekranlar

**Tahta (`board.html`)**
1. Açılış: öğretmen anahtarı (bir kez girilir, bu tarayıcıda saklanır), soru seti seçimi,
   telefon adresi için büyük QR kod + kısa URL.
2. Lobi: katılan öğrenci sayısı ve adları.
3. Soru: metin, 4 renkli şık, geri sayım çubuğu, "x / 50 cevapladı".
4. Sonuç: doğru şık vurgulanır, şık dağılımı çubuk grafiği, ilk 5.
5. Bitiş: podyum (1-2-3), tam sıralama.
6. Dönem tablosu: `donem` sekmesinden; okul numaraları tahtada **gösterilmez**.
- Sonuç, podyum ve dönem ekranlarında "Gizle" düğmesi: öğretmen göstermek istemediği an ekranı kapatır.
- Klavye: `Boşluk` = sonraki adım, `F` = tam ekran, `G` = gizle/göster.

**Telefon (`play.html`)**
1. Giriş: ad alanı + 🎲 "Rastgele ad" düğmesi (Türkçe sıfat + hayvan listesi), isteğe bağlı okul no.
   Bilgiler bu tarayıcıda saklanır; "değiştir" bağlantısı.
2. Bekleme: "Tahtaya bak".
3. Soru: 4 büyük renkli buton (▲ ◆ ● ■ + A/B/C/D), şık metni yok.
4. Gönderildi: "Cevabın alındı ✓". Süre bitince yalnızca kendi sonucu: doğru/yanlış ve o soruda kazandığı puan.

## 7. Python betikleri (`scripts/`)

Yalnızca standart kütüphane; dış bağımlılık yok. Testler için `pytest`.

| Betik | Görev |
|---|---|
| `dogrula.py` | `site/sorular/*.json` dosyalarını kontrol eder (4 şık, geçerli `dogru`, süre > 0, benzersiz id). CI'da her push'ta çalışır. |
| `sunucu.py` | Yerel test: `site/` klasörünü sunar (telefondan aynı Wi-Fi ile denemek için). |
| `yuk_testi.py` | 50 sahte oyuncuyla aynı anda katılma + cevap gönderme; kayıp cevap ve hata sayısını raporlar. |

## 8. GitHub Actions ve GitHub Pages

- `yayinla.yml`, iki iş (job):
  1. `dogrula` — `push` ve `pull_request`'te: `python scripts/dogrula.py` + `pytest`.
  2. `yayinla` — yalnızca `main`'e push'ta ve `dogrula` geçerse: `actions/upload-pages-artifact` (`path: site`)
     → `actions/deploy-pages`. Hatalı soru dosyası canlıya çıkmaz.
- Gerekli izinler: `pages: write`, `id-token: write`.
- Repo ayarı (bir kez): **Settings → Pages → Source: GitHub Actions**.
- Site alt klasörde (`/duello/`) yayınlandığı için tüm bağlantılar ve `fetch` yolları **göreli** yazılır
  (`sorular/ornek.json`, `/sorular/...` değil). QR kod, tahtanın açıldığı adresten üretilir.
- Pages dosyaları ~10 dk önbellekte tutar: yeni soru setleri dersten önce push edilir.
- Repo secret gerekmez: öğrenci verisi ve öğretmen anahtarı repoya girmez.

## 9. Klasör yapısı

```
duello/
├── plan.md
├── README.md                 # kurulum: Sheet, Apps Script, GitHub Pages
├── requirements.txt          # boş (stdlib)
├── requirements-dev.txt      # pytest
├── .gitignore
├── .venv/                    # yerel, commit edilmez
├── site/                     # GitHub Pages'e yayınlanan klasör
│   ├── index.html            # öğrenciyi play.html'e yönlendirir
│   ├── board.html
│   ├── play.html
│   ├── config.js             # APPS_SCRIPT_URL (web app URL'i; gizli değil)
│   ├── css/  js/
│   └── sorular/
├── apps-script/
│   ├── Code.gs
│   └── appsscript.json
├── scripts/
│   ├── dogrula.py
│   ├── sunucu.py
│   └── yuk_testi.py
├── tests/
└── .github/workflows/
    └── yayinla.yml           # doğrula → Pages'e yayınla
```

## 10. Uygulama adımları

| # | Adım | Kim | Çıktı | Kontrol |
|---|---|---|---|---|
| 1 | Repo iskeleti, `.gitignore`, `git init` | Claude | Klasör yapısı | `git status` temiz |
| 2 | Soru şeması + `dogrula.py` + örnek soru seti | Claude | `sorular/ornek.json` | `pytest` geçer |
| 3 | `Code.gs` + `kurulum()` | Claude | Apps Script kodu | Kod incelemesi |
| 4 | Apps Script'i Sheet'e yapıştırma ve web app olarak yayınlama | **Öğretmen** | Web app URL'i | `curl` ile `durum` / `cevap` denemesi |
| 5 | `play.html` | Claude | Telefon ekranı | Telefondan gönderilen cevap Sheet'te görünür |
| 6 | `board.html` | Claude | Tahta akışı | Tek kişiyle uçtan uca bir oturum |
| 7 | Puanlama, podyum, dönem tablosu | Claude | Sonuç ekranları | Elle hesaplanan puanla karşılaştırma |
| 8 | Yük denemesi | Claude | `yuk_testi.py` raporu | Kayıp cevap yok |
| 9 | Public GitHub reposu, `yayinla.yml`, Pages ayarı | **Öğretmen** + Claude | Canlı site (`github.io/duello`) | Actions yeşil, telefondan açılıyor |
| 10 | Sınıfta 5–10 öğrenciyle pilot | **Öğretmen** | Geri bildirim | Gecikme ve hata notları |

## 11. Riskler

| Risk | Etki | Önlem |
|---|---|---|
| Apps Script eşzamanlılık sınırı | Bazı cevaplar ilk denemede reddedilir | Rastgele beklemeli yeniden deneme + LockService; adım 8'de test |
| Apps Script gecikmesi (~0.5–2 sn) | Sayaç sonunda gönderilen cevap geç kalır | Sunucu tarafında 1.5 sn tolerans |
| Okul Wi-Fi'ı | Telefon bağlanamaz | Mobil veriyle de çalışır (yalnızca HTTPS istekleri) |
| Öğrenci tarayıcıyı temizler / telefon değiştirir | Dönem puanı yeni satırda başlar | Okul no girildiyse okul no ile eşleştirilir; öğretmen Sheet'te satırları birleştirebilir |
| Uygunsuz takma ad | Tahtada görünür | Basit kelime filtresi; öğretmen lobide oyuncuyu çıkarabilir |
| GitHub Pages önbelleği (~10 dk) | Yeni push hemen görünmez | Soru setleri dersten önce push edilir; acil durumda sayfa `?v=2` ile açılır |
| Public repoda doğru cevaplar | Meraklı öğrenci cevapları bulabilir | Kabul edildi (hile kapsam dışı) |
| Öğretmen anahtarının sızması | Öğrenci akışı kontrol eder | Anahtar yalnızca öğretmenin tarayıcısında ve Script Properties'te; gerekirse değiştirilir |
