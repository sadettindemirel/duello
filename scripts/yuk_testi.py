"""Yük denemesi: N sahte oyuncu aynı anda katılır, durum sorar ve cevap gönderir.

Kullanım:
    python scripts/yuk_testi.py --anahtar <OGRETMEN_ANAHTARI> [--oyuncu 50] [--sure 20] [--url <web app URL>]

Dikkat: Gerçek web uygulamasının aktif oturumunu "yuk-testi_..." adlı bir oturumla değiştirir;
ders sırasında çalıştırmayın. Puanlar/dönem tablosu etkilenmez (oturum bitirilmez). Deneme bittikten sonra
`katilimcilar`, `anahtar` ve `cevaplar` sekmelerindeki "yuk-testi_" satırlarını silebilirsiniz.

URL verilmezse site/config.js içindeki APPS_SCRIPT_URL kullanılır.
"""

from __future__ import annotations

import argparse
import json
import random
import re
import statistics
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path

KOK = Path(__file__).resolve().parent.parent
GECICI_HATALAR = {"mesgul", "sunucu", "ag"}
YENIDEN_DENEME = 3
ZAMAN_ASIMI_SN = 30


class IstekHatasi(Exception):
    def __init__(self, kod: str):
        super().__init__(kod)
        self.kod = kod


def config_url() -> str:
    metin = (KOK / "site" / "config.js").read_text(encoding="utf-8")
    eslesme = re.search(r'APPS_SCRIPT_URL:\s*"([^"]*)"', metin)
    return eslesme.group(1) if eslesme else ""


@dataclass
class Istemci:
    url: str
    istatistik: Counter = field(default_factory=Counter)
    sureler: list[float] = field(default_factory=list)
    kilit: threading.Lock = field(default_factory=threading.Lock)

    def _tek(self, yontem: str, veri: dict) -> dict:
        if yontem == "GET":
            istek = urllib.request.Request(f"{self.url}?{urllib.parse.urlencode(veri)}")
        else:
            istek = urllib.request.Request(
                self.url,
                data=json.dumps(veri).encode("utf-8"),
                headers={"Content-Type": "text/plain;charset=utf-8"},
                method="POST",
            )
        baslangic = time.perf_counter()
        try:
            with urllib.request.urlopen(istek, timeout=ZAMAN_ASIMI_SN) as yanit:
                govde = yanit.read()
        except (urllib.error.URLError, TimeoutError, ConnectionError) as hata:
            raise IstekHatasi("ag") from hata
        finally:
            with self.kilit:
                self.sureler.append(time.perf_counter() - baslangic)
        try:
            json_ = json.loads(govde)
        except json.JSONDecodeError:
            raise IstekHatasi("sunucu") from None
        if not json_.get("ok"):
            raise IstekHatasi(json_.get("hata") or "sunucu")
        return json_

    def istek(self, yontem: str, veri: dict, deneme: int = YENIDEN_DENEME) -> dict:
        """Telefonla aynı yeniden deneme kuralı: geçici hatada 300–1500 ms bekle, en fazla `deneme` kez."""
        for i in range(deneme + 1):
            try:
                sonuc = self._tek(yontem, veri)
                with self.kilit:
                    self.istatistik[f"{veri['action']}:ok"] += 1
                return sonuc
            except IstekHatasi as hata:
                with self.kilit:
                    self.istatistik[f"{veri['action']}:{hata.kod}"] += 1
                if i >= deneme or hata.kod not in GECICI_HATALAR:
                    raise
                time.sleep(random.uniform(0.3, 1.5))
        raise AssertionError("ulaşılamaz")


def yuzdelik(degerler: list[float], oran: float) -> float:
    if not degerler:
        return 0.0
    sirali = sorted(degerler)
    return sirali[min(len(sirali) - 1, int(len(sirali) * oran))]


def calistir(url: str, anahtar: str, oyuncu_sayisi: int, sure: int, aralik: float) -> int:
    istemci = Istemci(url)
    oturum = time.strftime("yuk-testi_%Y%m%d-%H%M%S")
    print(f"Oturum: {oturum}  ({oyuncu_sayisi} oyuncu, {sure} sn)")
    istemci.istek("POST", {"action": "oturumBaslat", "anahtar": anahtar, "oturum": oturum, "sorular": [{"dogru": 0, "sure": sure}]})

    oyuncular = [f"yuk-{i:03d}-{random.getrandbits(32):08x}" for i in range(oyuncu_sayisi)]
    katilanlar: list[str] = []

    def katil(oyuncu_id: str) -> None:
        try:
            istemci.istek("POST", {"action": "katil", "oturum": oturum, "oyuncu_id": oyuncu_id, "ad": "Test"})
            katilanlar.append(oyuncu_id)
        except IstekHatasi:
            pass

    t0 = time.perf_counter()
    with ThreadPoolExecutor(max_workers=oyuncu_sayisi) as havuz:
        list(havuz.map(katil, oyuncular))
    print(f"Katılım: {len(katilanlar)}/{oyuncu_sayisi} ({time.perf_counter() - t0:.1f} sn)")

    istemci.istek("POST", {"action": "soruBaslat", "anahtar": anahtar, "oturum": oturum, "soru_no": 1})
    soru_bitis = time.monotonic() + sure
    gonderilen = Counter()
    kabul_edilen: list[str] = []
    reddedilen = Counter()

    def oyna(oyuncu_id: str) -> None:
        cevap_zamani = time.monotonic() + random.uniform(1, sure * 0.6)
        sonraki_sorgu = time.monotonic() + random.uniform(0, aralik)
        cevapladi = False
        while time.monotonic() < soru_bitis:
            simdi = time.monotonic()
            if not cevapladi and simdi >= cevap_zamani:
                sik = random.randrange(4)
                try:
                    istemci.istek(
                        "POST", {"action": "cevap", "oturum": oturum, "oyuncu_id": oyuncu_id, "soru_no": 1, "sik": sik}
                    )
                    kabul_edilen.append(oyuncu_id)
                    gonderilen[sik] += 1
                except IstekHatasi as hata:
                    reddedilen[hata.kod] += 1
                cevapladi = True
            elif simdi >= sonraki_sorgu:
                try:
                    istemci.istek("GET", {"action": "durum", "oyuncu_id": oyuncu_id}, deneme=0)
                except IstekHatasi:
                    pass
                sonraki_sorgu = simdi + aralik
            else:
                time.sleep(0.05)

    with ThreadPoolExecutor(max_workers=len(katilanlar) or 1) as havuz:
        list(havuz.map(oyna, katilanlar))

    time.sleep(1.5)
    sonuc = istemci.istek("POST", {"action": "soruBitir", "anahtar": anahtar, "oturum": oturum})
    kaydedilen = sonuc["cevap_sayisi"]
    kayip = len(kabul_edilen) - kaydedilen
    beklenen_dagilim = [gonderilen[i] for i in range(4)]

    print()
    print("── Rapor ──────────────────────────────")
    print(f"Katılan oyuncu       : {len(katilanlar)}/{oyuncu_sayisi}")
    print(f"Kabul edilen cevap   : {len(kabul_edilen)}")
    print(f"Reddedilen cevap     : {sum(reddedilen.values())} {dict(reddedilen) or ''}")
    print(f"Sheet'e yazılan cevap: {kaydedilen}")
    print(f"Kayıp cevap          : {kayip}")
    print(f"Dağılım (gönderilen) : {beklenen_dagilim}")
    print(f"Dağılım (Sheet)      : {sonuc['dagilim']}")
    print(f"İstek süresi         : medyan {statistics.median(istemci.sureler):.2f} sn, "
          f"p95 {yuzdelik(istemci.sureler, 0.95):.2f} sn, en çok {max(istemci.sureler):.2f} sn")
    print("İstek sonuçları      :")
    for anahtar_, sayi in sorted(istemci.istatistik.items()):
        print(f"  {anahtar_:<28} {sayi}")

    basarili = (
        len(katilanlar) == oyuncu_sayisi
        and len(kabul_edilen) == len(katilanlar)
        and kayip == 0
        and beklenen_dagilim == sonuc["dagilim"]
    )
    print("Sonuç: " + ("BAŞARILI — kayıp cevap yok" if basarili else "SORUN VAR — yukarıdaki sayılara bakın"))
    return 0 if basarili else 1


def main(argv: list[str] | None = None) -> int:
    ayrac = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ayrac.add_argument("--url", default=None, help="Apps Script web app URL'i (varsayılan: site/config.js)")
    ayrac.add_argument("--anahtar", required=True, help="öğretmen anahtarı")
    ayrac.add_argument("--oyuncu", type=int, default=50, help="sahte oyuncu sayısı (varsayılan 50)")
    ayrac.add_argument("--sure", type=int, default=20, help="soru süresi, saniye (varsayılan 20)")
    ayrac.add_argument("--aralik", type=float, default=2.0, help="durum sorgu aralığı, saniye (varsayılan 2)")
    args = ayrac.parse_args(argv)

    url = args.url or config_url()
    if not url:
        ayrac.error("URL yok: --url verin ya da site/config.js içinde APPS_SCRIPT_URL ayarlayın")
    try:
        return calistir(url, args.anahtar, args.oyuncu, args.sure, args.aralik)
    except IstekHatasi as hata:
        print(f"Deneme durdu: {hata.kod}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
