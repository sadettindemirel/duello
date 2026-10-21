"""Yerel test sunucusu: site/ klasörünü aynı Wi-Fi'daki telefonlara sunar.

Kullanım:
    python scripts/sunucu.py [--port 8000]

Tahta:   http://localhost:8000/board.html
Telefon: http://<bilgisayarın-yerel-IP'si>:8000/play.html  (ekrana yazdırılır)
"""

from __future__ import annotations

import argparse
import functools
import socket
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import dogrula  # noqa: E402

SITE = dogrula.KOK / "site"


def yerel_ip() -> str:
    """Bu bilgisayarın yerel ağdaki IP adresi (paket göndermeden, yönlendirme tablosundan)."""
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
        try:
            s.connect(("10.255.255.255", 1))
            return s.getsockname()[0]
        except OSError:
            return "127.0.0.1"


class OnbelleksizIsleyici(SimpleHTTPRequestHandler):
    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def main(argv: list[str] | None = None) -> int:
    ayrac = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ayrac.add_argument("--port", type=int, default=8000)
    args = ayrac.parse_args(argv)

    hatalar = dogrula.dogrula_klasor()
    if hatalar:
        print("Soru setlerinde hata var (yine de sunuluyor):")
        for hata in hatalar:
            print(f"  - {hata}")
    else:
        dogrula.index_yaz()

    isleyici = functools.partial(OnbelleksizIsleyici, directory=str(SITE))
    with ThreadingHTTPServer(("0.0.0.0", args.port), isleyici) as sunucu:
        print(f"Tahta:   http://localhost:{args.port}/board.html")
        print(f"Telefon: http://{yerel_ip()}:{args.port}/play.html")
        print("Durdurmak için Ctrl+C")
        try:
            sunucu.serve_forever()
        except KeyboardInterrupt:
            print()
    return 0


if __name__ == "__main__":
    sys.exit(main())
