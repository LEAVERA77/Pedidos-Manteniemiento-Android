# -*- coding: utf-8 -*-
"""Genera seed_codigos_area_argentina.sql desde el Excel de características telefónicas."""
import os
import sys

try:
    import openpyxl
except ImportError:
    print("pip install openpyxl", file=sys.stderr)
    raise

DEFAULT_SRC = os.path.join(
    os.environ.get("CARACTERISTICAS_TEL_XLSX", ""),
    "",
).rstrip(os.sep) or r"g:\Mi unidad\Programas\Características telefónicas argentina\caracteristicas telefonicas argentina.xlsx"
SRC = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_SRC
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(REPO, "api", "db", "migrations", "seed_codigos_area_argentina.sql")


def esc_sql(s):
    return "'" + str(s).replace("'", "''") + "'"


def main():
    if not os.path.isfile(SRC):
        print(f"No existe el Excel: {SRC}", file=sys.stderr)
        sys.exit(1)
    wb = openpyxl.load_workbook(SRC, read_only=True, data_only=True)
    ws = wb.active
    vals = []
    for row in ws.iter_rows(min_row=2, values_only=True):
        if not row or row[0] is None:
            continue
        cod = row[0]
        if isinstance(cod, float) and cod == int(cod):
            cod = str(int(cod))
        else:
            cod = str(cod).strip()
        loc = str(row[1] or "").strip()
        prov = str(row[2] or "").strip()
        if not loc:
            continue
        vals.append(f"({esc_sql(cod)},{esc_sql(loc)},{esc_sql(prov)})")
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(
            "-- Datos codigos_area_argentina (Argentina). Ejecutar tras add_codigos_area_argentina.sql\n"
        )
        f.write("BEGIN;\n")
        f.write("DELETE FROM codigos_area_argentina;\n")
        f.write(
            "INSERT INTO codigos_area_argentina (codigo_area, localidad, provincia) VALUES\n"
        )
        f.write(",\n".join(vals))
        f.write(";\nCOMMIT;\n")
    print("OK", OUT, "filas", len(vals))


if __name__ == "__main__":
    main()
