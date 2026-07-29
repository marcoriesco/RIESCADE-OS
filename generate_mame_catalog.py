#!/usr/bin/env python3
"""Gera um catálogo JSON compacto a partir do XML produzido pelo MAME."""

from __future__ import annotations

import argparse
import json
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path


EXCLUDED_SOURCE_PREFIXES = ("pc/",)
EXCLUDED_TITLE_PATTERNS = (
    re.compile(r"\bmotherboards?\b", re.IGNORECASE),
)


def clean_text(value: str | None) -> str:
    return " ".join((value or "").split())


def infer_version(xml_path: Path) -> str:
    match = re.search(r"(\d{4})", xml_path.stem)
    if not match:
        return "unknown"
    digits = match.group(1)
    return f"v0.{digits[-3:]}"


def generate_catalog(xml_path: Path, version: str, included_shortnames: set[str]) -> dict:
    games: dict[str, dict[str, object]] = {}
    counts = {
        "machines": 0,
        "games": 0,
        "bios_ignored": 0,
        "devices_ignored": 0,
        "not_runnable_ignored": 0,
        "non_arcade_source_ignored": 0,
        "non_game_title_ignored": 0,
        "non_coin_operated_ignored": 0,
    }
    mame_build = ""

    for event, element in ET.iterparse(xml_path, events=("start", "end")):
        if event == "start" and element.tag == "mame" and not mame_build:
            mame_build = clean_text(element.attrib.get("build"))
            continue
        if event != "end" or element.tag != "machine":
            continue

        counts["machines"] += 1
        attributes = element.attrib

        if attributes.get("isbios", "no") == "yes":
            counts["bios_ignored"] += 1
            element.clear()
            continue
        if attributes.get("isdevice", "no") == "yes":
            counts["devices_ignored"] += 1
            element.clear()
            continue
        if attributes.get("runnable", "yes") == "no":
            counts["not_runnable_ignored"] += 1
            element.clear()
            continue

        shortname = clean_text(attributes.get("name"))
        if not shortname:
            element.clear()
            continue

        sourcefile = clean_text(attributes.get("sourcefile")).replace("\\", "/").lower()
        if sourcefile.startswith(EXCLUDED_SOURCE_PREFIXES):
            counts["non_arcade_source_ignored"] += 1
            element.clear()
            continue

        title = clean_text(element.findtext("description")) or shortname
        if any(pattern.search(title) for pattern in EXCLUDED_TITLE_PATTERNS):
            counts["non_game_title_ignored"] += 1
            element.clear()
            continue

        input_element = element.find("input")
        coins_raw = input_element.attrib.get("coins", "0") if input_element is not None else "0"
        try:
            coins = int(coins_raw)
        except ValueError:
            coins = 0
        if coins <= 0 and shortname not in included_shortnames:
            counts["non_coin_operated_ignored"] += 1
            element.clear()
            continue

        game: dict[str, object] = {
            "title": title,
        }

        year = clean_text(element.findtext("year"))
        manufacturer = clean_text(element.findtext("manufacturer"))
        cloneof = clean_text(attributes.get("cloneof"))
        romof = clean_text(attributes.get("romof"))

        if year:
            game["year"] = year
        if manufacturer:
            game["manufacturer"] = manufacturer
        if cloneof:
            game["cloneof"] = cloneof
        if romof and romof != cloneof:
            game["romof"] = romof
        if attributes.get("ismechanical", "no") == "yes":
            game["mechanical"] = True

        games[shortname] = game
        counts["games"] += 1
        element.clear()

        if counts["machines"] % 10_000 == 0:
            print(
                f"Processadas {counts['machines']:,} máquinas; "
                f"{counts['games']:,} jogos mantidos...",
                file=sys.stderr,
            )

    return {
        "schema_version": 1,
        "romset_version": version,
        "mame_build": mame_build,
        "filters": {
            "isbios": "no",
            "isdevice": "no",
            "runnable": "yes",
            "excluded_source_prefixes": list(EXCLUDED_SOURCE_PREFIXES),
            "excluded_title_patterns": [pattern.pattern for pattern in EXCLUDED_TITLE_PATTERNS],
            "minimum_coin_slots": 1,
            "included_shortnames": sorted(included_shortnames),
        },
        "counts": counts,
        "games": games,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Converte o XML completo do MAME em um JSON compacto somente com "
            "máquinas executáveis."
        )
    )
    parser.add_argument("xml", type=Path, help="Arquivo XML gerado por mame -listxml.")
    parser.add_argument(
        "output",
        nargs="?",
        type=Path,
        help="Arquivo JSON de saída. Por padrão, usa o nome do XML.",
    )
    parser.add_argument(
        "--version",
        help="Versão do romset, por exemplo v0.288. Por padrão, tenta inferir do nome.",
    )
    parser.add_argument(
        "--pretty",
        action="store_true",
        help="Formata o JSON com indentação, aumentando o tamanho do arquivo.",
    )
    parser.add_argument(
        "--include",
        action="append",
        default=[],
        metavar="SHORTNAME",
        help="Mantém excepcionalmente um shortname sem entrada de moedas. Pode ser repetido.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    xml_path = args.xml.expanduser().resolve()
    if not xml_path.is_file():
        print(f"Erro: XML não encontrado: {xml_path}", file=sys.stderr)
        return 2

    output_path = (
        args.output.expanduser().absolute()
        if args.output
        else xml_path.with_name("mame.json")
    )
    if output_path == xml_path:
        print("Erro: o arquivo de saída não pode ser o próprio XML.", file=sys.stderr)
        return 2

    version = args.version or infer_version(xml_path)
    included_shortnames = {
        clean_text(shortname).lower()
        for shortname in args.include
        if clean_text(shortname)
    }
    catalog = generate_catalog(xml_path, version, included_shortnames)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with output_path.open("w", encoding="utf-8", newline="\n") as output:
        json.dump(
            catalog,
            output,
            ensure_ascii=False,
            indent=2 if args.pretty else None,
            separators=None if args.pretty else (",", ":"),
        )
        output.write("\n")

    size_mb = output_path.stat().st_size / (1024 * 1024)
    counts = catalog["counts"]
    print(f"Catálogo criado: {output_path}")
    print(f"Build do MAME: {catalog['mame_build'] or 'não informado'}")
    print(f"Jogos mantidos: {counts['games']:,}")
    print(f"BIOS ignoradas: {counts['bios_ignored']:,}")
    print(f"Dispositivos ignorados: {counts['devices_ignored']:,}")
    print(f"Não executáveis ignorados: {counts['not_runnable_ignored']:,}")
    print(f"Drivers não arcade ignorados: {counts['non_arcade_source_ignored']:,}")
    print(f"Títulos não-jogo ignorados: {counts['non_game_title_ignored']:,}")
    print(f"Máquinas sem moedas ignoradas: {counts['non_coin_operated_ignored']:,}")
    print(f"Tamanho: {size_mb:.2f} MB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
