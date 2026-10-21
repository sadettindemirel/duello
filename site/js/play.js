// Telefon ekranı: giriş → bekle → 4 renkli buton → cevabın alındı → kendi sonucu.
(() => {
  const D = Duello;
  const $ = (id) => document.getElementById(id);
  const ARALIK = D.ayar.DURUM_ARALIK_MS || 2000;

  // profil: oyuncu_id (görünmez, kalıcı), ad, okul_no, katildigi (oturum), sunucu_ad ("Ayşe 2" gibi)
  const profil = D.sakla.al("duello_profil", {});
  if (!profil.oyuncu_id) profil.oyuncu_id = D.yeniId();
  const kaydet = () => D.sakla.koy("duello_profil", profil);
  kaydet();

  let girisModu = !profil.ad;
  let gosterilenSoru = null; // butonları gösterilen "oturum:soru"
  let kapananSoru = null; // bu sayfada cevaplanan / süresi dolan soru: { k, ikon, baslik, metin }
  let gonderiliyor = false;
  let zamanlayici = null;
  let sorguda = false;

  const soruAnahtari = (d) => `${d.oturum}:${d.soru_no}`;

  function ekran(ad) {
    D.ekranGoster(ad);
    document.body.classList.remove("dogru", "yanlis");
    if (ad !== "soru") gosterilenSoru = null;
    const ust = $("ust");
    ust.hidden = ad === "giris" || !profil.ad;
    $("ust-ad").textContent = profil.sunucu_ad || profil.ad || "";
  }

  function bekleGoster(baslik, metin = "") {
    $("bekle-baslik").textContent = baslik;
    $("bekle-metin").textContent = metin;
    ekran("bekle");
  }

  function bilgiGoster({ ikon, baslik, metin }) {
    $("gonderildi-ikon").textContent = ikon;
    $("gonderildi-baslik").textContent = baslik;
    $("gonderildi-metin").textContent = metin;
    ekran("gonderildi");
  }

  const ALINDI = { ikon: "✓", baslik: "Cevabın alındı", metin: "Süre bitince sonucunu göreceksin." };
  const SURE_DOLDU = { ikon: "⏱", baslik: "Süre doldu", metin: "Sonuç için tahtaya bak." };

  function girisAc(hata = "") {
    girisModu = true;
    $("ad").value = profil.ad || "";
    $("okul-no").value = profil.okul_no || "";
    $("giris-hata").textContent = hata;
    $("giris-hata").hidden = !hata;
    ekran("giris");
  }

  function soruGoster(d) {
    $("soru-no").textContent = `Soru ${d.soru_no}`;
    document.querySelectorAll(".sik").forEach((b) => {
      b.disabled = false;
      b.classList.remove("secili");
    });
    ekran("soru");
    gosterilenSoru = soruAnahtari(d);
  }

  function sonucGoster(d) {
    const s = d.sonuc;
    ekran("sonuc");
    if (!s) {
      $("sonuc-ikon").textContent = "😶";
      $("sonuc-baslik").textContent = "Bu soruyu cevaplamadın";
      $("sonuc-puan").textContent = "";
      return;
    }
    document.body.classList.add(s.dogru_mu ? "dogru" : "yanlis");
    $("sonuc-ikon").textContent = s.dogru_mu ? "🎉" : "✗";
    $("sonuc-baslik").textContent = s.dogru_mu ? "Doğru!" : "Yanlış";
    $("sonuc-puan").textContent = `+${s.puan} puan`;
  }

  async function katil(oturum) {
    try {
      const r = await D.post("katil", {
        oturum,
        oyuncu_id: profil.oyuncu_id,
        ad: profil.ad,
        okul_no: profil.okul_no || "",
      });
      profil.katildigi = oturum;
      profil.sunucu_ad = r.ad;
      kaydet();
      return true;
    } catch (e) {
      if (e.kod === "uygunsuz_ad" || e.kod === "ad_bos") girisAc(D.hataMetni(e));
      else bekleGoster("Katılınamadı", D.hataMetni(e));
      return false;
    }
  }

  async function durumuIsle(d) {
    if (girisModu) return;
    if (d.cikarildi && profil.katildigi === d.oturum) {
      profil.ad = "";
      profil.katildigi = null;
      profil.sunucu_ad = "";
      kaydet();
      girisAc("Öğretmen seni yarışmadan çıkardı. Başka bir adla katılabilirsin.");
      return;
    }
    if (!d.oturum || (d.faz === "bitti" && profil.katildigi !== d.oturum)) {
      bekleGoster("Yarışma henüz başlamadı", "Öğretmen başlatınca burada olacaksın.");
      return;
    }
    if (profil.katildigi !== d.oturum && !(await katil(d.oturum))) return;

    if (d.faz === "bekle") {
      bekleGoster("Tahtaya bak", `Hazırsın, ${profil.sunucu_ad}! Yarışma birazdan başlıyor.`);
    } else if (d.faz === "soru") {
      if (gonderiliyor) return;
      const k = soruAnahtari(d);
      if (kapananSoru && kapananSoru.k === k) bilgiGoster(kapananSoru);
      else if (d.cevapladi) bilgiGoster(ALINDI);
      else if (d.kalan_ms <= 0) bilgiGoster(SURE_DOLDU);
      else if (gosterilenSoru !== k) soruGoster(d);
    } else if (d.faz === "sonuc") {
      sonucGoster(d);
    } else if (d.faz === "bitti") {
      ekran("bitti");
    }
  }

  async function dongu() {
    clearTimeout(zamanlayici);
    if (sorguda) return;
    sorguda = true;
    try {
      const d = await D.get("durum", { oyuncu_id: profil.oyuncu_id }, 0);
      $("baglanti-uyari").hidden = true;
      await durumuIsle(d);
    } catch (e) {
      if (e.kod === "ayar_yok") {
        bekleGoster("Kurulum eksik", D.hataMetni(e));
        return;
      }
      $("baglanti-uyari").hidden = false;
    } finally {
      sorguda = false;
    }
    zamanlayici = setTimeout(dongu, ARALIK);
  }

  async function cevapla(sik) {
    if (gonderiliyor || !gosterilenSoru) return;
    const [oturum, soruNo] = [profil.katildigi, Number(gosterilenSoru.split(":").pop())];
    const k = gosterilenSoru;
    gonderiliyor = true;
    document.querySelectorAll(".sik").forEach((b) => {
      b.disabled = true;
      b.classList.toggle("secili", Number(b.dataset.sik) === sik);
    });
    try {
      await D.post("cevap", { oturum, oyuncu_id: profil.oyuncu_id, soru_no: soruNo, sik });
      kapananSoru = { k, ...ALINDI };
    } catch (e) {
      if (e.kod === "zaten_cevaplandi") kapananSoru = { k, ...ALINDI };
      else if (e.kod === "sure_doldu" || e.kod === "soru_aktif_degil") kapananSoru = { k, ...SURE_DOLDU, metin: D.hataMetni(e) };
      else {
        // Kalıcı olmayan bir hata: mesajı göster, sonraki durum sorgusunda butonlar geri gelir.
        bilgiGoster({ ikon: "⚠️", baslik: "Gönderilemedi", metin: `${D.hataMetni(e)} Tekrar dene.` });
        return;
      }
    } finally {
      gonderiliyor = false;
    }
    bilgiGoster(kapananSoru);
  }

  document.querySelectorAll(".sik").forEach((b) => {
    b.addEventListener("click", () => cevapla(Number(b.dataset.sik)));
  });

  $("zar").addEventListener("click", () => {
    $("ad").value = window.rastgeleAd();
  });

  $("degistir").addEventListener("click", () => girisAc());

  $("giris-formu").addEventListener("submit", (e) => {
    e.preventDefault();
    const ad = $("ad").value.replace(/\s+/g, " ").trim();
    if (!ad) {
      $("giris-hata").textContent = D.hataMetni({ kod: "ad_bos" });
      $("giris-hata").hidden = false;
      return;
    }
    profil.ad = ad;
    profil.okul_no = $("okul-no").value.trim();
    profil.katildigi = null; // yeni adla yeniden katıl
    profil.sunucu_ad = "";
    kaydet();
    girisModu = false;
    bekleGoster("Bağlanıyor…");
    dongu();
  });

  if (girisModu) girisAc();
  else bekleGoster("Bağlanıyor…");
  dongu();
})();
