# Düello

Sınıf içi, ücretsiz, Kahoot benzeri bilgi yarışması (en fazla ~50 öğrenci).
Sorular tahtada, şıklar telefonda; cevaplar öğretmenin Google Sheet'ine gider, puanlama orada yapılır.
Puanları yalnızca öğretmen görür; isterse tahtada gösterir. Ayrıntılı tasarım: [plan.md](plan.md).

- **Tahta (öğretmen):** `https://sadettindemirel.github.io/duello/board.html`
- **Telefon (öğrenci):** `https://sadettindemirel.github.io/duello/` (tahtadaki QR kod buraya götürür)

## Kurulum (bir kez)

### 1. Google Sheet + Apps Script

1. Google Drive'da yeni bir **Google Sheet** açın (ör. "Düello").
2. **Uzantılar → Apps Script**. Açılan düzenleyicide `Code.gs` içeriğini silip
   [apps-script/Code.gs](apps-script/Code.gs) dosyasının tamamını yapıştırın, kaydedin.
3. (İsteğe bağlı) **Proje ayarları → "appsscript.json" dosyasını göster** işaretleyip içeriği
   [apps-script/appsscript.json](apps-script/appsscript.json) ile değiştirin (saat dilimi İstanbul).
4. Üstteki fonksiyon listesinden **`kurulum`**'u seçip **Çalıştır**. İzin isteyecek; kendi hesabınızla onaylayın
   ("Google bu uygulamayı doğrulamadı" uyarısında *Gelişmiş → ... adresine git*).
   Sekmeler oluşturulur ve **öğretmen anahtarı** Yürütme günlüğüne yazılır. Not edin.
   Anahtarı sonradan görmek/değiştirmek için: Sheet menüsünde **Düello → Öğretmen anahtarını göster** ya da
   *Proje ayarları → Komut dosyası özellikleri → `OGRETMEN_ANAHTARI`*.
5. **Dağıt → Yeni dağıtım → Tür: Web uygulaması**
   - Yürüten: **Ben**
   - Erişimi olan: **Herkes**
   
   **Dağıt**'a basın ve verilen `https://script.google.com/macros/s/.../exec` adresini kopyalayın.
6. Deneme (terminalde):
   ```sh
   curl -L "https://script.google.com/macros/s/.../exec?action=durum"
   # {"ok":true,"oturum":"","soru_no":0,"faz":"bekle",...}
   ```

> `Code.gs`'i sonradan değiştirirseniz **Dağıt → Dağıtımları yönet → Düzenle → Sürüm: Yeni sürüm** ile
> güncelleyin; böylece URL değişmez.

### 2. Siteyi web app'e bağlama

[site/config.js](site/config.js) içindeki `APPS_SCRIPT_URL` değerine 5. adımdaki adresi yazıp push edin.
Bu adres gizli değildir; öğretmen anahtarı olmadan yalnızca öğrenci işlemleri yapılabilir.

### 3. GitHub Pages

Repo **Settings → Pages → Build and deployment → Source: GitHub Actions**.
Her push'ta [yayinla.yml](.github/workflows/yayinla.yml) soru dosyalarını doğrular ve testleri çalıştırır;
geçerse `site/` klasörünü yayınlar. Hatalı soru dosyası canlıya çıkmaz.

## Ders akışı

1. Projeksiyonda `board.html`'i açın, anahtarı girin (bu tarayıcıda saklanır), soru setini seçip **Oturumu aç**.
2. Öğrenciler QR kodu okutur, adını yazar ya da 🎲 ile takma ad seçer (okul no isteğe bağlı, tahtada görünmez).
3. Lobide katılanlar görünür; uygunsuz bir ada tıklayarak öğrenciyi çıkarabilirsiniz.
4. **Boşluk** = sonraki adım (soruyu başlat → süreyi erken bitir → sonraki soru → podyum).
   Herkes cevaplayınca ya da süre bitince soru kendiliğinden kapanır.
   **G** = puanları gizle/göster (varsayılan: gizli), **F** = tam ekran.
5. Son sorudan sonra podyum; ardından **Dönem tablosu**.

Tahta sayfası yenilenirse açılış ekranında **Kaldığın yerden devam et** çıkar.

## Soru seti ekleme

`site/sorular/<id>.json` (dosya adı = `id`). Örnek: [site/sorular/ornek.json](site/sorular/ornek.json).

```json
{
  "id": "2026-10-21-9A-kimya",
  "baslik": "Atom ve Periyodik Sistem",
  "varsayilan_sure": 20,
  "sorular": [
    {
      "metin": "Periyodik tabloda aynı gruptaki elementlerin ortak özelliği nedir?",
      "siklar": ["Kütle numarası", "Değerlik elektron sayısı", "Nötron sayısı", "Yoğunluk"],
      "dogru": 1,
      "sure": 20,
      "gorsel": null,
      "kazanim": "9.2.1"
    }
  ]
}
```

- Tam 4 şık; `dogru` sıfır tabanlı (A=0, B=1, C=2, D=3).
- `sure` yoksa `varsayilan_sure` kullanılır. `gorsel` (ör. `"sorular/img/atom.png"` ya da tam URL) ve `kazanim` isteğe bağlı.
- Push etmeden önce: `python scripts/dogrula.py`. GitHub Pages ~10 dk önbellekler; setleri dersten önce push edin.
- Repo public olduğu için doğru cevaplar herkese açıktır (bilinçli karar, bkz. plan).

## Puanlama ve Sheet

- Doğru cevap: `1000 × (1 − geçen_ms / (süre × 1000) / 2)`; anında 1000, son saniyede 500. Yanlış/boş: 0.
- Sunucu tarafında 1,5 sn ağ toleransı vardır.
- Soru sırasında cevaplar Apps Script önbelleğinde toplanır, soru kapanınca tek seferde `cevaplar` sekmesine yazılır
  (50 eşzamanlı cevapta kilit beklemesini kısa tutmak için).
- Oturum bitince `puanlar` yazılır ve `donem` baştan hesaplanır. Okul no girilmişse eşleştirme okul no ile,
  değilse telefonun sakladığı görünmez `oyuncu_id` ile yapılır. İki satırı birleştirmek için `puanlar` sekmesinde
  `okul_no`'yu düzeltip **Düello → Dönem tablosunu yeniden hesapla**'yı çalıştırın.

## Geliştirme

```sh
python3.11 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
.venv/bin/pytest                      # testler
.venv/bin/python scripts/dogrula.py   # soru dosyalarını doğrula
.venv/bin/python scripts/sunucu.py    # site/'ı yerel ağda sun (telefondan aynı Wi-Fi ile dene)
.venv/bin/python scripts/yuk_testi.py --anahtar <ANAHTAR>   # 50 sahte oyuncu (ders dışında çalıştırın)
```

`yuk_testi.py` aktif oturumu `yuk-testi_...` adlı bir oturumla değiştirir; puan/dönem tablosuna yazmaz.
Bittiğinde `katilimcilar`, `anahtar`, `cevaplar` sekmelerindeki `yuk-testi_` satırlarını silebilirsiniz.

## Klasörler

```
site/            GitHub Pages'e yayınlanan statik site (board.html, play.html, config.js, css/, js/, sorular/)
apps-script/     Google Apps Script web uygulaması (Code.gs, appsscript.json)
scripts/         dogrula.py, sunucu.py, yuk_testi.py (yalnızca standart kütüphane)
tests/           pytest
```
