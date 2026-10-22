// Tablodan (CSV, Excel, Google E-Tablolar) soru seti okuma. Başlık satırındaki sütun adları esnektir:
// "Soru", "A" / "A şıkkı" / "Seçenek A", "Doğru" / "Doğru cevap" / "Cevap", "Süre", "Görsel", "Kazanım".
window.DuelloTablo = (() => {
  const EXCEL_KUTUPHANESI = "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js";
  const VARSAYILAN_SURE = 20;
  const HARFLER = "abcd";
  const TR = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" };

  /** "Doğru Cevap (A-D)" → "dogrucevapad" */
  const sade = (s) =>
    String(s ?? "")
      .toLocaleLowerCase("tr")
      .replace(/[çğıöşü]/g, (h) => TR[h])
      .replace(/[^a-z0-9]/g, "");

  const SIK_DESENI = /^(?:sik|secenek|cevap|yanit|option|choice)?([abcd])(?:sikki|secenegi|sik|secenek)?$/;

  /** Başlık hücresinin hangi alana karşılık geldiği: "soru", 0–3 (şık), "dogru", "sure", "gorsel", "kazanim" ya da null. */
  function sutunTuru(baslik) {
    const n = sade(baslik);
    if (!n) return null;
    const sik = n.match(SIK_DESENI);
    if (sik) return HARFLER.indexOf(sik[1]);
    if (n === "soru" || n.startsWith("sorumetni") || n === "metin" || n === "question") return "soru";
    if (n.startsWith("dogru") || ["cevap", "cevapanahtari", "anahtar", "answer", "correct", "correctanswer"].includes(n)) return "dogru";
    if (n.startsWith("sure") || ["zaman", "saniye", "time"].includes(n)) return "sure";
    if (n.startsWith("gorsel") || n.startsWith("resim") || ["image", "img", "url", "link", "foto", "fotograf"].includes(n)) return "gorsel";
    if (n.startsWith("kazanim") || ["outcome", "objective"].includes(n)) return "kazanim";
    return null;
  }

  /** İlk 5 satırda başlık arar: "soru" sütunu ve en az iki şık sütunu olan satır. */
  function basligiBul(satirlar) {
    for (let i = 0; i < Math.min(5, satirlar.length); i++) {
      const harita = {};
      satirlar[i].forEach((hucre, j) => {
        const tur = sutunTuru(hucre);
        if (tur !== null && !(tur in harita)) harita[tur] = j;
      });
      if ("soru" in harita && [0, 1, 2, 3].filter((k) => k in harita).length >= 2) return { satir: i, harita };
    }
    return null;
  }

  /** Doğru cevap: harf (A, "b şıkkı", "C)"), sayı (1–4) ya da şıkkın kendisi. Anlaşılamazsa null. */
  function dogruCoz(deger, siklar) {
    const n = sade(deger);
    if (!n) return null;
    const harf = n.match(SIK_DESENI);
    if (harf) return HARFLER.indexOf(harf[1]);
    if (/^[1-4]$/.test(n)) return Number(n) - 1;
    const i = siklar.findIndex((s) => sade(s) === n);
    return i >= 0 ? i : null;
  }

  /** Satırlar (string[][]) → { set, uyarilar }. Eksikler uyarı olarak döner; öğretmen formda düzeltir. */
  function tablodanSet(satirlar, baslik) {
    const uyarilar = [];
    satirlar = satirlar.map((r) => r.map((h) => String(h ?? "").trim()));
    let bulunan = basligiBul(satirlar);
    if (!bulunan) {
      bulunan = { satir: -1, harita: { soru: 0, 0: 1, 1: 2, 2: 3, 3: 4, dogru: 5, sure: 6 } };
      uyarilar.push("Başlık satırı bulunamadı; sütunlar sırasıyla Soru, A, B, C, D, Doğru, Süre kabul edildi.");
    }
    const { harita } = bulunan;
    const hucre = (r, tur) => (tur in harita ? r[harita[tur]] || "" : "");
    const sorular = [];
    satirlar.slice(bulunan.satir + 1).forEach((r, i) => {
      if (!r.some(Boolean)) return;
      const satirNo = bulunan.satir + i + 2;
      const metin = hucre(r, "soru");
      if (!metin) {
        uyarilar.push(`${satirNo}. satır atlandı: soru metni boş.`);
        return;
      }
      const no = sorular.length + 1;
      const siklar = [0, 1, 2, 3].map((k) => hucre(r, k));
      const soru = { metin, gorsel: hucre(r, "gorsel") || null, siklar, dogru: dogruCoz(hucre(r, "dogru"), siklar) };
      if (siklar.some((s) => !s)) uyarilar.push(`Soru ${no}: boş şık var.`);
      if (soru.dogru === null) {
        const d = hucre(r, "dogru");
        uyarilar.push(d ? `Soru ${no}: doğru cevap anlaşılamadı ("${d}"); formda seçin.` : `Soru ${no}: doğru cevap yok; formda seçin.`);
      }
      const sure = hucre(r, "sure");
      if (sure) {
        const sn = parseFloat(sure.replace(",", "."));
        if (sn > 0) soru.sure = sn;
        else uyarilar.push(`Soru ${no}: süre anlaşılamadı ("${sure}"); varsayılan kullanılacak.`);
      }
      if (hucre(r, "kazanim")) soru.kazanim = hucre(r, "kazanim");
      sorular.push(soru);
    });
    return { set: { id: "", baslik: baslik || "", varsayilan_sure: VARSAYILAN_SURE, sorular }, uyarilar };
  }

  /** CSV/TSV metni → satırlar. Ayraç ilk satırdan seçilir (Türkçe Excel ";" kullanır). */
  function csvCoz(metin) {
    metin = metin.replace(/^﻿/, "");
    const ilk = metin.split(/\r?\n/, 1)[0];
    const ayrac = ["\t", ";", ","].map((a) => [a, ilk.split(a).length]).sort((x, y) => y[1] - x[1])[0][0];
    const satirlar = [];
    let satir = [];
    let hucre = "";
    let tirnakta = false;
    for (let i = 0; i < metin.length; i++) {
      const c = metin[i];
      if (tirnakta) {
        if (c === '"' && metin[i + 1] === '"') {
          hucre += '"';
          i++;
        } else if (c === '"') tirnakta = false;
        else hucre += c;
      } else if (c === '"' && hucre === "") tirnakta = true;
      else if (c === ayrac) {
        satir.push(hucre);
        hucre = "";
      } else if (c === "\n" || c === "\r") {
        if (c === "\r" && metin[i + 1] === "\n") i++;
        satir.push(hucre);
        satirlar.push(satir);
        satir = [];
        hucre = "";
      } else hucre += c;
    }
    if (hucre || satir.length) {
      satir.push(hucre);
      satirlar.push(satir);
    }
    return satirlar;
  }

  /** UTF-8 değilse Türkçe Windows kodlaması (Excel'in "CSV" kaydı) varsayılır. */
  function metneCevir(tampon) {
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(tampon);
    } catch (e) {
      return new TextDecoder("windows-1254").decode(tampon);
    }
  }

  let excelYukleniyor = null;
  function excelKutuphanesi() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    excelYukleniyor ||= new Promise((coz, reddet) => {
      const s = document.createElement("script");
      s.src = EXCEL_KUTUPHANESI;
      s.onload = () => coz(window.XLSX);
      s.onerror = () => {
        excelYukleniyor = null;
        reddet(new Error("Excel okuyucu yüklenemedi. İnternet bağlantısını kontrol edin ya da dosyayı CSV olarak kaydedin."));
      };
      document.head.append(s);
    });
    return excelYukleniyor;
  }

  /** Dosya → { satirlar, uyarilar }. Excel'de yalnızca ilk sayfa okunur. */
  async function dosyadanSatirlar(dosya) {
    const uzanti = dosya.name.split(".").pop().toLowerCase();
    const tampon = await dosya.arrayBuffer();
    if (["csv", "tsv", "txt"].includes(uzanti)) return { satirlar: csvCoz(metneCevir(tampon)), uyarilar: [] };
    if (!["xlsx", "xls", "ods"].includes(uzanti)) {
      throw new Error("Desteklenen dosyalar: Excel (.xlsx, .xls), .ods, .csv ve Düello .json.");
    }
    const XLSX = await excelKutuphanesi();
    const kitap = XLSX.read(tampon, { type: "array" });
    const ad = kitap.SheetNames[0];
    const satirlar = XLSX.utils.sheet_to_json(kitap.Sheets[ad], { header: 1, raw: false, defval: "", blankrows: false });
    const uyarilar = kitap.SheetNames.length > 1 ? [`Dosyada ${kitap.SheetNames.length} sayfa var; yalnızca ilki ("${ad}") alındı.`] : [];
    return { satirlar, uyarilar };
  }

  /** Öğretmenin doldurabileceği örnek dosya (Türkçe Excel'de doğru açılsın diye ";" ve BOM). */
  function ornekCsv() {
    const satirlar = [
      ["Soru", "A", "B", "C", "D", "Doğru", "Süre", "Görsel", "Kazanım"],
      ["Bir atomun çekirdeğinde hangi tanecikler bulunur?", "Proton ve elektron", "Yalnızca elektron", "Proton ve nötron", "Nötron ve elektron", "C", "20", "", "9.2.1"],
      ["Aşağıdakilerden hangisi bir soy gazdır?", "Oksijen", "Azot", "Klor", "Neon", "D", "", "", ""],
    ];
    const kacis = (h) => (/[";\n]/.test(h) ? `"${h.replace(/"/g, '""')}"` : h);
    return "﻿" + satirlar.map((r) => r.map(kacis).join(";")).join("\r\n") + "\r\n";
  }

  return { tablodanSet, csvCoz, dosyadanSatirlar, ornekCsv };
})();
