# Kurulum ve geliştirme

Öğretmen ve öğrenci kullanımı için [README.md](README.md). Bu dosya ilk kurulum ve teknik ayrıntılar içindir.

## İlk kurulum (bir kez)

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

**Soru düzenleyici güncellemesi (bir kez):** yeni `Code.gs`'i yapıştırdıktan sonra **`kurulum`**'u yeniden çalıştırın.
`setler` ve `sorular` sekmelerini ekler (mevcut verilere dokunmaz) ve görsel yükleme için **Google Drive izni** ister;
onaylayın. Ardından yukarıdaki gibi **Yeni sürüm** dağıtın. Yeni sürümün yayında olduğunu
`?action=durum` yanıtındaki `"surum"` değeri gösterir (şu an `2026-10-22a`).

> `durum` sekmesi artık kullanılmıyor (anlık durum Script Properties'te); silebilirsiniz.

### 2. Siteyi web app'e bağlama

[site/config.js](site/config.js) içindeki `APPS_SCRIPT_URL` değerine 5. adımdaki adresi yazıp push edin.
Bu adres gizli değildir; öğretmen anahtarı olmadan yalnızca öğrenci işlemleri yapılabilir.

### 3. GitHub Pages

Repo **Settings → Pages → Build and deployment → Source: GitHub Actions**.
Her push'ta [yayinla.yml](.github/workflows/yayinla.yml) soru dosyalarını doğrular ve testleri çalıştırır;
geçerse `site/` klasörünü yayınlar. Hatalı soru dosyası canlıya çıkmaz.

## Soru setleri (teknik)

- `setler` sekmesi: `id` (kısa ad), `baslik`, `varsayilan_sure`, `guncelleme`. `sorular` sekmesi: her satır bir soru
  (`set`, `soru`, `gorsel`, `A`–`D`, `dogru` = A/B/C/D, `sure`, `kazanim`); sıra satır sırasıdır.
  `setler`'de satırı olmayan bir set de listelenir (başlık = kısa ad, süre = 20).
- Setleri yalnızca öğretmen anahtarıyla okunur; cevap anahtarı repodaki JSON dosyalarının aksine herkese açık değildir.
- Yüklenen görseller Drive'da *Düello görselleri* klasörüne "bağlantıya sahip herkes görüntüleyebilir" olarak kaydedilir.
  Drive linkleri tahtada `drive.google.com/thumbnail?id=…` adresine çevrilerek gösterilir.
  Okul hesabı (Workspace) kullanıyorsanız yöneticiniz dışarıya paylaşımı kapatmış olabilir; o zaman görseller açılmaz.
- Tahta oturumu açarken bütün görselleri önceden indirir; açılmayan varsa soru numaralarını söyler.
- İçe aktarma: Excel/CSV tarayıcıda okunur (Excel için SheetJS yalnızca gerektiğinde cdn.sheetjs.com'dan yüklenir).
  Google E-Tablolar linki `tabloOku` ile web uygulamasını dağıtan hesabın yetkisiyle açılır; tablonun paylaşılması gerekmez.
- Sesler [ses.js](site/js/ses.js) içinde Web Audio ile üretilir (ses dosyası yok).

## Puanlama ve Sheet (teknik)

- Doğru cevap: `1000 × (1 − geçen_ms / (süre × 1000) / 2)`; anında 1000, son saniyede 500. Yanlış/boş: 0.
- Sunucu tarafında 1,5 sn ağ toleransı vardır.
- Puan, telefonun soruyu ilk gördüğü andan sayılır (en fazla 3 sn indirim); böylece telefonun 2 sn'lik sorgusunun
  soru başlangıcına denk gelip gelmemesi puanı etkilemez.
- Hız için: yarışmanın anlık durumu önbellekte ve Script Properties'te tutulur. Katılımcılar ve cevaplar önce önbelleğe
  yazılır, Sheet'e soru kapanınca tek seferde aktarılır. Soru başlatma ve lobi sorgusu Sheet'e hiç dokunmaz.
  Bir Apps Script isteği en az ~1,4 sn sürer (Google'ın yönlendirmesi); uzun aradan sonraki ilk istek ~10 sn sürebilir,
  bu yüzden tahta açılır açılmaz sunucuyu bir istekle ısıtır.
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
site/            GitHub Pages'e yayınlanan statik site (board.html, play.html, duzenle.html, config.js, css/, js/, sorular/)
apps-script/     Google Apps Script web uygulaması (Code.gs, appsscript.json)
scripts/         dogrula.py, sunucu.py, yuk_testi.py (yalnızca standart kütüphane)
tests/           pytest
```
