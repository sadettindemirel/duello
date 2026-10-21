// Tahta ve telefonun ortak kullandığı yardımcılar: Apps Script istekleri, yerel saklama, ekran değiştirme.
window.Duello = (() => {
  const ayar = window.DUELLO_CONFIG || {};
  const URL_ = ayar.APPS_SCRIPT_URL || "";
  // Bu hatalarda istek tekrarlanır; diğerleri (ör. "sure_doldu") kalıcıdır.
  const GECICI_HATALAR = new Set(["mesgul", "sunucu", "ag"]);

  const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
  const rastgeleBekleme = () => 300 + Math.random() * 1200;

  class IstekHatasi extends Error {
    constructor(kod, detay) {
      super(kod);
      this.kod = kod;
      this.detay = detay;
    }
  }

  async function tekIstek(yontem, veri) {
    let yanit;
    try {
      if (yontem === "GET") {
        yanit = await fetch(`${URL_}?${new URLSearchParams(veri)}`, { cache: "no-store" });
      } else {
        // text/plain: CORS ön kontrolüne (preflight) takılmamak için.
        yanit = await fetch(URL_, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify(veri),
        });
      }
    } catch (e) {
      throw new IstekHatasi("ag", String(e));
    }
    let json;
    try {
      json = await yanit.json();
    } catch (e) {
      // Apps Script yoğunken JSON yerine HTML hata sayfası dönebilir.
      throw new IstekHatasi("sunucu", `HTTP ${yanit.status}`);
    }
    if (!json.ok) throw new IstekHatasi(json.hata || "sunucu", json.detay);
    return json;
  }

  /** Geçici hatalarda 300–1500 ms rastgele bekleyip en fazla `deneme` kez yeniden dener. */
  async function istek(yontem, veri, deneme = 3) {
    if (!URL_) throw new IstekHatasi("ayar_yok");
    for (let i = 0; ; i++) {
      try {
        return await tekIstek(yontem, veri);
      } catch (e) {
        if (i >= deneme || !GECICI_HATALAR.has(e.kod)) throw e;
        await bekle(rastgeleBekleme());
      }
    }
  }

  const get = (action, params = {}, deneme) => istek("GET", { action, ...params }, deneme);
  const post = (action, govde = {}, deneme) => istek("POST", { action, ...govde }, deneme);

  const sakla = {
    al(anahtar, varsayilan = null) {
      try {
        const v = localStorage.getItem(anahtar);
        return v === null ? varsayilan : JSON.parse(v);
      } catch (e) {
        return varsayilan;
      }
    },
    koy(anahtar, deger) {
      try {
        if (deger === null || deger === undefined) localStorage.removeItem(anahtar);
        else localStorage.setItem(anahtar, JSON.stringify(deger));
      } catch (e) {
        // Gizli sekmede saklama olmayabilir; uygulama yine çalışır.
      }
    },
  };

  /** `data-ekran` özniteliği verilen ada eşit olan bölümü gösterir, diğerlerini gizler. */
  function ekranGoster(ad) {
    document.querySelectorAll("section[data-ekran]").forEach((el) => {
      el.hidden = el.dataset.ekran !== ad;
    });
    document.body.dataset.ekran = ad;
  }

  function yeniId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    // Yerel ağda (http) randomUUID yoktur; getRandomValues her bağlamda çalışır.
    const b = crypto.getRandomValues(new Uint8Array(16));
    return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  }

  /** Google Drive paylaşım linkini <img>'de açılan adrese çevirir; diğer adresler olduğu gibi döner. */
  function gorselAdresi(url) {
    const s = String(url || "").trim();
    const m = s.match(/^https:\/\/(?:drive|docs)\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:[^#]*&)?id=)([\w-]{20,})/);
    return m ? `https://drive.google.com/thumbnail?id=${m[1]}&sz=w1600` : s;
  }

  const HATA_METINLERI = {
    ayar_yok: "config.js içinde APPS_SCRIPT_URL ayarlanmamış.",
    ag: "Bağlantı kurulamadı. İnternetini kontrol et.",
    sunucu: "Sunucu şu an yoğun, tekrar dene.",
    mesgul: "Sunucu şu an yoğun, tekrar dene.",
    yetkisiz: "Öğretmen anahtarı yanlış.",
    oturum_yok: "Aktif yarışma bulunamadı.",
    oturum_bitti: "Bu yarışma bitti.",
    ad_bos: "Bir ad yaz ya da 🎲 ile seç.",
    uygunsuz_ad: "Bu ad kullanılamaz, başka bir ad seç.",
    sure_doldu: "Süre doldu, cevabın alınamadı.",
    soru_aktif_degil: "Bu soru kapandı.",
    zaten_cevaplandi: "Bu soruyu zaten cevapladın.",
    katilmadi: "Yarışmaya katılmamışsın, sayfayı yenile.",
    kurulum_yapilmamis: "Sheet'te kurulum yapılmamış (kurulum fonksiyonunu çalıştırın).",
    gecersiz_soru: "Geçersiz soru numarası.",
    gecersiz_set: "Sette eksik ya da hatalı alanlar var.",
    set_var: "Bu kısa adla başka bir set var; kısa adı değiştirin.",
    set_yok: "Soru seti bulunamadı (silinmiş olabilir).",
    gecersiz_gorsel: "Görsel PNG, JPG, GIF ya da WEBP olmalı ve 5 MB'ı geçmemeli.",
  };
  const hataMetni = (e) => HATA_METINLERI[e && e.kod] || `Beklenmeyen hata: ${(e && e.kod) || e}`;

  return { ayar, get, post, bekle, sakla, ekranGoster, yeniId, gorselAdresi, hataMetni, IstekHatasi, HARFLER: ["A", "B", "C", "D"] };
})();
