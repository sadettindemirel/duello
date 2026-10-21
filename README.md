# Düello

Sınıf içi bilgi yarışması. Sorular tahtada görünür, öğrenciler telefondan renkli butona basarak cevaplar.
Puanları yalnızca öğretmen görür; isterse tahtada gösterir.

## Öğrenci

1. Tahtadaki **QR kodu** telefonunla okut (ya da tahtada yazan adresi aç).
2. **Adını yaz** ya da 🎲 ile rastgele bir takma ad seç. Öğretmenin istediyse **okul numaranı** da yaz
   (tahtada görünmez). **Katıl**'a bas.
3. Soru tahtada çıkınca telefonda 4 renkli buton belirir: tahtadaki şıkla **aynı renk ve şekle** bas.
   Ne kadar hızlı cevaplarsan o kadar çok puan alırsın (doğru cevap 500–1000 puan).
4. Süre bitince telefonunda doğru mu yanlış mı bildiğini ve kazandığın puanı görürsün.

Her derste **aynı telefon ve tarayıcıyı** kullanırsan puanların dönem boyunca birikir.

## Öğretmen

**Ders öncesi**
- Soru setini `site/sorular/` klasörüne ekleyip push edin (biçim için [ornek.json](site/sorular/ornek.json)).
  Yayına çıkması ~10 dakika sürebilir; dersten önce yapın.

**Derste**
1. Projeksiyonda **https://sadettindemirel.github.io/duello/board.html** adresini açın.
2. Öğretmen anahtarını girin (bir kez; tarayıcı hatırlar), soru setini seçin, **Oturumu aç**.
3. Öğrenciler QR kodu okutup katılır, adları ekranda belirir. Uygunsuz bir ada tıklayarak öğrenciyi çıkarabilirsiniz.
4. **Boşluk** tuşu her şeyi yönetir: soruyu başlat → (gerekirse süreyi erken bitir) → sonraki soru → podyum.
   Herkes cevaplayınca ya da süre bitince soru kendiliğinden kapanır.
5. Sonuçta şık dağılımı görünür. Puanlar varsayılan olarak **gizlidir**; göstermek için **G**.
6. Son sorudan sonra **podyum**, ardından istenirse **Dönem tablosu**.

| Tuş | İşlev |
|---|---|
| Boşluk | Sonraki adım |
| G | Puanları gizle / göster |
| F | Tam ekran |

Sayfa yanlışlıkla kapanırsa yeniden açın: **Kaldığın yerden devam et** düğmesi çıkar.

**Puanlar nerede?** Google Sheet'inizde: `puanlar` sekmesi her dersin sıralaması, `donem` sekmesi dönem toplamı.
Not vermek için bu sekmeleri kullanabilirsiniz. Okul numarası olan öğrenciler farklı telefondan girse bile tek satırda toplanır.

---

İlk kurulum (Google Sheet, Apps Script, GitHub Pages) ve teknik ayrıntılar: [KURULUM.md](KURULUM.md).
