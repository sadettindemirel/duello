"""Soru setlerini (site/sorular/*.json) doğrular.

Kullanım:
    python scripts/dogrula.py            # yalnızca doğrula
    python scripts/dogrula.py --index    # doğrula + sorular/index.json yaz (tahtadaki liste)

Hata varsa çıkış kodu 1 olur; CI bu sayede hatalı soru dosyasını canlıya çıkarmaz.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

KOK = Path(__file__).resolve().parent.parent
SORU_KLASORU = KOK / "site" / "sorular"
INDEX_ADI = "index.json"

SIK_SAYISI = 4
ID_DESENI = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")
SET_ALANLARI = {"id", "baslik", "varsayilan_sure", "sorular"}
SORU_ALANLARI = {"metin", "gorsel", "siklar", "dogru", "sure", "kazanim"}


def _pozitif_sayi(deger: object) -> bool:
    return isinstance(deger, (int, float)) and not isinstance(deger, bool) and deger > 0


def _dolu_metin(deger: object) -> bool:
    return isinstance(deger, str) and deger.strip() != ""


def dogrula_set(veri: object, dosya_adi: str) -> list[str]:
    """Tek bir soru setini kontrol eder; hata mesajlarının listesini döner (boşsa geçerli)."""
    if not isinstance(veri, dict):
        return [f"{dosya_adi}: en üst düzey bir nesne ({{...}}) olmalı"]

    hatalar: list[str] = []
    for alan in sorted(set(veri) - SET_ALANLARI):
        hatalar.append(f"{dosya_adi}: bilinmeyen alan '{alan}'")

    set_id = veri.get("id")
    if not _dolu_metin(set_id) or not ID_DESENI.match(set_id):
        hatalar.append(f"{dosya_adi}: 'id' harf, rakam, '-', '_' ya da '.' içeren boş olmayan bir metin olmalı")
    elif set_id != Path(dosya_adi).stem:
        hatalar.append(f"{dosya_adi}: 'id' ({set_id}) dosya adıyla aynı olmalı")

    if not _dolu_metin(veri.get("baslik")):
        hatalar.append(f"{dosya_adi}: 'baslik' boş olmayan bir metin olmalı")

    varsayilan = veri.get("varsayilan_sure")
    if varsayilan is not None and not _pozitif_sayi(varsayilan):
        hatalar.append(f"{dosya_adi}: 'varsayilan_sure' 0'dan büyük bir sayı olmalı")

    sorular = veri.get("sorular")
    if not isinstance(sorular, list) or not sorular:
        hatalar.append(f"{dosya_adi}: 'sorular' en az bir soru içeren bir liste olmalı")
        return hatalar

    for no, soru in enumerate(sorular, start=1):
        yer = f"{dosya_adi}: soru {no}"
        if not isinstance(soru, dict):
            hatalar.append(f"{yer}: nesne olmalı")
            continue
        for alan in sorted(set(soru) - SORU_ALANLARI):
            hatalar.append(f"{yer}: bilinmeyen alan '{alan}'")
        if not _dolu_metin(soru.get("metin")):
            hatalar.append(f"{yer}: 'metin' boş olmayan bir metin olmalı")

        siklar = soru.get("siklar")
        if not isinstance(siklar, list) or len(siklar) != SIK_SAYISI:
            hatalar.append(f"{yer}: 'siklar' tam {SIK_SAYISI} şık içeren bir liste olmalı")
        elif not all(_dolu_metin(s) for s in siklar):
            hatalar.append(f"{yer}: şıkların hepsi boş olmayan metin olmalı")

        dogru = soru.get("dogru")
        if not isinstance(dogru, int) or isinstance(dogru, bool) or not 0 <= dogru < SIK_SAYISI:
            hatalar.append(f"{yer}: 'dogru' 0 ile {SIK_SAYISI - 1} arasında bir tam sayı olmalı (A=0, B=1, C=2, D=3)")

        sure = soru.get("sure")
        if sure is not None and not _pozitif_sayi(sure):
            hatalar.append(f"{yer}: 'sure' 0'dan büyük bir sayı olmalı")
        elif sure is None and not _pozitif_sayi(varsayilan):
            hatalar.append(f"{yer}: 'sure' yok ve geçerli bir 'varsayilan_sure' de yok")

        for alan in ("gorsel", "kazanim"):
            if soru.get(alan) is not None and not isinstance(soru[alan], str):
                hatalar.append(f"{yer}: '{alan}' metin ya da null olmalı")
    return hatalar


def soru_dosyalari(klasor: Path) -> list[Path]:
    return sorted(p for p in klasor.glob("*.json") if p.name != INDEX_ADI)


def dogrula_klasor(klasor: Path = SORU_KLASORU) -> list[str]:
    """Klasördeki tüm soru setlerini doğrular; id'lerin benzersizliğini de kontrol eder."""
    hatalar: list[str] = []
    gorulen: dict[str, str] = {}
    for yol in soru_dosyalari(klasor):
        try:
            veri = json.loads(yol.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError) as hata:
            hatalar.append(f"{yol.name}: geçersiz JSON ({hata})")
            continue
        hatalar.extend(dogrula_set(veri, yol.name))
        set_id = veri.get("id") if isinstance(veri, dict) else None
        if isinstance(set_id, str):
            if set_id in gorulen:
                hatalar.append(f"{yol.name}: 'id' ({set_id}) {gorulen[set_id]} dosyasında da kullanılmış")
            gorulen[set_id] = yol.name
    return hatalar


def index_olustur(klasor: Path = SORU_KLASORU) -> list[dict]:
    """Tahtadaki soru seti listesi için özet (dosya, id, başlık, soru sayısı)."""
    liste = []
    for yol in soru_dosyalari(klasor):
        veri = json.loads(yol.read_text(encoding="utf-8"))
        liste.append(
            {
                "dosya": yol.name,
                "id": veri["id"],
                "baslik": veri["baslik"],
                "soru_sayisi": len(veri["sorular"]),
            }
        )
    return sorted(liste, key=lambda s: s["id"], reverse=True)


def index_yaz(klasor: Path = SORU_KLASORU) -> Path:
    hedef = klasor / INDEX_ADI
    hedef.write_text(json.dumps(index_olustur(klasor), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return hedef


def main(argv: list[str] | None = None) -> int:
    ayrac = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ayrac.add_argument("--klasor", type=Path, default=SORU_KLASORU, help="soru setlerinin bulunduğu klasör")
    ayrac.add_argument("--index", action="store_true", help=f"geçerliyse {INDEX_ADI} dosyasını yaz")
    args = ayrac.parse_args(argv)

    dosyalar = soru_dosyalari(args.klasor)
    if not dosyalar:
        print(f"Uyarı: {args.klasor} içinde soru seti yok.")
    hatalar = dogrula_klasor(args.klasor)
    if hatalar:
        print(f"{len(hatalar)} hata bulundu:")
        for hata in hatalar:
            print(f"  - {hata}")
        return 1

    print(f"{len(dosyalar)} soru seti geçerli.")
    if args.index:
        print(f"Yazıldı: {index_yaz(args.klasor)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
