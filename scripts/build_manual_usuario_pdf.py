# -*- coding: utf-8 -*-
"""Genera docs/MANUAL_USUARIO_GestorNova.pdf desde docs/MANUAL_USUARIO_GestorNova.md (fpdf 1.x, sin dependencias nativas)."""
from __future__ import annotations

import re
import sys
from pathlib import Path

try:
    from fpdf import FPDF
except ImportError:
    print("Instalá fpdf: pip install fpdf==1.7.2", file=sys.stderr)
    sys.exit(1)

ROOT = Path(__file__).resolve().parents[1]
MD_PATH = ROOT / "docs" / "MANUAL_USUARIO_GestorNova.md"
OUT_PATH = ROOT / "docs" / "MANUAL_USUARIO_GestorNova.pdf"


def strip_md_inline(s: str) -> str:
    s = re.sub(r"\*\*([^*]+)\*\*", r"\1", s)
    s = re.sub(r"\*([^*]+)\*", r"\1", s)
    s = re.sub(r"`([^`]+)`", r"\1", s)
    return s


def normalize_pdf_text(s: str) -> str:
    s = s.replace("\u2014", "-").replace("\u2013", "-")
    s = s.replace("\u201c", '"').replace("\u201d", '"')
    s = s.replace("\u2018", "'").replace("\u2019", "'")
    return s


class ManualPDF(FPDF):
    def footer(self) -> None:
        self.set_y(-15)
        self.set_font("Arial", "I", 8)
        self.cell(0, 10, f"Página {self.page_no()}", align="C")


def parse_md_lines(text: str) -> list[tuple[str, str]]:
    """Devuelve lista de (tipo, texto) con tipo en h1,h2,h3,p,bullet,num."""
    out: list[tuple[str, str]] = []
    for raw in text.splitlines():
        line = raw.rstrip()
        if not line.strip():
            out.append(("blank", ""))
            continue
        if line.strip() == "---":
            out.append(("sep", ""))
            continue
        if line.startswith("|"):
            continue
        s = line.strip()
        if re.match(r"^#{1,3}\s", s):
            level = len(s) - len(s.lstrip("#"))
            body = strip_md_inline(s[level:].strip())
            tag = ("h1", "h2", "h3")[min(level - 1, 2)]
            out.append((tag, body))
            continue
        if re.match(r"^\d+\.\s", s):
            out.append(("num", strip_md_inline(s)))
            continue
        if s.startswith("- "):
            out.append(("bullet", strip_md_inline(s[2:].strip())))
            continue
        out.append(("p", strip_md_inline(s)))
    return out


def build_pdf(elements: list[tuple[str, str]], dest: Path) -> None:
    pdf = ManualPDF()
    pdf.set_auto_page_break(auto=True, margin=18)
    pdf.add_page()
    pdf.set_font("Arial", "", 11)

    for kind, text in elements:
        text = normalize_pdf_text(text)
        if kind == "blank":
            pdf.ln(4)
            continue
        if kind == "sep":
            pdf.ln(2)
            continue
        if kind == "h1":
            pdf.ln(2)
            pdf.set_font("Arial", "B", 18)
            pdf.multi_cell(0, 10, text.encode("latin-1", "replace").decode("latin-1"))
            pdf.set_font("Arial", "", 11)
            continue
        if kind == "h2":
            pdf.ln(6)
            pdf.set_font("Arial", "B", 14)
            pdf.multi_cell(0, 8, text.encode("latin-1", "replace").decode("latin-1"))
            pdf.set_font("Arial", "", 11)
            continue
        if kind == "h3":
            pdf.ln(4)
            pdf.set_font("Arial", "B", 12)
            pdf.multi_cell(0, 7, text.encode("latin-1", "replace").decode("latin-1"))
            pdf.set_font("Arial", "", 11)
            continue
        if kind == "bullet":
            pdf.set_x(18)
            pdf.multi_cell(0, 6, ("- " + text).encode("latin-1", "replace").decode("latin-1"))
            continue
        if kind == "num":
            pdf.set_x(18)
            pdf.multi_cell(0, 6, text.encode("latin-1", "replace").decode("latin-1"))
            continue
        # p
        pdf.multi_cell(0, 6, text.encode("latin-1", "replace").decode("latin-1"))

    pdf.output(str(dest))


def main() -> None:
    if not MD_PATH.is_file():
        print(f"No existe {MD_PATH}", file=sys.stderr)
        sys.exit(1)
    text = MD_PATH.read_text(encoding="utf-8")
    elements = parse_md_lines(text)
    build_pdf(elements, OUT_PATH)
    print(f"OK {OUT_PATH}")


if __name__ == "__main__":
    main()
