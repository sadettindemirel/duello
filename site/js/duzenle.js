// Soru düzenleyici: öğretmen anahtarıyla girilir; setler Sheet'teki `setler` / `sorular` sekmelerine kaydedilir.
(() => {
  const D = Duello;
  const $ = (id) => document.getElementById(id);
  const GORSEL_EN_UZUN = 1600; // px; büyük fotoğraflar yüklenmeden önce küçültülür
  const GORSEL_EN_BUYUK = 5 * 1024 * 1024;

  const durum = {
    anahtar: D.sakla.al("duello_anahtar", ""),
    setler: [],
    eskiId: null, // kaydedilmiş setin Sheet'teki kısa adı; yeni sette null
    kisaAdElle: false, // öğretmen kısa adı kendisi yazdıysa başlıktan üretme
    degisti: false,
  };
  let kartSayaci = 0;

  // ───────── yardımcılar ─────────

  function bildir(metin, tur = "hata") {
    const el = $("bildirim");
    el.textContent = metin;
    el.dataset.tur = tur;
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

  /** "9A — Atom ve Periyodik" → "9a-atom-ve-periyodik" */
  function kisaAdUret(metin) {
    const harita = { ç: "c", ğ: "g", ı: "i", i: "i", ö: "o", ş: "s", ü: "u" };
    return metin
      .toLocaleLowerCase("tr")
      .replace(/[çğıöşü]/g, (h) => harita[h])
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40);
  }

  function degisti(deger = true) {
    durum.degisti = deger;
    $("kayit-durumu").textContent = deger ? "Kaydedilmemiş değişiklik var" : "";
  }

  const vazgecilsinMi = () => !durum.degisti || confirm("Kaydedilmemiş değişiklikler kaybolacak. Devam edilsin mi?");

  const ogretmenGet = (action, params = {}) => D.get(action, { anahtar: durum.anahtar, ...params });
  const ogretmenPost = (action, govde = {}, deneme = 0) => D.post(action, { anahtar: durum.anahtar, ...govde }, deneme);

  // ───────── giriş ve set listesi ─────────

  async function giris(e) {
    if (e) e.preventDefault();
    durum.anahtar = $("anahtar").value.trim() || durum.anahtar;
    if (!durum.anahtar) return D.ekranGoster("giris");
    try {
      await setleriYukle();
    } catch (err) {
      D.ekranGoster("giris");
      return hataYaz(err);
    }
    D.sakla.koy("duello_anahtar", durum.anahtar);
    D.ekranGoster("duzen");
    if (!$("sorular").children.length) yeniSet();
  }

  async function setleriYukle() {
    const r = await ogretmenGet("setler");
    durum.setler = r.setler;
    listeyiCiz();
  }

  function listeyiCiz() {
    $("setler").replaceChildren(
      ...durum.setler.map((s) => {
        const li = el("li");
        const b = el("button", s.id === durum.eskiId ? "secili" : "");
        b.type = "button";
        b.append(el("span", "set-adi", s.baslik), el("span", "soluk", `${s.soru_sayisi} soru`));
        b.addEventListener("click", () => setiAc(s.id));
        li.append(b);
        return li;
      }),
    );
    if (!durum.setler.length) $("setler").append(el("li", "soluk bos-liste", "Henüz set yok."));
  }

  async function setiAc(id) {
    if (!vazgecilsinMi()) return;
    let r;
    try {
      r = await ogretmenGet("set", { id });
    } catch (err) {
      return hataYaz(err);
    }
    setiCiz(r.set, id);
    hatalariGoster(r.hatalar);
  }

  function yeniSet() {
    if (!vazgecilsinMi()) return;
    setiCiz({ id: "", baslik: "", varsayilan_sure: 20, sorular: [{}] }, null);
    $("baslik").focus();
  }

  // ───────── form ↔ set ─────────

  function setiCiz(set, eskiId) {
    durum.eskiId = eskiId;
    durum.kisaAdElle = !!(eskiId || set.id);
    $("baslik").value = set.baslik || "";
    $("kisa-ad").value = set.id || "";
    $("varsayilan-sure").value = set.varsayilan_sure || 20;
    $("sorular").replaceChildren(...(set.sorular || []).map(kartOlustur));
    numaralandir();
    hatalariGoster([]);
    $("set-sil").hidden = !eskiId;
    degisti(false);
    listeyiCiz();
  }

  function formdanSet() {
    const varsayilan = Number($("varsayilan-sure").value);
    return {
      id: $("kisa-ad").value.trim(),
      baslik: $("baslik").value.trim(),
      varsayilan_sure: varsayilan > 0 ? varsayilan : null,
      sorular: [...$("sorular").children].map((kart) => {
        const alan = (ad) => kart.querySelector(`[data-alan="${ad}"]`).value.trim();
        const secili = kart.querySelector('input[type="radio"]:checked');
        const soru = {
          metin: alan("metin"),
          gorsel: alan("gorsel") || null,
          siklar: [0, 1, 2, 3].map((i) => kart.querySelector(`[data-sik="${i}"]`).value.trim()),
          dogru: secili ? Number(secili.value) : null,
        };
        if (alan("sure")) soru.sure = Number(alan("sure"));
        if (alan("kazanim")) soru.kazanim = alan("kazanim");
        return soru;
      }),
    };
  }

  function kartOlustur(soru = {}) {
    const kart = $("soru-sablonu").content.firstElementChild.cloneNode(true);
    const ad = `dogru-${++kartSayaci}`;
    kart.querySelectorAll('input[type="radio"]').forEach((r) => {
      r.name = ad;
      r.checked = Number(r.value) === soru.dogru;
    });
    kart.querySelector('[data-alan="metin"]').value = soru.metin || "";
    kart.querySelector('[data-alan="gorsel"]').value = soru.gorsel || "";
    kart.querySelector('[data-alan="sure"]').value = soru.sure || "";
    kart.querySelector('[data-alan="kazanim"]').value = soru.kazanim || "";
    (soru.siklar || []).forEach((m, i) => (kart.querySelector(`[data-sik="${i}"]`).value = m));
    onizlemeGuncelle(kart);
    return kart;
  }

  function numaralandir() {
    const kartlar = [...$("sorular").children];
    kartlar.forEach((k, i) => {
      k.querySelector(".soru-no").textContent = `Soru ${i + 1}`;
      k.querySelector('[data-is="yukari"]').disabled = i === 0;
      k.querySelector('[data-is="asagi"]').disabled = i === kartlar.length - 1;
      k.querySelector('[data-is="sil"]').disabled = kartlar.length === 1;
    });
  }

  function hatalariGoster(hatalar) {
    const ul = $("hatalar");
    ul.replaceChildren(...hatalar.map((h) => el("li", "", h)));
    ul.hidden = !hatalar.length;
  }

  // ───────── görsel ─────────

  function onizlemeGuncelle(kart) {
    const url = kart.querySelector('[data-alan="gorsel"]').value.trim();
    const kutu = kart.querySelector(".onizleme");
    const img = kutu.querySelector("img");
    const hata = kutu.querySelector(".gorsel-hata");
    kutu.hidden = !url;
    kart.querySelector('[data-is="gorsel-kaldir"]').hidden = !url;
    if (!url) return img.removeAttribute("src");
    hata.hidden = true;
    img.hidden = false;
    img.onerror = () => {
      img.hidden = true;
      hata.hidden = false;
    };
    img.src = D.gorselAdresi(url);
  }

  const dataUrlVerisi = (dataUrl) => dataUrl.slice(dataUrl.indexOf(",") + 1);

  function dosyaOku(dosya) {
    return new Promise((coz, reddet) => {
      const okuyucu = new FileReader();
      okuyucu.onload = () => coz(okuyucu.result);
      okuyucu.onerror = () => reddet(new Error("Dosya okunamadı."));
      okuyucu.readAsDataURL(dosya);
    });
  }

  /** Büyük resmi en uzun kenarı GORSEL_EN_UZUN olacak şekilde küçültür. GIF olduğu gibi kalır (hareketli olabilir). */
  async function gorseliHazirla(dosya) {
    if (dosya.type === "image/gif") {
      if (dosya.size > GORSEL_EN_BUYUK) throw new Error("GIF 5 MB'tan büyük olamaz.");
      return { tur: "image/gif", veri: dataUrlVerisi(await dosyaOku(dosya)) };
    }
    const resim = await createImageBitmap(dosya);
    const oran = Math.min(1, GORSEL_EN_UZUN / Math.max(resim.width, resim.height));
    const tuval = document.createElement("canvas");
    tuval.width = Math.round(resim.width * oran);
    tuval.height = Math.round(resim.height * oran);
    tuval.getContext("2d").drawImage(resim, 0, 0, tuval.width, tuval.height);
    // PNG (şema, grafik) keskin kalsın; fotoğraflar JPEG.
    let tur = dosya.type === "image/png" ? "image/png" : "image/jpeg";
    let dataUrl = tuval.toDataURL(tur, 0.88);
    if (dataUrl.length * 0.75 > GORSEL_EN_BUYUK) {
      tur = "image/jpeg";
      dataUrl = tuval.toDataURL(tur, 0.85);
    }
    return { tur, veri: dataUrlVerisi(dataUrl) };
  }

  async function gorselYukle(kart, dosya) {
    if (!dosya || !dosya.type.startsWith("image/")) return bildir("Yalnızca resim dosyası yüklenebilir.");
    const giris = kart.querySelector('[data-alan="gorsel"]');
    const onceki = giris.placeholder;
    giris.placeholder = "Yükleniyor…";
    giris.value = "";
    kart.classList.add("yukleniyor");
    try {
      const { tur, veri } = await gorseliHazirla(dosya);
      const ad = (dosya.name && dosya.name !== "image.png" ? dosya.name : `soru-${Date.now()}`).replace(/\.\w+$/, "");
      const r = await ogretmenPost("gorselYukle", { ad, tur, veri });
      giris.value = r.url;
      degisti();
    } catch (err) {
      hataYaz(err);
    } finally {
      giris.placeholder = onceki;
      kart.classList.remove("yukleniyor");
      onizlemeGuncelle(kart);
    }
  }

  // ───────── kaydet / sil / içe-dışa aktar ─────────

  async function kaydet(e) {
    if (e) e.preventDefault();
    const form = $("set-formu");
    if (!form.reportValidity()) return;
    const set = formdanSet();
    $("kaydet").disabled = true;
    $("kayit-durumu").textContent = "Kaydediliyor…";
    try {
      await ogretmenPost("setKaydet", { set, eski_id: durum.eskiId || "" });
    } catch (err) {
      $("kayit-durumu").textContent = "Kaydedilemedi";
      if (err.kod === "gecersiz_set" && Array.isArray(err.detay)) hatalariGoster(err.detay);
      return hataYaz(err);
    } finally {
      $("kaydet").disabled = false;
    }
    durum.eskiId = set.id;
    durum.kisaAdElle = true;
    hatalariGoster([]);
    $("set-sil").hidden = false;
    degisti(false);
    $("kayit-durumu").textContent = "Kaydedildi ✓ Tahtada listede görünür.";
    try {
      await setleriYukle();
    } catch (err) {
      // Liste bir sonraki açılışta yenilenir.
    }
  }

  async function setiSil() {
    if (!durum.eskiId) return;
    if (!confirm(`"${$("baslik").value}" seti silinsin mi? Bu geri alınamaz.`)) return;
    try {
      await ogretmenPost("setSil", { id: durum.eskiId });
    } catch (err) {
      return hataYaz(err);
    }
    degisti(false);
    await setleriYukle().catch(() => {});
    yeniSet();
    bildir("Set silindi.", "bilgi");
  }

  function jsonIndir() {
    const set = formdanSet();
    const ad = set.id || "soru-seti";
    const blob = new Blob([JSON.stringify({ ...set, id: ad }, null, 2) + "\n"], { type: "application/json" });
    const a = el("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${ad}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  /** Var olan setlerle çakışmayan kısa ad: "9a-atom", "9a-atom-2", … */
  function bosKisaAd(taban) {
    const kullanilan = new Set(durum.setler.map((s) => s.id));
    let id = taban;
    for (let n = 2; kullanilan.has(id); n++) id = `${taban}-${n}`;
    return id;
  }

  /** İçe aktarılan seti forma yeni set olarak yükler; kaydetmeden önce öğretmen kontrol eder. */
  function iceAktarilanSet(set, uyarilar = []) {
    if (!set.sorular.length) {
      return bildir("Tabloda soru bulunamadı. İlk satırda Soru, A, B, C, D ve Doğru başlıkları olmalı.");
    }
    set.id = bosKisaAd(set.id || kisaAdUret(set.baslik) || "set");
    setiCiz(set, null);
    degisti();
    hatalariGoster(uyarilar);
    bildir(`${set.sorular.length} soru yüklendi. Kontrol edip Kaydet'e basın.`, "bilgi");
  }

  async function iceAktar(e) {
    const dosya = e.target.files[0];
    e.target.value = "";
    if (!dosya || !vazgecilsinMi()) return;
    const ad = dosya.name.replace(/\.[^.]+$/, "");
    try {
      if (/\.json$/i.test(dosya.name)) {
        const set = JSON.parse(await dosya.text());
        if (!set || !Array.isArray(set.sorular)) throw new Error("Dosya bir Düello soru seti (JSON) değil.");
        return iceAktarilanSet(set);
      }
      const { satirlar, uyarilar } = await DuelloTablo.dosyadanSatirlar(dosya);
      const sonuc = DuelloTablo.tablodanSet(satirlar, ad);
      iceAktarilanSet(sonuc.set, uyarilar.concat(sonuc.uyarilar));
    } catch (err) {
      hataYaz(err instanceof SyntaxError ? new Error("Dosya okunamadı.") : err);
    }
  }

  async function linktenGetir(e) {
    e.preventDefault();
    const url = $("tablo-linki").value.trim();
    if (!url || !vazgecilsinMi()) return;
    $("link-getir").disabled = true;
    $("link-getir").textContent = "Getiriliyor…";
    try {
      const r = await ogretmenGet("tabloOku", { url });
      const sonuc = DuelloTablo.tablodanSet(r.satirlar, r.ad);
      iceAktarilanSet(sonuc.set, sonuc.uyarilar);
      $("tablo-linki").value = "";
    } catch (err) {
      hataYaz(err);
    } finally {
      $("link-getir").disabled = false;
      $("link-getir").textContent = "Getir";
    }
  }

  function ornekIndir() {
    const a = el("a");
    a.href = URL.createObjectURL(new Blob([DuelloTablo.ornekCsv()], { type: "text/csv" }));
    a.download = "duello-ornek.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ───────── olaylar ─────────

  const sorular = $("sorular");

  sorular.addEventListener("click", (e) => {
    const dugme = e.target.closest("[data-is]");
    if (!dugme) return;
    const kart = dugme.closest(".soru-karti");
    const is = dugme.dataset.is;
    if (is === "yukari" && kart.previousElementSibling) kart.previousElementSibling.before(kart);
    else if (is === "asagi" && kart.nextElementSibling) kart.nextElementSibling.after(kart);
    else if (is === "kopyala") {
      const kopya = formdanSet().sorular[[...sorular.children].indexOf(kart)];
      kart.after(kartOlustur(kopya));
    } else if (is === "sil") {
      if (kart.querySelector('[data-alan="metin"]').value.trim() && !confirm("Bu soru silinsin mi?")) return;
      kart.remove();
    } else if (is === "gorsel-kaldir") {
      kart.querySelector('[data-alan="gorsel"]').value = "";
      onizlemeGuncelle(kart);
    }
    numaralandir();
    degisti();
  });

  sorular.addEventListener("change", (e) => {
    const kart = e.target.closest(".soru-karti");
    if (e.target.dataset.alan === "dosya") gorselYukle(kart, e.target.files[0]);
    else if (e.target.dataset.alan === "gorsel") onizlemeGuncelle(kart);
  });

  sorular.addEventListener("dragover", (e) => {
    const kart = e.target.closest(".soru-karti");
    if (!kart || ![...e.dataTransfer.types].includes("Files")) return;
    e.preventDefault();
    kart.classList.add("surukle");
  });
  sorular.addEventListener("dragleave", (e) => {
    const kart = e.target.closest(".soru-karti");
    if (kart && !kart.contains(e.relatedTarget)) kart.classList.remove("surukle");
  });
  sorular.addEventListener("drop", (e) => {
    const kart = e.target.closest(".soru-karti");
    if (!kart || !e.dataTransfer.files.length) return;
    e.preventDefault();
    kart.classList.remove("surukle");
    gorselYukle(kart, e.dataTransfer.files[0]);
  });
  sorular.addEventListener("paste", (e) => {
    const kart = e.target.closest(".soru-karti");
    const dosya = [...e.clipboardData.files].find((f) => f.type.startsWith("image/"));
    if (!kart || !dosya) return;
    e.preventDefault();
    gorselYukle(kart, dosya);
  });

  $("set-formu").addEventListener("input", (e) => {
    if (e.target.id === "kisa-ad") durum.kisaAdElle = e.target.value.trim() !== "";
    if (e.target.id === "baslik" && !durum.kisaAdElle) $("kisa-ad").value = kisaAdUret(e.target.value);
    degisti();
  });
  $("set-formu").addEventListener("submit", kaydet);
  $("giris-formu").addEventListener("submit", giris);
  $("yeni-set").addEventListener("click", yeniSet);
  $("soru-ekle").addEventListener("click", () => {
    const kart = kartOlustur();
    sorular.append(kart);
    numaralandir();
    degisti();
    kart.querySelector('[data-alan="metin"]').focus();
  });
  $("set-sil").addEventListener("click", setiSil);
  $("json-indir").addEventListener("click", jsonIndir);
  $("ice-aktar").addEventListener("change", iceAktar);
  $("link-formu").addEventListener("submit", linktenGetir);
  $("ornek-indir").addEventListener("click", ornekIndir);

  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s" && !$("set-formu").closest("[hidden]")) {
      e.preventDefault();
      kaydet();
    }
  });
  addEventListener("beforeunload", (e) => {
    if (durum.degisti) e.preventDefault();
  });

  $("anahtar").value = durum.anahtar;
  if (!D.ayar.APPS_SCRIPT_URL) bildir(D.hataMetni({ kod: "ayar_yok" }));
  if (durum.anahtar) giris();
  else D.ekranGoster("giris");
})();
