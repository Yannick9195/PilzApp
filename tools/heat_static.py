#!/usr/bin/env python3
"""Einmalige Standortebenen für die Pilz-Heatmap: Baumartenanteile (DLR Tree Species Germany 2022, 10 m)
und Boden-pH (ISRIC SoilGrids 2.0, 250 m) je Zelle des Kartenrasters.

Aufruf: heat_static.py <ausgabeordner> --tree <GeoTIFF> [--no-ph]
Ergebnis: static.png (Graustufen-Mosaik), static.json, log.txt
"""
import argparse, json, os, sys, time, traceback
import numpy as np
import rasterio
from rasterio.windows import Window
from pyproj import Transformer
from PIL import Image
import heat_grid as G

CLASSES = [(0, 'kiefer'), (1, 'fichte'), (2, 'douglasie'), (3, 'laerche'), (4, 'tanne'), (5, 'buche'),
           (6, 'eiche'), (7, 'birke'), (8, 'erle'), (9, 'sonst'), (666, 'verlust')]
PH_URL = '/vsicurl?max_retry=3&retry_delay=1&list_dir=no&url=https://files.isric.org/soilgrids/latest/data/phh2o/phh2o_{d}cm_mean.vrt'
LOG = []


def log(*a):
    s = ' '.join(str(x) for x in a); LOG.append(s); print(s, flush=True)


def trees(path, strip_blocks=100):
    ds = rasterio.open(path)
    log('Baumarten:', ds.width, 'x', ds.height, ds.dtypes[0], 'CRS', ds.crs, 'nodata', ds.nodata, 'Pixel', ds.res, 'Blöcke', ds.block_shapes[0])
    T = ds.transform
    if abs(T.b) > 1e-9 or abs(T.d) > 1e-9: raise RuntimeError('gedrehtes Raster wird nicht unterstützt')
    F = max(1, int(round(100.0 / abs(T.a))))          # Pixel je 100-m-Block
    ncb, nrb = ds.width // F, ds.height // F
    tr = Transformer.from_crs(ds.crs, 'EPSG:3857', always_xy=True)
    n = G.W * G.H
    cnt = np.zeros((len(CLASSES), n), dtype=np.float64); tot = np.zeros(n, dtype=np.float64)
    seen = {}
    bx = T.c + (np.arange(ncb) + 0.5) * F * T.a
    t0 = time.time()
    for rb0 in range(0, nrb, strip_blocks):
        nb = min(strip_blocks, nrb - rb0)
        a = ds.read(1, window=Window(0, rb0 * F, ncb * F, nb * F))
        by = T.f + (rb0 + np.arange(nb) + 0.5) * F * T.e
        X, Y = np.meshgrid(bx, by)
        mx, my = tr.transform(X, Y)
        cx = np.floor((mx - G.X0) / G.CELL).astype(np.int64); cy = np.floor((G.Y1 - my) / G.CELL).astype(np.int64)
        ok = (cx >= 0) & (cx < G.W) & (cy >= 0) & (cy < G.H)
        idx = (cy * G.W + cx)[ok]
        tot += np.bincount(idx, minlength=n) * (F * F)
        if rb0 == 0 or rb0 % (strip_blocks * 10) == 0:
            u, c = np.unique(a[::7, ::7], return_counts=True)
            for k, v in zip(u.tolist(), c.tolist()): seen[k] = seen.get(k, 0) + v
        for i, (code, _) in enumerate(CLASSES):
            m = (a == code)
            if not m.any(): continue
            b = m.reshape(nb, F, ncb, F).sum(axis=(1, 3))
            cnt[i] += np.bincount(idx, weights=b[ok].astype(np.float64), minlength=n)
        if rb0 % (strip_blocks * 10) == 0:
            log('  Zeile %d/%d  %.0f s' % (rb0 * F, ds.height, time.time() - t0))
    log('  Werte in Stichprobe:', dict(sorted(seen.items(), key=lambda kv: -kv[1])[:16]))
    frac = np.where(tot > 0, cnt / np.maximum(tot, 1), np.nan)
    layers = []
    for i, (code, name) in enumerate(CLASSES):
        f = frac[i].reshape(G.H, G.W)
        v = np.clip(np.rint(f * 250), 0, 250); v[~np.isfinite(f)] = 255
        layers.append(v.astype(np.uint8))
        log('  %-10s Anteil an der Rasterfläche: %.2f %%' % (name, 100 * np.nansum(cnt[i]) / max(tot.sum(), 1)))
    return layers


def ph():
    from rasterio.warp import reproject, Resampling
    from rasterio.transform import from_origin
    dst_t = from_origin(G.X0, G.Y1, G.CELL, G.CELL)
    acc = []
    for d in ('0-5', '5-15'):
        with rasterio.Env(GDAL_HTTP_MAX_RETRY='5', GDAL_HTTP_RETRY_DELAY='2', GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR', VSI_CACHE='TRUE'):
            with rasterio.open(PH_URL.format(d=d)) as src:
                log('pH', d, 'cm:', src.width, 'x', src.height, src.dtypes[0], 'nodata', src.nodata, 'CRS', str(src.crs)[:60])
                dst = np.full((G.H, G.W), np.nan, dtype=np.float32)
                reproject(rasterio.band(src, 1), dst, dst_transform=dst_t, dst_crs='EPSG:3857',
                          src_nodata=src.nodata if src.nodata is not None else -32768, dst_nodata=np.nan,
                          resampling=Resampling.average, num_threads=2)
                acc.append(dst / 10.0)
    p = np.nanmean(np.stack(acc), axis=0)
    log('  pH: Mittel %.2f, Spanne %.1f–%.1f, gültig %.0f %%' % (np.nanmean(p), np.nanmin(p), np.nanmax(p), 100 * np.isfinite(p).mean()))
    v = np.clip(np.rint((p - 3.0) * 40), 0, 250); v[~np.isfinite(p)] = 255
    return v.astype(np.uint8)


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('out'); ap.add_argument('--tree', required=True)
    ap.add_argument('--no-ph', action='store_true'); ap.add_argument('--strip', type=int, default=100)
    A = ap.parse_args(); os.makedirs(A.out, exist_ok=True)
    layers = trees(A.tree, A.strip)
    meta = {'grid': G.grid_meta(), 'cols': 4, 'layers': [{'id': name, 'scale': 250, 'unit': 'Anteil'} for _, name in CLASSES],
            'sources': ['DLR Tree Species Germany 2022 (CC BY 4.0)', 'ISRIC SoilGrids 2.0 (CC BY 4.0)']}
    p = None
    if not A.no_ph:
        try: p = ph()
        except Exception as e:
            log('pH fehlgeschlagen:', e); LOG.append(traceback.format_exc())
    meta['ph'] = p is not None
    layers.append(p if p is not None else np.full((G.H, G.W), 255, np.uint8))
    meta['layers'].append({'id': 'ph', 'scale': 40, 'offset': -3, 'unit': 'pH'})
    Image.fromarray(G.mosaic(layers, meta['cols']), 'L').save(os.path.join(A.out, 'static.png'), optimize=True)
    json.dump(meta, open(os.path.join(A.out, 'static.json'), 'w'), ensure_ascii=False)
    log('fertig:', os.path.getsize(os.path.join(A.out, 'static.png')) // 1024, 'KB')


if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else '.'
    code = 0
    try:
        main()
    except Exception:
        LOG.append(traceback.format_exc()); print(LOG[-1]); code = 1
    os.makedirs(out, exist_ok=True)
    open(os.path.join(out, 'log.txt'), 'w', encoding='utf-8').write('\n'.join(LOG) + '\n')
    sys.exit(code)
