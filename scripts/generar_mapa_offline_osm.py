#!/usr/bin/env python3
"""Genera el conjunto público ODbL de calles/líneas por celdas z11, desde un extracto OSM PBF.
Uso: python scripts/generar_mapa_offline_osm.py entre_rios.osm.pbf app/src/main/assets/vendor/offline/er-osm-v1
Requiere: pip install osmium==4.3.2
"""
import argparse, json, math
from collections import defaultdict, Counter
from pathlib import Path
import osmium

Z = 11
N = 1 << Z
HIGHWAYS = {'motorway','motorway_link','trunk','trunk_link','primary','primary_link',
            'secondary','secondary_link','tertiary','tertiary_link','unclassified',
            'residential','living_street','service','track','road','pedestrian',
            'footway','path','cycleway','steps','bridleway'}
POWER = {'line','minor_line'}

def xy(lon, lat):
    lat = max(-85.05112878, min(85.05112878, lat))
    return ((lon + 180) / 360 * N, (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * N)

class Extract(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.cells = defaultdict(list)
        self.count = Counter()
        self.missing = 0
    def way(self, w):
        road = w.tags.get('highway')
        power = w.tags.get('power')
        if road not in HIGHWAYS and power not in POWER: return
        try:
            coords = [[round(n.lon, 6), round(n.lat, 6)] for n in w.nodes if n.location.valid()]
        except (osmium.InvalidLocationError, RuntimeError):
            self.missing += 1
            return
        if len(coords) < 2 or len(coords) != len(w.nodes):
            self.missing += 1
            return
        xys = [xy(*p) for p in coords]
        cells = set()
        for (x1,y1),(x2,y2) in zip(xys, xys[1:]):
            # Supraconjunto: incluir todas las celdas tocadas por el rectángulo del segmento.
            for x in range(math.floor(min(x1,x2)), math.floor(max(x1,x2))+1):
                for y in range(math.floor(min(y1,y2)), math.floor(max(y1,y2))+1):
                    if 0 <= x < N and 0 <= y < N: cells.add((x,y))
        if not cells: return
        kind = 'p' if power in POWER else 'r'
        tag = power if kind == 'p' else road
        name = str(w.tags.get('name') or w.tags.get('ref') or '')[:160]
        voltage = str(w.tags.get('voltage') or '')[:80] if kind == 'p' else ''
        xs = [p[0] for p in coords]; ys = [p[1] for p in coords]
        item = [kind, tag, name, voltage, [min(xs), min(ys), max(xs), max(ys)], coords, w.id]
        for cell in cells: self.cells[cell].append(item)
        self.count[(kind,tag)] += 1

if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('pbf'); ap.add_argument('out'); args = ap.parse_args()
    out = Path(args.out); out.mkdir(parents=True, exist_ok=True)
    h = Extract(); h.apply_file(args.pbf, locations=True, idx='flex_mem')
    for (x,y), rows in sorted(h.cells.items()):
        (out / f'{x}-{y}.json').write_text(json.dumps(rows, separators=(',',':'), ensure_ascii=False), encoding='utf-8')
    idx = ','.join('"%d-%d"' % k for k in sorted(h.cells))
    (out.parent / 'er-osm-index-v1.js').write_text('// OSM Entre Ríos; datos derivados ODbL 1.0. Ver docs/MAPA_OFFLINE.md.\nexport const osmCells = new Set(['+idx+']);\n', encoding='utf-8')
    print('cells', len(h.cells), 'ways', dict(h.count), 'ways_missing_nodes', h.missing)
    print('bytes', sum(p.stat().st_size for p in out.iterdir()))
