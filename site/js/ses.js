// Tahtanın sesleri ve konfeti. Ses dosyası yok: hepsi Web Audio ile tarayıcıda üretilir.
// Tarayıcılar sesi ancak bir tuş/tıklamadan sonra açar; tahtada öğretmen zaten Boşluk'a basarak ilerler.
window.DuelloSes = (() => {
  const SAKLAMA = "duello_ses_kapali";
  let ctx = null;
  let ana = null; // ana ses düğmesi (kapat/aç)
  let kapali = Duello.sakla.al(SAKLAMA, false);
  let muzik = null; // { zamanlayici, sonraki, adim, bitis }

  function baglam() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      ana = ctx.createGain();
      ana.gain.value = kapali ? 0 : 0.8;
      ana.connect(ctx.destination);
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  /** Tek nota: dalga, frekans (Hz), başlangıç (ctx zamanı), süre (sn), ses düzeyi. */
  function nota(dalga, frekans, t, sure, duzey, cikis = ana) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = dalga;
    o.frequency.setValueAtTime(frekans, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(duzey, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + sure);
    o.connect(g).connect(cikis);
    o.start(t);
    o.stop(t + sure + 0.05);
  }

  let gurultuTamponu = null;
  /** Filtrelenmiş beyaz gürültü patlaması (tik, davul, alkış için). */
  function gurultu(t, sure, duzey, filtreHz, filtreTuru = "bandpass", q = 1) {
    if (!gurultuTamponu) {
      gurultuTamponu = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const v = gurultuTamponu.getChannelData(0);
      for (let i = 0; i < v.length; i++) v[i] = Math.random() * 2 - 1;
    }
    const k = ctx.createBufferSource();
    k.buffer = gurultuTamponu;
    const f = ctx.createBiquadFilter();
    f.type = filtreTuru;
    f.frequency.value = filtreHz;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(duzey, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + sure);
    k.connect(f).connect(g).connect(ana);
    k.start(t, Math.random() * 0.5);
    k.stop(t + sure + 0.05);
  }

  const hz = (yarimTon) => 440 * Math.pow(2, yarimTon / 12); // 0 = La4

  // ───────── soru müziği: tik-tak + gerilimli arka plan ─────────

  const TEMPO = 132;
  const SEKIZLIK = 60 / TEMPO / 2;
  // 4 ölçülük döngü (La minör: Am – F – C – G); her ölçü 8 sekizlik.
  const BAS = [-24, -28, -21, -26]; // La2, Fa2, Do3, Sol2
  const ARPEJ = [
    [0, 3, 7, 12],
    [-4, 0, 3, 8],
    [3, 7, 10, 15],
    [-2, 2, 5, 10],
  ];

  function adimCal(adim, t, kalanSn) {
    const olcu = Math.floor(adim / 8) % 4;
    const icinde = adim % 8;
    const sonSaniyeler = kalanSn <= 5;
    // Bas: her vuruşta, son saniyelerde her sekizlikte.
    if (icinde % 2 === 0 || sonSaniyeler) nota("triangle", hz(BAS[olcu]), t, SEKIZLIK * 1.6, 0.35);
    // Arpej: hafif kare dalga.
    nota("square", hz(ARPEJ[olcu][icinde % 4]), t, SEKIZLIK * 0.8, sonSaniyeler ? 0.06 : 0.04);
    // Tik-tak: vuruşlarda; son 5 saniyede her sekizlikte ve daha tiz.
    if (icinde % 2 === 0 || sonSaniyeler) {
      const tik = (adim / (sonSaniyeler ? 1 : 2)) % 2 === 0;
      gurultu(t, 0.05, sonSaniyeler ? 0.9 : 0.6, tik ? 3200 : 2200, "bandpass", 8);
      nota("sine", sonSaniyeler ? 1760 : tik ? 1320 : 990, t, 0.04, 0.12);
    }
  }

  /** Soru süresince müzik ve tik-tak çalar; süre bitince kendiliğinden durur. */
  function soruMuzigi(sureSn) {
    durdur();
    if (!baglam()) return;
    const bitis = ctx.currentTime + sureSn;
    muzik = { sonraki: ctx.currentTime + 0.05, adim: 0, bitis };
    const planla = () => {
      // 100 ms ileriyi planla; setInterval'ın kaymasından etkilenmez.
      while (muzik && muzik.sonraki < ctx.currentTime + 0.1 && muzik.sonraki < muzik.bitis) {
        adimCal(muzik.adim, muzik.sonraki, muzik.bitis - muzik.sonraki);
        muzik.sonraki += SEKIZLIK;
        muzik.adim++;
      }
      if (muzik && ctx.currentTime >= muzik.bitis) {
        durdur();
        sureDoldu();
      }
    };
    muzik.zamanlayici = setInterval(planla, 25);
    planla();
  }

  function durdur() {
    if (muzik) clearInterval(muzik.zamanlayici);
    muzik = null;
  }

  /** Süre bitti: alçalan iki nota. */
  function sureDoldu() {
    if (!baglam()) return;
    const t = ctx.currentTime;
    nota("sawtooth", hz(-5), t, 0.25, 0.15);
    nota("sawtooth", hz(-12), t + 0.22, 0.6, 0.15);
  }

  /** Sonuç açılınca kısa parlak akor. */
  function sonuc() {
    durdur();
    if (!baglam()) return;
    const t = ctx.currentTime;
    [3, 7, 10, 15].forEach((n, i) => nota("triangle", hz(n), t + i * 0.06, 0.7, 0.18));
  }

  // ───────── podyum ─────────

  /** Davul gürlemesi → zafer fanfarı → alkış. */
  function kutlama() {
    durdur();
    if (!baglam()) return;
    const t0 = ctx.currentTime + 0.05;
    const gurleme = 1.6;
    for (let t = 0; t < gurleme; t += 0.045) {
      gurultu(t0 + t, 0.08, 0.15 + (t / gurleme) * 0.6, 180, "lowpass", 1);
    }
    const f = t0 + gurleme;
    // Do majör fanfar: da-da-da-daaaa
    const melodi = [
      [0, 3, 0.18], [0.2, 3, 0.18], [0.4, 3, 0.18], [0.6, 7, 0.5],
      [1.15, 5, 0.18], [1.35, 7, 0.18], [1.55, 12, 1.4],
    ];
    melodi.forEach(([dt, n, s]) => {
      nota("sawtooth", hz(n), f + dt, s, 0.12);
      nota("square", hz(n + 12), f + dt, s, 0.04);
    });
    [-21, -9, -5, 3, 7].forEach((n) => nota("triangle", hz(n), f + 1.55, 2.2, 0.12)); // final akoru
    gurultu(f + 1.55, 1.5, 0.5, 6000, "highpass", 0.7); // zil
    // Alkış: rastgele el çırpmaları
    for (let i = 0; i < 160; i++) {
      gurultu(f + 1.8 + Math.random() * 3.5, 0.05, 0.25 * Math.random() + 0.1, 1200 + Math.random() * 1500, "bandpass", 2);
    }
  }

  function konfeti(sureMs = 6000) {
    if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const tuval = document.createElement("canvas");
    tuval.className = "konfeti";
    document.body.append(tuval);
    const c = tuval.getContext("2d");
    const olcekle = () => {
      tuval.width = innerWidth * devicePixelRatio;
      tuval.height = innerHeight * devicePixelRatio;
      c.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    };
    olcekle();
    addEventListener("resize", olcekle);
    const renkler = ["#e21b3c", "#1368ce", "#d89e00", "#26890c", "#facc15", "#ffffff", "#a855f7"];
    const parcaciklar = [];
    const firlat = (adet, x, yon) => {
      for (let i = 0; i < adet; i++) {
        const aci = -Math.PI / 2 + yon * (0.25 + Math.random() * 0.5);
        const hiz = 9 + Math.random() * 10;
        parcaciklar.push({
          x, y: innerHeight, vx: Math.cos(aci) * hiz, vy: Math.sin(aci) * hiz * 1.4,
          boy: 6 + Math.random() * 8, renk: renkler[i % renkler.length],
          aci: Math.random() * 6, donus: (Math.random() - 0.5) * 0.4, salinim: Math.random() * 6,
        });
      }
    };
    firlat(140, 0, 1);
    firlat(140, innerWidth, -1);
    setTimeout(() => {
      firlat(90, innerWidth * 0.25, 0.3);
      firlat(90, innerWidth * 0.75, -0.3);
    }, 900);
    const bas = performance.now();
    const kare = (simdi) => {
      const gecen = simdi - bas;
      c.clearRect(0, 0, innerWidth, innerHeight);
      c.globalAlpha = Math.max(0, Math.min(1, (sureMs - gecen) / 1000));
      parcaciklar.forEach((p) => {
        p.vy += 0.25;
        p.vx *= 0.99;
        p.vy *= 0.99;
        p.salinim += 0.1;
        p.x += p.vx + Math.sin(p.salinim);
        p.y += p.vy;
        p.aci += p.donus;
        c.save();
        c.translate(p.x, p.y);
        c.rotate(p.aci);
        c.fillStyle = p.renk;
        c.fillRect(-p.boy / 2, -p.boy / 4, p.boy, p.boy / 2 * Math.abs(Math.cos(p.salinim)) + 1);
        c.restore();
      });
      if (gecen < sureMs) requestAnimationFrame(kare);
      else {
        removeEventListener("resize", olcekle);
        tuval.remove();
      }
    };
    requestAnimationFrame(kare);
  }

  // ───────── aç / kapat ─────────

  function sesDegistir() {
    kapali = !kapali;
    Duello.sakla.koy(SAKLAMA, kapali);
    if (ana) ana.gain.setTargetAtTime(kapali ? 0 : 0.8, ctx.currentTime, 0.02);
    return kapali;
  }

  // İlk tuş/tıklamada ses bağlamını aç (tarayıcı kuralı).
  const ac = () => baglam();
  addEventListener("keydown", ac, { once: true });
  addEventListener("pointerdown", ac, { once: true });

  return { soruMuzigi, durdur, sonuc, kutlama, konfeti, sesDegistir, kapaliMi: () => kapali };
})();
