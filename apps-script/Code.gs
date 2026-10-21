/**
 * Düello — Google Apps Script web uygulaması.
 *
 * Kurulum: Sheet → Uzantılar → Apps Script, bu dosyayı yapıştır, `kurulum` fonksiyonunu bir kez çalıştır,
 * ardından Dağıt → Yeni dağıtım → Web uygulaması (Yürüten: Ben, Erişim: Herkes).
 *
 * Tüm istekler tek URL'e gelir; hangi işin yapılacağını `action` belirler.
 * GET parametreleri sorgu dizesinde, POST gövdesi JSON metni (Content-Type: text/plain) olarak gelir.
 * Öğretmen işleri `anahtar` ister; değer Script Properties'teki OGRETMEN_ANAHTARI ile karşılaştırılır.
 *
 * Soru sırasında gelen cevaplar önce önbellekteki bir tampona yazılır, soru bitince tek seferde
 * `cevaplar` sekmesine aktarılır. Kilitli bölüm böylece kısa kalır ve 50 eşzamanlı cevap sıraya girmez.
 *
 * Soru setleri `setler` (başlık, varsayılan süre) ve `sorular` (her satır bir soru) sekmelerinde durur.
 * Soru düzenleyici (site/duzenle.html) bunları yazar; öğretmen Sheet'e doğrudan da yazabilir.
 */

const SEKMELER = {
  durum: ['oturum', 'soru_no', 'baslangic_ms', 'sure_sn', 'faz'],
  katilimcilar: ['oturum', 'oyuncu_id', 'ad', 'okul_no', 'katilma_zamani'],
  cevaplar: ['sunucu_zamani', 'oturum', 'oyuncu_id', 'ad', 'soru_no', 'sik', 'sure_ms', 'dogru_mu', 'puan'],
  anahtar: ['oturum', 'soru_no', 'dogru', 'sure_sn'],
  puanlar: ['oturum', 'oyuncu_id', 'ad', 'okul_no', 'dogru_sayisi', 'puan', 'sira'],
  donem: ['oyuncu_id', 'son_ad', 'okul_no', 'katildigi_ders', 'toplam_puan', 'dogru_orani'],
  setler: ['id', 'baslik', 'varsayilan_sure', 'guncelleme'],
  sorular: ['set', 'soru', 'gorsel', 'A', 'B', 'C', 'D', 'dogru', 'sure', 'kazanim'],
};
// Sheets'in sayıya/tarihe çevirmemesi gereken sütunlar (ör. okul no "0123", şık "1/2", kazanım "9.2").
const METIN_SUTUNLARI = ['oturum', 'oyuncu_id', 'ad', 'son_ad', 'okul_no', 'id', 'baslik',
  'set', 'soru', 'gorsel', 'A', 'B', 'C', 'D', 'dogru', 'kazanim'];

const SURUM = '2026-10-21d'; // durum yanıtında döner; hangi dağıtımın yayında olduğunu gösterir
const HARFLER = ['A', 'B', 'C', 'D'];
const TOLERANS_MS = 1500;
const ONBELLEK_SN = 21600; // CacheService üst sınırı (6 saat)
const KILIT_BEKLEME_MS = 20000;
const AD_UZUNLUK = 20;
const SET_ID_DESENI = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const VARSAYILAN_SURE = 20;
const GORSEL_KLASOR_ADI = 'Düello görselleri';
const GORSEL_TURLERI = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const GORSEL_EN_BUYUK = 5 * 1024 * 1024;
const YASAK_KELIMELER = [
  'amk', 'aq', 'mk', 'oç', 'oc', 'orospu', 'piç', 'pic', 'sik', 'sikik', 'siktir', 'yarak', 'yarrak',
  'göt', 'got', 'götveren', 'ibne', 'pezevenk', 'kahpe', 'kaltak', 'gavat', 'puşt', 'pust', 'fuck', 'shit',
];

class Red extends Error {
  constructor(kod, detay) {
    super(kod);
    this.detay = detay;
  }
}

// ───────────────────────────── Kurulum ─────────────────────────────

function kurulum() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(SEKMELER).forEach((ad) => {
    const sayfa = ss.getSheetByName(ad) || ss.insertSheet(ad);
    const basliklar = SEKMELER[ad];
    sayfa.getRange(1, 1, 1, basliklar.length).setValues([basliklar]).setFontWeight('bold');
    sayfa.setFrozenRows(1);
    basliklar.forEach((baslik, i) => {
      if (METIN_SUTUNLARI.indexOf(baslik) >= 0) {
        sayfa.getRange(1, i + 1, sayfa.getMaxRows(), 1).setNumberFormat('@');
      }
    });
  });
  const sorular = ss.getSheetByName('sorular');
  sorular.getRange(2, SEKMELER.sorular.indexOf('dogru') + 1, sorular.getMaxRows() - 1, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(HARFLER).setAllowInvalid(false).build());
  gorselKlasoru(); // Drive iznini kurulumda iste; görsel yükleme ilk derste izin beklemesin.
  const durum = ss.getSheetByName('durum');
  if (durum.getLastRow() < 2) durum.getRange(2, 1, 1, 5).setValues([['', 0, 0, 0, 'bekle']]);

  const ozellikler = PropertiesService.getScriptProperties();
  let anahtar = ozellikler.getProperty('OGRETMEN_ANAHTARI');
  if (!anahtar) {
    anahtar = rastgeleAnahtar();
    ozellikler.setProperty('OGRETMEN_ANAHTARI', anahtar);
  }
  CacheService.getScriptCache().remove('durum');
  bildir('Kurulum tamam. Öğretmen anahtarı: ' + anahtar +
    '\n(Değiştirmek için: Proje ayarları → Komut dosyası özellikleri → OGRETMEN_ANAHTARI)');
}

function anahtariGoster() {
  bildir('Öğretmen anahtarı: ' + (PropertiesService.getScriptProperties().getProperty('OGRETMEN_ANAHTARI') ||
    '(yok — önce kurulum çalıştırın)'));
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Düello')
    .addItem('Kurulum', 'kurulum')
    .addItem('Öğretmen anahtarını göster', 'anahtariGoster')
    .addItem('Dönem tablosunu yeniden hesapla', 'donemGuncelle')
    .addToUi();
}

function rastgeleAnahtar() {
  const harfler = 'abcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 10; i++) s += harfler.charAt(Math.floor(Math.random() * harfler.length));
  return s;
}

function bildir(mesaj) {
  Logger.log(mesaj);
  try {
    SpreadsheetApp.getUi().alert(mesaj);
  } catch (e) {
    // Betik düzenleyicisinden çalıştırılınca arayüz yoktur; mesaj Yürütme günlüğünde görünür.
  }
}

// ───────────────────────────── Yönlendirme ─────────────────────────────

const GET_ISLERI = {
  durum: { fn: durumSorgu },
  lobi: { fn: lobi, ogretmen: true },
  donem: { fn: donemOku, ogretmen: true },
  setler: { fn: setleriOku, ogretmen: true },
  set: { fn: setOku, ogretmen: true },
};
const POST_ISLERI = {
  oturumBaslat: { fn: oturumBaslat, ogretmen: true },
  soruBaslat: { fn: soruBaslat, ogretmen: true },
  soruBitir: { fn: soruBitir, ogretmen: true },
  oturumBitir: { fn: oturumBitir, ogretmen: true },
  cikar: { fn: cikar, ogretmen: true },
  setKaydet: { fn: setKaydet, ogretmen: true },
  setSil: { fn: setSil, ogretmen: true },
  gorselYukle: { fn: gorselYukle, ogretmen: true },
  katil: { fn: katil },
  cevap: { fn: cevap },
};

function doGet(e) {
  return isle(GET_ISLERI, (e && e.parameter) || {});
}

function doPost(e) {
  let govde;
  try {
    govde = JSON.parse(e.postData.contents);
  } catch (err) {
    return cikti({ ok: false, hata: 'gecersiz_istek' });
  }
  return isle(POST_ISLERI, govde || {});
}

function isle(isler, p) {
  try {
    const is = isler[p.action];
    if (!is) throw new Red('bilinmeyen_islem');
    if (is.ogretmen && !ogretmenMi(p.anahtar)) throw new Red('yetkisiz');
    return cikti(Object.assign({ ok: true }, is.fn(p)));
  } catch (err) {
    if (err instanceof Red) return cikti({ ok: false, hata: err.message, detay: err.detay });
    console.error(err);
    return cikti({ ok: false, hata: 'sunucu', detay: String(err) });
  }
}

function cikti(veri) {
  return ContentService.createTextOutput(JSON.stringify(veri)).setMimeType(ContentService.MimeType.JSON);
}

function ogretmenMi(anahtar) {
  const dogru = PropertiesService.getScriptProperties().getProperty('OGRETMEN_ANAHTARI');
  return !!dogru && String(anahtar || '') === dogru;
}

/** `fn`'i betik kilidi içinde çalıştırır. Yalnızca önbelleğe yazan işler `sheetYazar = false` verir. */
function kilitle(fn, sheetYazar = true) {
  const kilit = LockService.getScriptLock();
  if (!kilit.tryLock(KILIT_BEKLEME_MS)) throw new Red('mesgul');
  try {
    return fn();
  } finally {
    if (sheetYazar) SpreadsheetApp.flush();
    kilit.releaseLock();
  }
}

// ───────────────────────────── Yardımcılar ─────────────────────────────

function sayfa(ad) {
  const s = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ad);
  if (!s) throw new Red('kurulum_yapilmamis');
  return s;
}

function onbellek() {
  return CacheService.getScriptCache();
}

function jsonOku(anahtar) {
  const v = onbellek().get(anahtar);
  return v ? JSON.parse(v) : null;
}

function jsonYaz(anahtar, deger) {
  onbellek().put(anahtar, JSON.stringify(deger), ONBELLEK_SN);
}

/** Birden çok anahtarı tek önbellek çağrısıyla okur: {anahtar: çözülmüş değer | undefined}. */
function jsonOkuHepsi(anahtarlar) {
  const ham = onbellek().getAll(anahtarlar);
  const sonuc = {};
  anahtarlar.forEach((k) => {
    if (ham[k]) sonuc[k] = JSON.parse(ham[k]);
  });
  return sonuc;
}

/** Birden çok değeri tek önbellek çağrısıyla yazar. */
function jsonYazHepsi(degerler) {
  const ham = {};
  Object.keys(degerler).forEach((k) => {
    ham[k] = JSON.stringify(degerler[k]);
  });
  onbellek().putAll(ham, ONBELLEK_SN);
}

/** Sayfanın sonuna satırları tek seferde ekler. */
function satirEkle(s, satirlar) {
  if (!satirlar.length) return;
  const ilk = s.getLastRow() + 1;
  const gereken = ilk + satirlar.length - 1 - s.getMaxRows();
  if (gereken > 0) s.insertRowsAfter(s.getMaxRows(), gereken);
  s.getRange(ilk, 1, satirlar.length, satirlar[0].length).setValues(satirlar);
}

/** `sutunAdi` sütunu `deger`e eşit satırlar: [{satir, degerler}]. Değerin ilk geçtiği satırdan itibaren okur. */
function esitSatirlar(sayfaAdi, sutunAdi, deger) {
  const s = sayfa(sayfaAdi);
  const sutun = SEKMELER[sayfaAdi].indexOf(sutunAdi) + 1;
  const son = s.getLastRow();
  if (!deger || son < 2) return [];
  const bulunan = s.getRange(2, sutun, son - 1, 1).createTextFinder(deger).matchEntireCell(true).findNext();
  if (!bulunan) return [];
  const ilk = bulunan.getRow();
  const veri = s.getRange(ilk, 1, son - ilk + 1, SEKMELER[sayfaAdi].length).getValues();
  const sonuc = [];
  veri.forEach((degerler, i) => {
    if (String(degerler[sutun - 1]) === deger) sonuc.push({ satir: ilk + i, degerler: degerler });
  });
  return sonuc;
}

function oturumSatirlari(sayfaAdi, oturum) {
  return esitSatirlar(sayfaAdi, 'oturum', oturum);
}

/** Verilen satır numaralarını (ardışık blokları bir arada) siler. */
function satirlariSil(s, satirNolari) {
  const sirali = satirNolari.slice().sort((a, b) => b - a);
  let i = 0;
  while (i < sirali.length) {
    let j = i;
    while (j + 1 < sirali.length && sirali[j + 1] === sirali[j] - 1) j++;
    s.deleteRows(sirali[j], j - i + 1);
    i = j + 1;
  }
}

function puanHesapla(sureMs, sureSn) {
  const toplam = sureSn * 1000;
  return Math.round(1000 * (1 - Math.min(Math.max(sureMs, 0), toplam) / toplam / 2));
}

function adiTemizle(ad) {
  return String(ad || '').replace(/\s+/g, ' ').trim().slice(0, AD_UZUNLUK);
}

function uygunsuzMu(ad) {
  const kelimeler = ad.toLocaleLowerCase('tr').split(/[^a-zçğıöşü0-9]+/);
  return kelimeler.some((k) => YASAK_KELIMELER.indexOf(k) >= 0);
}

// ───────────────────────────── Durum ─────────────────────────────

function durumOku() {
  const d = jsonOku('durum');
  if (d) return d;
  const v = sayfa('durum').getRange(2, 1, 1, 5).getValues()[0];
  const okunan = {
    oturum: String(v[0] || ''),
    soru_no: Number(v[1]) || 0,
    baslangic_ms: Number(v[2]) || 0,
    sure_sn: Number(v[3]) || 0,
    faz: String(v[4] || 'bekle'),
  };
  jsonYaz('durum', okunan);
  return okunan;
}

function durumYaz(d) {
  sayfa('durum').getRange(2, 1, 1, 5).setValues([[d.oturum, d.soru_no, d.baslangic_ms, d.sure_sn, d.faz]]);
  jsonYaz('durum', d);
}

function aktifOturum(oturum) {
  const d = durumOku();
  if (!oturum || d.oturum !== String(oturum)) throw new Red('oturum_yok');
  return d;
}

/** Oturumun cevap anahtarı: [{dogru, sure_sn}], indeks = soru_no - 1. */
function anahtarOku(oturum) {
  const k = 'anahtar:' + oturum;
  const onbellekte = jsonOku(k);
  if (onbellekte) return onbellekte;
  const liste = [];
  oturumSatirlari('anahtar', oturum).forEach((r) => {
    liste[Number(r.degerler[1]) - 1] = { dogru: Number(r.degerler[2]), sure_sn: Number(r.degerler[3]) };
  });
  if (!liste.length) throw new Red('oturum_yok');
  jsonYaz(k, liste);
  return liste;
}

/** Oturumdaki oyuncular: {oyuncu_id: {ad, okul_no}}. */
function oyunculariOku(oturum) {
  const k = 'oyuncular:' + oturum;
  const onbellekte = jsonOku(k);
  if (onbellekte) return onbellekte;
  const harita = {};
  const satirlar = oturumSatirlari('katilimcilar', oturum).map((r) => r.degerler)
    .concat(jsonOku(katilTamponAnahtari(oturum)) || []);
  satirlar.forEach((r) => {
    harita[String(r[1])] = { ad: String(r[2]), okul_no: String(r[3]) };
  });
  jsonYaz(k, harita);
  return harita;
}

function katilTamponAnahtari(oturum) {
  return 'katil_tampon:' + oturum;
}

/** Önbellekte bekleyen yeni katılımcıları `katilimcilar` sekmesine yazar. Kilit içinde çağrılır. */
function katilimcilariBosalt(oturum) {
  if (!oturum) return;
  const k = katilTamponAnahtari(oturum);
  const tampon = jsonOku(k);
  if (!tampon || !tampon.length) return;
  satirEkle(sayfa('katilimcilar'), tampon.map((r) => r.slice(0, 4).concat([new Date(r[4])])));
  onbellek().remove(k);
}

function tamponAnahtari(oturum, soruNo) {
  return 'tampon:' + oturum + ':' + soruNo;
}

function cevapAnahtari(oturum, soruNo, oyuncuId) {
  return 'cevap:' + oturum + ':' + soruNo + ':' + oyuncuId;
}

/** Soru sırasında önbellekte biriken cevapları `cevaplar` sekmesine yazar. Kilit içinde çağrılır. */
function tamponuBosalt(oturum, soruNo) {
  if (!oturum || !soruNo) return;
  const k = tamponAnahtari(oturum, soruNo);
  const tampon = jsonOku(k);
  if (!tampon || !tampon.length) return;
  satirEkle(sayfa('cevaplar'), tampon.map((r) => [new Date(r[0])].concat(r.slice(1))));
  onbellek().remove(k);
}

// ───────────────────────────── Telefon ─────────────────────────────

function durumSorgu(p) {
  const d = durumOku();
  const yanit = { oturum: d.oturum, soru_no: d.soru_no, faz: d.faz, sure_sn: d.sure_sn, kalan_ms: 0, surum: SURUM };
  if (d.faz === 'soru') yanit.kalan_ms = Math.max(0, d.baslangic_ms + d.sure_sn * 1000 - Date.now());
  const id = p.oyuncu_id;
  if (id && d.oturum) {
    const cevapK = cevapAnahtari(d.oturum, d.soru_no, id);
    const cikarK = 'cikar:' + d.oturum + ':' + id;
    const degerler = onbellek().getAll([cevapK, cikarK]);
    if (degerler[cikarK]) yanit.cikarildi = true;
    if (d.faz === 'soru') yanit.cevapladi = !!degerler[cevapK];
    if (d.faz === 'sonuc') yanit.sonuc = degerler[cevapK] ? JSON.parse(degerler[cevapK]) : null;
  }
  return yanit;
}

function katil(p) {
  const oturum = String(p.oturum || '');
  const id = String(p.oyuncu_id || '').slice(0, 64);
  const ad = adiTemizle(p.ad);
  let okulNo = String(p.okul_no || '').trim().slice(0, 20);
  if (!id) throw new Red('gecersiz_istek');
  if (!ad) throw new Red('ad_bos');
  if (uygunsuzMu(ad)) throw new Red('uygunsuz_ad');
  const d = aktifOturum(oturum);
  if (d.faz === 'bitti') throw new Red('oturum_bitti');

  return kilitle(() => {
    // Kilit içindeki her önbellek çağrısı bir ağ gidiş-dönüşüdür; okuma ve yazma birer çağrıya indirildi.
    const oyuncularK = 'oyuncular:' + oturum;
    const tamponK = katilTamponAnahtari(oturum);
    const cikarK = 'cikar:' + oturum + ':' + id;
    const okunan = jsonOkuHepsi([oyuncularK, tamponK, cikarK]);
    const oyuncular = okunan[oyuncularK] || oyunculariOku(oturum);
    const tampon = okunan[tamponK] || [];
    if (!okulNo && oyuncular[id]) okulNo = oyuncular[id].okul_no;
    const digerAdlar = {};
    Object.keys(oyuncular).forEach((digerId) => {
      if (digerId !== id) digerAdlar[oyuncular[digerId].ad.toLocaleLowerCase('tr')] = true;
    });
    let sonAd = ad;
    for (let n = 2; digerAdlar[sonAd.toLocaleLowerCase('tr')]; n++) sonAd = ad + ' ' + n;

    // Yeni katılımcı önce önbellekteki tampona girer; Sheet'e lobi / soru başlangıcında toplu yazılır.
    const tampondaki = tampon.filter((r) => r[1] === id)[0];
    if (tampondaki) {
      tampondaki[2] = sonAd;
      tampondaki[3] = okulNo;
    } else if (oyuncular[id]) {
      const mevcut = oturumSatirlari('katilimcilar', oturum).filter((r) => String(r.degerler[1]) === id)[0];
      if (mevcut) {
        sayfa('katilimcilar').getRange(mevcut.satir, 3, 1, 2).setValues([[sonAd, okulNo]]);
        SpreadsheetApp.flush();
      }
    } else {
      tampon.push([oturum, id, sonAd, okulNo, Date.now()]);
    }
    oyuncular[id] = { ad: sonAd, okul_no: okulNo };
    const yazilacak = {};
    yazilacak[tamponK] = tampon;
    yazilacak[oyuncularK] = oyuncular;
    jsonYazHepsi(yazilacak);
    if (okunan[cikarK]) onbellek().remove(cikarK);
    return { ad: sonAd };
  }, false);
}

function cevap(p) {
  const simdi = Date.now(); // süre, kilit beklemesinden önce gelen zamana göre ölçülür
  const oturum = String(p.oturum || '');
  const id = String(p.oyuncu_id || '');
  const soruNo = Number(p.soru_no);
  const sik = Number(p.sik);
  if (!id || !(sik >= 0 && sik < HARFLER.length && sik === Math.floor(sik))) throw new Red('gecersiz_istek');

  return kilitle(() => {
    const cevapK = cevapAnahtari(oturum, soruNo, id);
    const tamponK = tamponAnahtari(oturum, soruNo);
    const oyuncularK = 'oyuncular:' + oturum;
    const anahtarK = 'anahtar:' + oturum;
    const okunan = jsonOkuHepsi(['durum', cevapK, tamponK, oyuncularK, anahtarK]);

    const d = okunan.durum || durumOku();
    if (d.oturum !== oturum) throw new Red('oturum_yok');
    if (d.faz !== 'soru' || d.soru_no !== soruNo) throw new Red('soru_aktif_degil');
    const sureMs = simdi - d.baslangic_ms;
    if (sureMs > d.sure_sn * 1000 + TOLERANS_MS) throw new Red('sure_doldu');
    if (okunan[cevapK]) throw new Red('zaten_cevaplandi');
    const oyuncu = (okunan[oyuncularK] || oyunculariOku(oturum))[id];
    if (!oyuncu) throw new Red('katilmadi');

    const dogru = (okunan[anahtarK] || anahtarOku(oturum))[soruNo - 1].dogru;
    const dogruMu = sik === dogru;
    const puan = dogruMu ? puanHesapla(sureMs, d.sure_sn) : 0;

    const tampon = okunan[tamponK] || [];
    tampon.push([simdi, oturum, id, oyuncu.ad, soruNo, HARFLER[sik], sureMs, dogruMu, puan]);
    const yazilacak = {};
    yazilacak[tamponK] = tampon;
    yazilacak[cevapK] = { sik: sik, dogru_mu: dogruMu, puan: puan };
    jsonYazHepsi(yazilacak);
    return {};
  }, false);
}

// ───────────────────────────── Öğretmen ─────────────────────────────

function oturumBaslat(p) {
  const oturum = String(p.oturum || '').trim();
  const sorular = p.sorular;
  if (!oturum || !Array.isArray(sorular) || !sorular.length) throw new Red('gecersiz_istek');
  const anahtar = sorular.map((s) => {
    const dogru = Number(s.dogru);
    const sure = Number(s.sure);
    if (!(dogru >= 0 && dogru < HARFLER.length) || !(sure > 0)) throw new Red('gecersiz_istek');
    return { dogru: dogru, sure_sn: sure };
  });

  return kilitle(() => {
    const onceki = durumOku();
    tamponuBosalt(onceki.oturum, onceki.soru_no);
    const s = sayfa('anahtar');
    satirlariSil(s, oturumSatirlari('anahtar', oturum).map((r) => r.satir));
    satirEkle(s, anahtar.map((a, i) => [oturum, i + 1, a.dogru, a.sure_sn]));
    jsonYaz('anahtar:' + oturum, anahtar);
    onbellek().remove('oyuncular:' + oturum);
    durumYaz({ oturum: oturum, soru_no: 0, baslangic_ms: 0, sure_sn: 0, faz: 'bekle' });
    return { oturum: oturum, soru_sayisi: anahtar.length };
  });
}

function soruBaslat(p) {
  return kilitle(() => {
    const d = aktifOturum(p.oturum);
    const anahtar = anahtarOku(d.oturum);
    const n = Number(p.soru_no);
    if (!(n >= 1 && n <= anahtar.length)) throw new Red('gecersiz_soru');
    katilimcilariBosalt(d.oturum);
    tamponuBosalt(d.oturum, d.soru_no);
    const yeni = { oturum: d.oturum, soru_no: n, baslangic_ms: Date.now(), sure_sn: anahtar[n - 1].sure_sn, faz: 'soru' };
    durumYaz(yeni);
    return { soru_no: n, sure_sn: yeni.sure_sn };
  });
}

function soruBitir(p) {
  const d = kilitle(() => {
    const d = aktifOturum(p.oturum);
    if (d.soru_no < 1) throw new Red('gecersiz_soru');
    if (d.faz === 'soru') {
      d.faz = 'sonuc';
      durumYaz(d);
    }
    tamponuBosalt(d.oturum, d.soru_no);
    return d;
  });

  const dagilim = [0, 0, 0, 0];
  const toplamlar = {};
  oturumSatirlari('cevaplar', d.oturum).forEach((r) => {
    const v = r.degerler;
    const id = String(v[2]);
    if (Number(v[4]) === d.soru_no) dagilim[HARFLER.indexOf(String(v[5]))]++;
    const t = toplamlar[id] || (toplamlar[id] = { ad: String(v[3]), puan: 0 });
    t.ad = String(v[3]);
    t.puan += Number(v[8]) || 0;
  });
  const ilk5 = Object.keys(toplamlar).map((id) => toplamlar[id])
    .sort((a, b) => b.puan - a.puan)
    .slice(0, 5);
  return {
    soru_no: d.soru_no,
    dogru: anahtarOku(d.oturum)[d.soru_no - 1].dogru,
    dagilim: dagilim,
    cevap_sayisi: dagilim.reduce((a, b) => a + b, 0),
    ilk5: ilk5,
  };
}

function oturumBitir(p) {
  const d = kilitle(() => {
    const d = aktifOturum(p.oturum);
    katilimcilariBosalt(d.oturum);
    tamponuBosalt(d.oturum, d.soru_no);
    d.faz = 'bitti';
    durumYaz(d);
    return d;
  });

  const oyuncular = oyunculariOku(d.oturum);
  const sonuclar = {};
  Object.keys(oyuncular).forEach((id) => {
    sonuclar[id] = { oyuncu_id: id, ad: oyuncular[id].ad, okul_no: oyuncular[id].okul_no, dogru_sayisi: 0, puan: 0 };
  });
  oturumSatirlari('cevaplar', d.oturum).forEach((r) => {
    const t = sonuclar[String(r.degerler[2])];
    if (!t) return; // çıkarılan oyuncu
    if (r.degerler[7] === true || String(r.degerler[7]).toUpperCase() === 'TRUE') t.dogru_sayisi++;
    t.puan += Number(r.degerler[8]) || 0;
  });
  const siralama = Object.keys(sonuclar).map((id) => sonuclar[id]).sort((a, b) => b.puan - a.puan);
  siralama.forEach((t, i) => {
    t.sira = i > 0 && t.puan === siralama[i - 1].puan ? siralama[i - 1].sira : i + 1;
  });

  kilitle(() => {
    const s = sayfa('puanlar');
    satirlariSil(s, oturumSatirlari('puanlar', d.oturum).map((r) => r.satir));
    satirEkle(s, siralama.map((t) => [d.oturum, t.oyuncu_id, t.ad, t.okul_no, t.dogru_sayisi, t.puan, t.sira]));
  });
  donemGuncelle();

  return {
    soru_sayisi: anahtarOku(d.oturum).length,
    siralama: siralama.map((t) => ({ ad: t.ad, puan: t.puan, dogru_sayisi: t.dogru_sayisi, sira: t.sira })),
  };
}

function lobi() {
  const d = durumOku();
  if (d.oturum && jsonOku(katilTamponAnahtari(d.oturum))) {
    // Bekleyen katılımcıları Sheet'e aktar; kilit doluysa bir sonraki lobi sorgusuna kalır.
    const kilit = LockService.getScriptLock();
    if (kilit.tryLock(500)) {
      try {
        katilimcilariBosalt(d.oturum);
      } finally {
        SpreadsheetApp.flush();
        kilit.releaseLock();
      }
    }
  }
  const oyuncular = d.oturum ? oyunculariOku(d.oturum) : {};
  const katilimcilar = Object.keys(oyuncular).map((id) => ({ oyuncu_id: id, ad: oyuncular[id].ad }));
  let cevapSayisi = 0;
  if (d.faz === 'soru') cevapSayisi = (jsonOku(tamponAnahtari(d.oturum, d.soru_no)) || []).length;
  return { durum: d, katilimcilar: katilimcilar, cevap_sayisi: cevapSayisi };
}

function cikar(p) {
  const id = String(p.oyuncu_id || '');
  return kilitle(() => {
    const d = aktifOturum(p.oturum);
    const oyuncular = oyunculariOku(d.oturum);
    katilimcilariBosalt(d.oturum);
    satirlariSil(sayfa('katilimcilar'),
      oturumSatirlari('katilimcilar', d.oturum).filter((r) => String(r.degerler[1]) === id).map((r) => r.satir));
    delete oyuncular[id];
    jsonYaz('oyuncular:' + d.oturum, oyuncular);
    onbellek().put('cikar:' + d.oturum + ':' + id, '1', ONBELLEK_SN);
    return {};
  });
}

// ───────────────────────────── Dönem ─────────────────────────────

/**
 * `donem` sekmesini `puanlar` ve `anahtar` sekmelerinden baştan hesaplar.
 * Okul numarası girilmiş oyuncular okul no ile, diğerleri oyuncu_id ile eşleştirilir.
 * Öğretmen iki satırı birleştirmek isterse `puanlar` sekmesinde okul_no'yu düzeltip bu fonksiyonu çalıştırır.
 */
function donemGuncelle() {
  const puanlar = sayfa('puanlar');
  const satirlar = puanlar.getLastRow() < 2 ? [] :
    puanlar.getRange(2, 1, puanlar.getLastRow() - 1, SEKMELER.puanlar.length).getValues();
  const anahtar = sayfa('anahtar');
  const soruSayisi = {};
  if (anahtar.getLastRow() >= 2) {
    anahtar.getRange(2, 1, anahtar.getLastRow() - 1, 1).getValues().forEach((r) => {
      soruSayisi[r[0]] = (soruSayisi[r[0]] || 0) + 1;
    });
  }

  const idOkulNo = {};
  satirlar.forEach((r) => {
    if (String(r[3]).trim()) idOkulNo[String(r[1])] = String(r[3]).trim();
  });
  const kayitlar = {};
  satirlar.forEach((r) => {
    const id = String(r[1]);
    const okulNo = idOkulNo[id] || '';
    const k = okulNo ? 'no:' + okulNo : 'id:' + id;
    const t = kayitlar[k] || (kayitlar[k] = { oyuncu_id: id, okul_no: okulNo, dersler: {}, puan: 0, dogru: 0, soru: 0 });
    t.oyuncu_id = id;
    t.son_ad = String(r[2]);
    t.dersler[r[0]] = true;
    t.puan += Number(r[5]) || 0;
    t.dogru += Number(r[4]) || 0;
    t.soru += soruSayisi[r[0]] || 0;
  });
  const tablo = Object.keys(kayitlar).map((k) => kayitlar[k])
    .sort((a, b) => b.puan - a.puan)
    .map((t) => [t.oyuncu_id, t.son_ad, t.okul_no, Object.keys(t.dersler).length, t.puan,
      t.soru ? Math.round((t.dogru / t.soru) * 100) / 100 : 0]);

  kilitle(() => {
    const donem = sayfa('donem');
    if (donem.getLastRow() >= 2) donem.getRange(2, 1, donem.getLastRow() - 1, SEKMELER.donem.length).clearContent();
    satirEkle(donem, tablo);
  });
}

/** Tahtada gösterilecek dönem tablosu (okul numaraları gönderilmez). */
function donemOku() {
  const s = sayfa('donem');
  const satirlar = s.getLastRow() < 2 ? [] : s.getRange(2, 1, s.getLastRow() - 1, SEKMELER.donem.length).getValues();
  return {
    tablo: satirlar.filter((r) => String(r[0])).map((r) => ({
      ad: String(r[1]),
      katildigi_ders: Number(r[3]) || 0,
      toplam_puan: Number(r[4]) || 0,
      dogru_orani: Number(r[5]) || 0,
    })).sort((a, b) => b.toplam_puan - a.toplam_puan),
  };
}

// ───────────────────────────── Soru setleri ─────────────────────────────

function doluMu(v) {
  return v !== null && v !== undefined && String(v).trim() !== '';
}

/** Set nesnesini (site/sorular/*.json biçimi) kontrol eder; öğretmene gösterilecek hata satırlarını döner. */
function setHatalari(set) {
  if (!set || typeof set !== 'object') return ['Set okunamadı.'];
  const h = [];
  if (!SET_ID_DESENI.test(String(set.id || ''))) {
    h.push("Kısa ad yalnızca harf, rakam, '-', '_' ve '.' içerebilir (Türkçe karakter ve boşluk olmaz).");
  }
  if (!doluMu(set.baslik)) h.push('Başlık boş olamaz.');
  const varsayilan = set.varsayilan_sure;
  if (doluMu(varsayilan) && !(Number(varsayilan) > 0)) h.push("Varsayılan süre 0'dan büyük olmalı.");
  if (!Array.isArray(set.sorular) || !set.sorular.length) {
    h.push('En az bir soru olmalı.');
    return h;
  }
  set.sorular.forEach((s, i) => {
    const yer = 'Soru ' + (i + 1) + ': ';
    if (!s || typeof s !== 'object') return h.push(yer + 'okunamadı.');
    if (!doluMu(s.metin)) h.push(yer + 'soru metni boş.');
    if (!Array.isArray(s.siklar) || s.siklar.length !== HARFLER.length || !s.siklar.every(doluMu)) {
      h.push(yer + 'dört şıkkın hepsi dolu olmalı.');
    }
    if (!(s.dogru >= 0 && s.dogru < HARFLER.length && s.dogru === Math.floor(s.dogru))) {
      h.push(yer + 'doğru cevap seçilmemiş (A, B, C ya da D).');
    }
    if (doluMu(s.sure) && !(Number(s.sure) > 0)) h.push(yer + "süre 0'dan büyük olmalı.");
    else if (!doluMu(s.sure) && !(Number(varsayilan) > 0)) h.push(yer + 'süre yok, varsayılan süre de yok.');
  });
  return h;
}

/** `setler` sekmesindeki satırlar: {id: {baslik, varsayilan_sure, guncelleme}}. */
function setBilgileri() {
  const s = sayfa('setler');
  const bilgiler = {};
  if (s.getLastRow() < 2) return bilgiler;
  s.getRange(2, 1, s.getLastRow() - 1, SEKMELER.setler.length).getValues().forEach((r) => {
    const id = String(r[0]).trim();
    if (id) bilgiler[id] = { baslik: String(r[1]), varsayilan_sure: Number(r[2]) || 0, guncelleme: r[3] };
  });
  return bilgiler;
}

/** Öğretmenin setleri. Yalnızca `sorular` sekmesine yazılmış (setler'de satırı olmayan) setler de listelenir. */
function setleriOku() {
  const bilgiler = setBilgileri();
  const sayilar = {};
  const s = sayfa('sorular');
  if (s.getLastRow() >= 2) {
    s.getRange(2, 1, s.getLastRow() - 1, 1).getValues().forEach((r) => {
      const id = String(r[0]).trim();
      if (id) sayilar[id] = (sayilar[id] || 0) + 1;
    });
  }
  const idler = Object.keys(Object.assign({}, bilgiler, sayilar));
  return {
    setler: idler.map((id) => {
      const b = bilgiler[id] || {};
      return {
        id: id,
        baslik: b.baslik || id,
        soru_sayisi: sayilar[id] || 0,
        guncelleme: b.guncelleme instanceof Date ? b.guncelleme.getTime() : 0,
      };
    }).sort((a, b) => b.guncelleme - a.guncelleme || a.baslik.localeCompare(b.baslik, 'tr')),
  };
}

function setOku(p) {
  const id = String(p.id || '').trim();
  const bilgi = setBilgileri()[id];
  const satirlar = esitSatirlar('sorular', 'set', id);
  if (!bilgi && !satirlar.length) throw new Red('set_yok');
  const set = {
    id: id,
    baslik: (bilgi && bilgi.baslik) || id,
    varsayilan_sure: (bilgi && bilgi.varsayilan_sure) || VARSAYILAN_SURE,
    sorular: satirlar.map((r) => {
      const v = r.degerler;
      const soru = {
        metin: String(v[1]).trim(),
        gorsel: String(v[2]).trim() || null,
        siklar: [v[3], v[4], v[5], v[6]].map((x) => String(x).trim()),
        dogru: HARFLER.indexOf(String(v[7]).trim().toUpperCase()),
      };
      if (doluMu(v[8])) soru.sure = Number(v[8]);
      if (doluMu(v[9])) soru.kazanim = String(v[9]).trim();
      return soru;
    }),
  };
  return { set: set, hatalar: setHatalari(set) };
}

/** Seti kaydeder; `eski_id` verilirse o setin yerine geçer (kısa ad değiştirme). */
function setKaydet(p) {
  const set = p.set;
  const eskiId = String(p.eski_id || '').trim();
  const hatalar = setHatalari(set);
  if (hatalar.length) throw new Red('gecersiz_set', hatalar);
  const id = String(set.id).trim();
  return kilitle(() => {
    if (id !== eskiId) {
      const varMi = setBilgileri()[id] || esitSatirlar('sorular', 'set', id).length;
      if (varMi) throw new Red('set_var');
    }
    setSatirlariniSil(eskiId);
    setSatirlariniSil(id);
    satirEkle(sayfa('setler'), [[id, String(set.baslik).trim(), Number(set.varsayilan_sure) || '', new Date()]]);
    satirEkle(sayfa('sorular'), set.sorular.map((s) => [
      id,
      String(s.metin).trim(),
      doluMu(s.gorsel) ? String(s.gorsel).trim() : '',
    ].concat(s.siklar.map((x) => String(x).trim()), [
      HARFLER[s.dogru],
      doluMu(s.sure) ? Number(s.sure) : '',
      doluMu(s.kazanim) ? String(s.kazanim).trim() : '',
    ])));
    return { id: id };
  });
}

function setSil(p) {
  const id = String(p.id || '').trim();
  if (!id) throw new Red('gecersiz_istek');
  return kilitle(() => {
    setSatirlariniSil(id);
    return {};
  });
}

/** Setin `setler` ve `sorular` satırlarını siler. Kilit içinde çağrılır. */
function setSatirlariniSil(id) {
  if (!id) return;
  satirlariSil(sayfa('setler'), esitSatirlar('setler', 'id', id).map((r) => r.satir));
  satirlariSil(sayfa('sorular'), esitSatirlar('sorular', 'set', id).map((r) => r.satir));
}

/** Görseli Drive'daki "Düello görselleri" klasörüne kaydeder, bağlantıya sahip herkese açar. */
function gorselYukle(p) {
  const tur = String(p.tur || '');
  if (GORSEL_TURLERI.indexOf(tur) < 0) throw new Red('gecersiz_gorsel');
  const bayt = Utilities.base64Decode(String(p.veri || ''));
  if (!bayt.length || bayt.length > GORSEL_EN_BUYUK) throw new Red('gecersiz_gorsel');
  const ad = String(p.ad || 'gorsel').slice(0, 100);
  const dosya = gorselKlasoru().createFile(Utilities.newBlob(bayt, tur, ad));
  dosya.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return { url: 'https://drive.google.com/file/d/' + dosya.getId() + '/view' };
}

function gorselKlasoru() {
  const ozellikler = PropertiesService.getScriptProperties();
  const id = ozellikler.getProperty('GORSEL_KLASORU');
  if (id) {
    try {
      const klasor = DriveApp.getFolderById(id);
      if (!klasor.isTrashed()) return klasor;
    } catch (e) {
      // Klasör silinmiş; yenisi açılır.
    }
  }
  const klasor = DriveApp.createFolder(GORSEL_KLASOR_ADI);
  ozellikler.setProperty('GORSEL_KLASORU', klasor.getId());
  return klasor;
}
