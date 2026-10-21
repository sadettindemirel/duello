// Tahta ekranı: açılış → lobi → soru → sonuç → … → podyum; ayrıca dönem tablosu. Akışı öğretmen yönetir.
(() => {
  const D = Duello;
  const $ = (id) => document.getElementById(id);
  const SEKILLER = ["▲", "◆", "●", "■"];
  const SINIFLAR = ["sik-a", "sik-b", "sik-c", "sik-d"];
  const TOLERANS_MS = 1500; // sunucudaki tolerans kadar bekleyip soruyu kapat
  const LOBI_ARALIK_MS = 1500;

  const Ses = window.DuelloSes;

  const durum = {
    anahtar: D.sakla.al("duello_anahtar", ""),
    dosya: null, // "sheet:<id>" ya da "dosya:<ad>.json"; eski kayıtlarda önek yok (dosya sayılır)
    set: null,
    oturum: null,
    soruNo: 0, // son başlatılan soru (1 tabanlı)
    faz: null, // ekran adı + "bitiriliyor"
    katilimciSayisi: 0,
    gizli: !D.sakla.al("duello_puanlar_acik", false),
    oncekiEkran: "acilis",
    gorseller: [], // önceden yüklenen görseller; tarayıcı önbellekte tutsun diye referansı saklanır
  };
  let lobiZamanlayici = null;
  let sayacZamanlayici = null;
  let mesgul = false;

  const oyunUrl = new URL("play.html", location.href);
  oyunUrl.search = "";
  oyunUrl.hash = "";

  // ───────── yardımcılar ─────────

  function bildir(metin) {
    const el = $("bildirim");
    el.textContent = metin;
    el.hidden = false;
    clearTimeout(bildir.z);
    bildir.z = setTimeout(() => (el.hidden = true), 6000);
  }

  const hataYaz = (err) => bildir(err instanceof D.IstekHatasi ? D.hataMetni(err) : String(err.message || err));

  function el(etiket, sinif, metin) {
    const e = document.createElement(etiket);
    if (sinif) e.className = sinif;
    if (metin !== undefined) e.textContent = metin;
    return e;
  }

  const PUAN_EKRANLARI = new Set(["sonuc", "podyum", "donem"]);
  const ILERI_ETIKETLERI = { lobi: "Başlat ▶", soru: "Süreyi bitir ■" };

  function ekran(ad) {
    if (ad !== "donem") durum.oncekiEkran = ad;
    durum.faz = ad;
    D.ekranGoster(ad);
    $("gizle-dugme").hidden = !PUAN_EKRANLARI.has(ad);
    gizliGuncelle();
    const ileri = $("ileri");
    let etiket = ILERI_ETIKETLERI[ad];
    if (ad === "sonuc") etiket = durum.soruNo < soruSayisi() ? "Sonraki soru ▶" : "Podyum 🏆";
    ileri.hidden = !etiket;
    if (etiket) ileri.textContent = etiket;
    $("ust-katilimci").hidden = !["lobi", "soru", "sonuc"].includes(ad);
    let baslik = durum.set ? durum.set.baslik : "";
    if (durum.set && (ad === "soru" || ad === "sonuc")) baslik += ` · Soru ${durum.soruNo} / ${soruSayisi()}`;
    $("ust-baslik").textContent = baslik;
    if (ad === "lobi" || ad === "soru") lobiDongusu();
    else clearTimeout(lobiZamanlayici);
    ilerlemeyiKaydet();
  }

  const soruSayisi = () => (durum.set ? durum.set.sorular.length : 0);

  function gizliGuncelle() {
    document.body.classList.toggle("puanlar-gizli", durum.gizli);
    $("gizle-dugme").textContent = durum.gizli ? "Puanları göster (G)" : "Puanları gizle (G)";
  }

  function gizleDegistir() {
    durum.gizli = !durum.gizli;
    D.sakla.koy("duello_puanlar_acik", !durum.gizli);
    gizliGuncelle();
  }

  function ilerlemeyiKaydet() {
    const devam = durum.oturum && !["acilis", "podyum"].includes(durum.faz);
    if (!devam) return;
    D.sakla.koy("duello_tahta", {
      dosya: durum.dosya,
      oturum: durum.oturum,
      soruNo: durum.soruNo,
      faz: durum.faz === "bitiriliyor" ? "soru" : durum.faz,
    });
  }

  /** Öğretmen isteği: aynı anda yalnızca bir tane (Boşluk'a iki kez basılırsa ikincisi yok sayılır). */
  async function ogretmen(action, govde = {}) {
    if (mesgul) return null;
    mesgul = true;
    try {
      return await D.post(action, { anahtar: durum.anahtar, oturum: durum.oturum, ...govde });
    } catch (e) {
      bildir(D.hataMetni(e));
      return null;
    } finally {
      mesgul = false;
    }
  }

  function qrCiz() {
    const url = oyunUrl.href;
    document.querySelectorAll("[data-kisa-url]").forEach((p) => {
      p.textContent = url.replace(/^https?:\/\//, "").replace(/\/play\.html$/, "");
    });
    if (typeof window.qrcode !== "function") return; // CDN erişilemezse yalnızca adres görünür
    const qr = window.qrcode(0, "M");
    qr.addData(url);
    qr.make();
    const svg = qr.createSvgTag({ cellSize: 8, margin: 2, scalable: true });
    document.querySelectorAll("[data-qr]").forEach((d) => (d.innerHTML = svg));
  }

  // ───────── açılış ─────────

  /** Soru seti listesi: Sheet'teki setler (anahtar gerekir) + repodaki JSON dosyaları. */
  async function setleriYukle() {
    const secim = $("soru-seti");
    const istenen = new URLSearchParams(location.search).get("set") || secim.value;
    const anahtar = $("anahtar").value.trim();
    const [sheet, dosyalar] = await Promise.allSettled([
      anahtar ? D.get("setler", { anahtar }) : Promise.resolve({ setler: [] }),
      fetch(`sorular/index.json?t=${Date.now()}`, { cache: "no-store" }).then((y) => {
        if (!y.ok) throw new Error(y.status);
        return y.json();
      }),
    ]);
    const grup = (etiket, ogeler) => {
      const g = el("optgroup");
      g.label = etiket;
      g.append(...ogeler);
      return g;
    };
    const secenek = (deger, metin) => {
      const o = el("option", "", metin);
      o.value = deger;
      return o;
    };
    const gruplar = [];
    if (sheet.status === "fulfilled" && sheet.value.setler.length) {
      gruplar.push(grup("Soru düzenleyicideki setler", sheet.value.setler.map((s) =>
        secenek(`sheet:${s.id}`, `${s.baslik} (${s.soru_sayisi} soru)`))));
    }
    if (dosyalar.status === "fulfilled" && dosyalar.value.length) {
      gruplar.push(grup("Repodaki dosyalar", dosyalar.value.map((s) =>
        secenek(`dosya:${s.dosya}`, `${s.baslik} (${s.soru_sayisi} soru) — ${s.id}`))));
    }
    secim.replaceChildren(...gruplar);
    if (istenen) {
      const uyan = [istenen, `sheet:${istenen}`, `dosya:${istenen}`].find((d) => secim.querySelector(`option[value="${CSS.escape(d)}"]`));
      if (uyan) secim.value = uyan;
    }
    if (sheet.status === "rejected" && sheet.reason.kod === "yetkisiz") bildir(D.hataMetni(sheet.reason));
    if (!gruplar.length) bildir("Henüz soru seti yok. Soruları düzenle bağlantısından bir set oluşturun.");
  }

  async function setiGetir(kaynak) {
    let set;
    if (kaynak.startsWith("sheet:")) {
      const r = await D.get("set", { anahtar: durum.anahtar, id: kaynak.slice(6) });
      if (r.hatalar.length) {
        throw new Error(`"${r.set.baslik}" setinde eksik var: ${r.hatalar.slice(0, 3).join(" · ")} — Soruları düzenle'den düzeltin.`);
      }
      set = r.set;
    } else {
      const dosya = kaynak.replace(/^dosya:/, "");
      const yanit = await fetch(`sorular/${encodeURIComponent(dosya)}?t=${Date.now()}`, { cache: "no-store" });
      if (!yanit.ok) throw new Error(`${dosya} yüklenemedi (HTTP ${yanit.status})`);
      set = await yanit.json();
    }
    set.sorular.forEach((s) => {
      s.sure = s.sure || set.varsayilan_sure;
      s.gorsel = s.gorsel ? D.gorselAdresi(s.gorsel) : null;
    });
    return set;
  }

  /** Görselleri önceden indirir (soru açılınca beklemesin); açılmayan olursa öğretmene söyler. */
  function gorselleriYukle(set) {
    durum.gorseller = [];
    const bekleyenler = set.sorular.map((s, i) => {
      if (!s.gorsel) return null;
      return new Promise((coz) => {
        const img = new Image();
        img.onload = () => coz(null);
        img.onerror = () => coz(i + 1);
        img.src = s.gorsel;
        durum.gorseller.push(img);
      });
    });
    Promise.all(bekleyenler).then((sonuclar) => {
      const bozuk = sonuclar.filter(Boolean);
      if (bozuk.length) {
        bildir(`Şu soruların görseli açılamadı: ${bozuk.join(", ")}. Link herkese açık mı? (Soruları düzenle'den kontrol edin.)`);
      }
    });
  }

  function oturumKimligi(setId) {
    const t = new Date();
    const iki = (n) => String(n).padStart(2, "0");
    return `${setId}_${t.getFullYear()}${iki(t.getMonth() + 1)}${iki(t.getDate())}-${iki(t.getHours())}${iki(t.getMinutes())}${iki(t.getSeconds())}`;
  }

  async function oturumAc(e) {
    e.preventDefault();
    durum.anahtar = $("anahtar").value.trim();
    if (!durum.anahtar) return bildir("Öğretmen anahtarını girin.");
    D.sakla.koy("duello_anahtar", durum.anahtar);
    const dosya = $("soru-seti").value;
    if (!dosya) return bildir("Bir soru seti seçin.");
    try {
      durum.set = await setiGetir(dosya);
    } catch (err) {
      return hataYaz(err);
    }
    gorselleriYukle(durum.set);
    durum.dosya = dosya;
    durum.oturum = oturumKimligi(durum.set.id);
    const r = await ogretmen("oturumBaslat", {
      baslik: durum.set.baslik,
      sorular: durum.set.sorular.map((s) => ({ dogru: s.dogru, sure: s.sure })),
    });
    if (!r) return;
    durum.soruNo = 0;
    lobiGoster();
  }

  async function devamEt() {
    const kayit = D.sakla.al("duello_tahta");
    if (!kayit) return;
    durum.anahtar = $("anahtar").value.trim() || durum.anahtar;
    try {
      durum.set = await setiGetir(kayit.dosya);
    } catch (err) {
      return hataYaz(err);
    }
    gorselleriYukle(durum.set);
    Object.assign(durum, { dosya: kayit.dosya, oturum: kayit.oturum, soruNo: kayit.soruNo });
    if (kayit.faz === "soru" || kayit.faz === "sonuc") {
      durum.faz = "soru";
      soruyuBitir();
    } else {
      lobiGoster();
    }
  }

  function devamKutusu() {
    const kayit = D.sakla.al("duello_tahta");
    $("devam").hidden = !kayit;
    if (kayit) $("devam-metin").textContent = `Yarım kalan oturum: ${kayit.oturum} (soru ${kayit.soruNo})`;
  }

  // ───────── lobi ─────────

  function lobiGoster() {
    $("lobi-sonraki").textContent =
      durum.soruNo === 0 ? `${soruSayisi()} soru hazır. Başlamak için Boşluk.` : `Sıradaki: soru ${durum.soruNo + 1}`;
    ekran("lobi");
  }

  async function lobiDongusu() {
    clearTimeout(lobiZamanlayici);
    try {
      const r = await D.get("lobi", { anahtar: durum.anahtar }, 0);
      lobiCiz(r);
    } catch (e) {
      // Geçici bağlantı hatası: bir sonraki turda yeniden denenir.
    }
    if (durum.faz === "lobi" || durum.faz === "soru") lobiZamanlayici = setTimeout(lobiDongusu, LOBI_ARALIK_MS);
  }

  function lobiCiz(r) {
    if (r.durum.oturum !== durum.oturum) return;
    durum.katilimciSayisi = r.katilimcilar.length;
    $("ust-katilimci").textContent = `👥 ${r.katilimcilar.length}`;
    $("lobi-sayi").textContent = r.katilimcilar.length;
    const ul = $("lobi-adlar");
    const mevcut = new Map([...ul.children].map((li) => [li.dataset.id, li]));
    r.katilimcilar.forEach((k) => {
      let li = mevcut.get(k.oyuncu_id);
      if (!li) {
        li = el("li", "", k.ad);
        li.dataset.id = k.oyuncu_id;
        li.title = "Çıkarmak için tıklayın";
        li.addEventListener("click", () => oyuncuCikar(k.oyuncu_id, li.textContent));
        ul.append(li);
      } else {
        li.textContent = k.ad;
        mevcut.delete(k.oyuncu_id);
      }
    });
    mevcut.forEach((li) => li.remove());

    if (durum.faz === "soru" && r.durum.faz === "soru" && r.durum.soru_no === durum.soruNo) {
      $("soru-cevap-sayisi").textContent = `${r.cevap_sayisi} / ${r.katilimcilar.length} cevapladı`;
      // Herkes cevapladıysa beklemeye gerek yok.
      if (r.katilimcilar.length > 0 && r.cevap_sayisi >= r.katilimcilar.length) soruyuBitir();
    }
  }

  async function oyuncuCikar(id, ad) {
    if (!confirm(`"${ad}" yarışmadan çıkarılsın mı?`)) return;
    if (await ogretmen("cikar", { oyuncu_id: id })) lobiDongusu();
  }

  // ───────── soru ─────────

  function sikListesi(ol, soru, sinif = () => "") {
    ol.replaceChildren(
      ...soru.siklar.map((metin, i) => {
        const li = el("li", `${SINIFLAR[i]} ${sinif(i)}`);
        li.append(el("span", "sekil", SEKILLER[i]), el("span", "harf", `${D.HARFLER[i]})`), el("span", "", metin));
        return li;
      }),
    );
  }

  /** Soru, sunucu yanıtını (~1,5 sn) beklemeden tahtada açılır; sayaç ve müzik yanıt gelince başlar. */
  async function soruBaslat(n) {
    if (mesgul) return;
    const oncekiNo = durum.soruNo;
    const oncekiEkran = durum.faz;
    const soru = durum.set.sorular[n - 1];
    durum.soruNo = n;
    $("soru-metni").textContent = soru.metin;
    const gorsel = $("soru-gorseli");
    gorsel.hidden = !soru.gorsel;
    if (soru.gorsel) gorsel.src = soru.gorsel;
    sikListesi($("soru-siklar"), soru);
    $("soru-cevap-sayisi").textContent = `0 / ${durum.katilimciSayisi} cevapladı`;
    $("sure-doldu").hidden = true;
    clearInterval(sayacZamanlayici);
    $("soru-sayac").textContent = soru.sure;
    $("sure-dolgu").style.width = "100%";
    Ses.durdur();
    ekran("soru");
    const r = await ogretmen("soruBaslat", { soru_no: n });
    if (!r) {
      durum.soruNo = oncekiNo;
      ekran(oncekiEkran);
      return;
    }
    sayacBaslat(r.sure_sn);
    Ses.soruMuzigi(r.sure_sn);
  }

  function sayacBaslat(sureSn) {
    clearInterval(sayacZamanlayici);
    const bitis = performance.now() + sureSn * 1000;
    const guncelle = () => {
      const kalan = Math.max(0, bitis - performance.now());
      $("soru-sayac").textContent = Math.ceil(kalan / 1000);
      $("sure-dolgu").style.width = `${(kalan / (sureSn * 1000)) * 100}%`;
      if (kalan <= 0) {
        clearInterval(sayacZamanlayici);
        $("sure-doldu").hidden = false;
        sayacZamanlayici = setTimeout(soruyuBitir, TOLERANS_MS);
      }
    };
    guncelle();
    sayacZamanlayici = setInterval(guncelle, 100);
  }

  async function soruyuBitir() {
    if (durum.faz !== "soru") return;
    clearInterval(sayacZamanlayici);
    clearTimeout(sayacZamanlayici);
    durum.faz = "bitiriliyor";
    clearTimeout(lobiZamanlayici);
    const r = await ogretmen("soruBitir");
    if (!r) {
      durum.faz = "soru"; // tekrar Boşluk ile denenebilir
      lobiDongusu();
      return;
    }
    sonucGoster(r);
  }

  // ───────── sonuç ─────────

  function sonucGoster(r) {
    Ses.sonuc();
    const soru = durum.set.sorular[r.soru_no - 1];
    $("sonuc-metni").textContent = soru.metin;
    const sinif = (i) => (i === r.dogru ? "dogru-sik" : "soluk-sik");
    sikListesi($("sonuc-siklar"), soru, sinif);

    const enCok = Math.max(1, ...r.dagilim);
    $("sonuc-dagilim").replaceChildren(
      ...r.dagilim.map((sayi, i) => {
        const c = el("div", `cubuk ${sinif(i)}`);
        const govde = el("div", `govde ${SINIFLAR[i]}`);
        govde.style.height = "0%";
        requestAnimationFrame(() => requestAnimationFrame(() => (govde.style.height = `${(sayi / enCok) * 75}%`)));
        c.append(el("div", "deger", sayi), govde, el("div", "etiket", `${SEKILLER[i]} ${i === r.dogru ? "✓" : ""}`));
        return c;
      }),
    );

    $("sonuc-ilk5").replaceChildren(...r.ilk5.map((o, i) => siralamaSatiri(i + 1, o.ad, `${o.puan}`)));
    ekran("sonuc");
  }

  function siralamaSatiri(sira, ad, sag) {
    const li = el("li");
    li.append(el("span", "sira", `${sira}.`), el("span", "ad", ad), el("span", "", sag));
    return li;
  }

  // ───────── podyum ─────────

  async function oturumuBitir() {
    const r = await ogretmen("oturumBitir");
    if (!r) return;
    D.sakla.koy("duello_tahta", null);
    durum.oturum = null;
    const podyum = $("podyum");
    const sirali = r.siralama;
    podyum.replaceChildren(
      ...[1, 0, 2]
        .filter((i) => sirali[i])
        .map((i) => {
          const b = el("div", `basamak b${i + 1}`);
          b.append(el("div", "ad", sirali[i].ad), el("div", "puan", `${sirali[i].puan} puan`), el("div", "blok", sirali[i].sira));
          return b;
        }),
    );
    $("tam-siralama").replaceChildren(
      ...sirali.map((o) => siralamaSatiri(o.sira, o.ad, `${o.puan} · ${o.dogru_sayisi}/${r.soru_sayisi} doğru`)),
    );
    ekran("podyum");
    Ses.kutlama();
    setTimeout(() => Ses.konfeti(), 1600); // davul gürlemesi bitince
  }

  // ───────── dönem ─────────

  async function donemGoster() {
    durum.anahtar = durum.anahtar || $("anahtar").value.trim();
    if (!durum.anahtar) return bildir("Öğretmen anahtarını girin.");
    let r;
    try {
      r = await D.get("donem", { anahtar: durum.anahtar });
    } catch (e) {
      return bildir(D.hataMetni(e));
    }
    D.sakla.koy("duello_anahtar", durum.anahtar);
    $("donem-satirlar").replaceChildren(
      ...r.tablo.map((o, i) => {
        const tr = el("tr");
        tr.append(
          el("td", "", i + 1),
          el("td", "", o.ad),
          el("td", "", o.katildigi_ders),
          el("td", "", o.toplam_puan),
          el("td", "", `%${Math.round(o.dogru_orani * 100)}`),
        );
        return tr;
      }),
    );
    if (!r.tablo.length) {
      const tr = el("tr");
      const td = el("td", "soluk", "Henüz biten oturum yok.");
      td.colSpan = 5;
      tr.append(td);
      $("donem-satirlar").append(tr);
    }
    ekran("donem");
  }

  // ───────── akış ─────────

  function ileri() {
    if (mesgul) return;
    if (durum.faz === "lobi") {
      if (durum.soruNo < soruSayisi()) soruBaslat(durum.soruNo + 1);
      else oturumuBitir();
    } else if (durum.faz === "soru") {
      soruyuBitir();
    } else if (durum.faz === "sonuc") {
      if (durum.soruNo < soruSayisi()) soruBaslat(durum.soruNo + 1);
      else oturumuBitir();
    }
  }

  function sesGuncelle() {
    $("ses-dugme").textContent = Ses.kapaliMi() ? "🔇" : "🔊";
  }

  function sesDegistir() {
    Ses.sesDegistir();
    sesGuncelle();
  }

  function tamEkran() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => {});
  }

  document.addEventListener("keydown", (e) => {
    if ((e.target.closest && e.target.closest("input, select, textarea")) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code === "Space") {
      e.preventDefault();
      ileri();
    } else if (e.key === "f" || e.key === "F") {
      tamEkran();
    } else if (e.key === "g" || e.key === "G" || e.key === "ğ") {
      gizleDegistir();
    } else if (e.key === "s" || e.key === "S" || e.key === "ş") {
      sesDegistir();
    }
  });

  $("ileri").addEventListener("click", ileri);
  $("tam-ekran").addEventListener("click", tamEkran);
  $("ses-dugme").addEventListener("click", sesDegistir);
  $("anahtar").addEventListener("change", setleriYukle);
  $("gizle-dugme").addEventListener("click", gizleDegistir);
  $("acilis-formu").addEventListener("submit", oturumAc);
  $("devam-dugme").addEventListener("click", devamEt);
  $("donem-ac").addEventListener("click", donemGoster);
  $("podyum-donem").addEventListener("click", donemGoster);
  $("donem-geri").addEventListener("click", () => ekran(durum.oncekiEkran));
  $("yeni-oturum").addEventListener("click", () => {
    Object.assign(durum, { set: null, dosya: null, oturum: null, soruNo: 0 });
    devamKutusu();
    ekran("acilis");
  });

  $("anahtar").value = durum.anahtar;
  sesGuncelle();
  if (!D.ayar.APPS_SCRIPT_URL) bildir(D.hataMetni({ kod: "ayar_yok" }));
  qrCiz();
  // Apps Script uzun süre çağrılmayınca ilk istek ~10 sn sürer; öğretmen oturumu açmadan ısıt.
  D.get("durum", {}, 0).catch(() => {});
  setleriYukle();
  devamKutusu();
  ekran("acilis");
})();
