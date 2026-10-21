import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

import dogrula  # noqa: E402


def gecerli_set(set_id="deneme"):
    return {
        "id": set_id,
        "baslik": "Deneme",
        "varsayilan_sure": 20,
        "sorular": [
            {"metin": "Soru?", "siklar": ["a", "b", "c", "d"], "dogru": 0},
            {"metin": "Soru 2?", "gorsel": None, "siklar": ["a", "b", "c", "d"], "dogru": 3, "sure": 10, "kazanim": "9.1"},
        ],
    }


def yaz(klasor: Path, ad: str, veri) -> Path:
    yol = klasor / ad
    yol.write_text(veri if isinstance(veri, str) else json.dumps(veri), encoding="utf-8")
    return yol


def test_gecerli_set():
    assert dogrula.dogrula_set(gecerli_set(), "deneme.json") == []


def test_depodaki_soru_setleri_gecerli():
    assert dogrula.dogrula_klasor() == []


@pytest.mark.parametrize(
    "degistir, beklenen",
    [
        (lambda v: v["sorular"][0].update(siklar=["a", "b", "c"]), "tam 4 şık"),
        (lambda v: v["sorular"][0].update(siklar=["a", "b", "", "d"]), "boş olmayan metin"),
        (lambda v: v["sorular"][0].update(dogru=4), "'dogru'"),
        (lambda v: v["sorular"][0].update(dogru=True), "'dogru'"),
        (lambda v: v["sorular"][0].update(dogru="1"), "'dogru'"),
        (lambda v: v["sorular"][1].update(sure=0), "'sure'"),
        (lambda v: v.update(varsayilan_sure=None), "varsayilan_sure"),
        (lambda v: v.update(varsayilan_sure=-5), "varsayilan_sure"),
        (lambda v: v.update(sorular=[]), "en az bir soru"),
        (lambda v: v["sorular"][0].update(metin="  "), "'metin'"),
        (lambda v: v["sorular"][0].update(dogrru=1), "bilinmeyen alan 'dogrru'"),
        (lambda v: v.update(baslik=""), "'baslik'"),
        (lambda v: v.update(id="baska"), "dosya adıyla"),
        (lambda v: v.update(id="bosluk var"), "'id'"),
    ],
)
def test_hatali_setler(degistir, beklenen):
    veri = gecerli_set()
    degistir(veri)
    hatalar = dogrula.dogrula_set(veri, "deneme.json")
    assert any(beklenen in h for h in hatalar), hatalar


def test_varsayilan_sure_yoksa_her_soruda_sure_yeterli():
    veri = gecerli_set()
    del veri["varsayilan_sure"]
    for soru in veri["sorular"]:
        soru["sure"] = 15
    assert dogrula.dogrula_set(veri, "deneme.json") == []


def test_ust_duzey_liste_reddedilir():
    assert dogrula.dogrula_set([], "deneme.json")


def test_klasor_gecersiz_json(tmp_path):
    yaz(tmp_path, "bozuk.json", "{ bozuk")
    assert any("geçersiz JSON" in h for h in dogrula.dogrula_klasor(tmp_path))


def test_klasor_index_dosyasini_atlar(tmp_path):
    yaz(tmp_path, "deneme.json", gecerli_set())
    yaz(tmp_path, "index.json", [{"herhangi": "bir şey"}])
    assert dogrula.dogrula_klasor(tmp_path) == []


def test_index_yaz(tmp_path):
    yaz(tmp_path, "a-1.json", gecerli_set("a-1"))
    yaz(tmp_path, "b-2.json", gecerli_set("b-2"))
    dogrula.index_yaz(tmp_path)
    liste = json.loads((tmp_path / "index.json").read_text(encoding="utf-8"))
    assert [s["id"] for s in liste] == ["b-2", "a-1"]
    assert liste[0] == {"dosya": "b-2.json", "id": "b-2", "baslik": "Deneme", "soru_sayisi": 2}


def test_main_cikis_kodu(tmp_path, capsys):
    yaz(tmp_path, "deneme.json", gecerli_set())
    assert dogrula.main(["--klasor", str(tmp_path)]) == 0
    yaz(tmp_path, "deneme.json", {**gecerli_set(), "sorular": []})
    assert dogrula.main(["--klasor", str(tmp_path)]) == 1
    assert "hata bulundu" in capsys.readouterr().out
