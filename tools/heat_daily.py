#!/usr/bin/env python3
"""Tägliche Wetterebenen für die Pilz-Heatmap (DWD HYRAS-DE-PRE/-TAS/-TASMIN, AMBAV-Bodenfeuchte).

Aufruf: heat_daily.py <ausgabeordner> [--date JJJJ-MM-TT] [--local <ordner mit .nc-Dateien>]
Ergebnis: daily.png (Ebenen als Graustufen-Mosaik), daily.json (Metadaten), log.txt
"""
import argparse, datetime as dt, json, os, re, sys, traceback, urllib.request
import numpy as np
import netCDF4 as nc
from pyproj import Transformer
from PIL import Image
import heat_grid as G

BASE = 'https://opendata.dwd.de/climate_environment/CDC/grids_germany/daily/'
# wirksamer Niederschlag: Gewicht je Tag vor dem Stichtag (k = 0 ist der Stichtag selbst)
WEIGHTS = [(0, 3, 0.0), (4, 5, 0.5), (6, 9, 1.0), (10, 14, 0.7), (15, 20, 0.3)]
LOG = []


def log(*a):
    s = ' '.join(str(x) for x in a); LOG.append(s); print(s, flush=True)


def weight(k):
    for a, b, w in WEIGHTS:
        if a <= k <= b: return w
    return 0.0


def http(url, dest=None):
    req = urllib.request.Request(url, headers={'User-Agent': 'pilzwissen-heatmap'})
    with urllib.request.urlopen(req, timeout=300) as r:
        if dest is None: return r.read().decode('utf-8', 'replace')
        with open(dest, 'wb') as f:
            while True:
                b = r.read(1 << 20)
                if not b: break
                f.write(b)
    return dest


def find_file(subdir, pattern, local, tmp):
    """Neueste zur Vorlage passende Datei aus dem DWD-Verzeichnis holen (oder lokal suchen)."""
    rx = re.compile(pattern)
    if local:
        c = sorted(f for f in os.listdir(local) if rx.fullmatch(f))
        return os.path.join(local, c[-1]) if c else None
    try:
        names = sorted(set(m for m in re.findall(r'href="([^"]+)"', http(BASE + subdir)) if rx.fullmatch(m)))
    except Exception as e:
        log('Verzeichnis nicht lesbar:', subdir, e); return None
    if not names: return None
    dest = os.path.join(tmp, names[-1])
    log('lade', subdir + names[-1]); http(BASE + subdir + names[-1], dest)
    return dest


def read_days(path, var, wanted):
    """{datum: 2D-Array float32 (NaN = fehlt)} für die gewünschten Tage."""
    out = {}
    d = nc.Dataset(path); v = d.variables[var]; t = d.variables['time']
    dates = [dt.date(x.year, x.month, x.day) for x in nc.num2date(t[:], t.units, getattr(t, 'calendar', 'standard'))]
    for i, day in enumerate(dates):
        if day in wanted:
            a = np.ma.filled(v[i].astype('float32'), np.nan)
            out[day] = a
    info = {'x': d.variables['x'][:].astype('float64'), 'y': d.variables['y'][:].astype('float64'), 'last': max(dates) if dates else None}
    d.close()
    return out, info


def read_min(path, var, since, until, last5):
    """Tiefster Wert je Rasterpunkt über [since, until] und über die Tage in last5 (ohne alles im Speicher zu halten)."""
    d = nc.Dataset(path); v = d.variables[var]; t = d.variables['time']
    dates = [dt.date(x.year, x.month, x.day) for x in nc.num2date(t[:], t.units, getattr(t, 'calendar', 'standard'))]
    seas = m5 = None; n = n5 = 0
    for i, day in enumerate(dates):
        if not (since <= day <= until): continue
        a = np.ma.filled(v[i].astype('float32'), np.nan)
        seas = a if seas is None else np.fmin(seas, a); n += 1
        if day in last5:
            m5 = a.copy() if m5 is None else np.fmin(m5, a); n5 += 1
    info = {'x': d.variables['x'][:].astype('float64'), 'y': d.variables['y'][:].astype('float64'),
            'last': max(dates) if dates else None}
    d.close()
    return seas, m5, n, n5, info


def index_map(info, crs):
    """Für jede Zelle des Kartenrasters den nächsten Rasterpunkt der Quelle (Zeile, Spalte, gültig)."""
    X, Y = G.cell_centres()
    sx, sy = Transformer.from_crs('EPSG:3857', crs, always_xy=True).transform(X, Y)
    x, y = info['x'], info['y']
    ix = np.rint((sx - x[0]) / (x[1] - x[0])).astype(np.int64)
    iy = np.rint((sy - y[0]) / (y[1] - y[0])).astype(np.int64)
    ok = (ix >= 0) & (ix < len(x)) & (iy >= 0) & (iy < len(y))
    return np.clip(iy, 0, len(y) - 1), np.clip(ix, 0, len(x) - 1), ok


def sample(a, im):
    iy, ix, ok = im
    out = a[iy, ix]; out[~ok] = np.nan
    return out


def enc(a, scale, offset=0.0, vmax=250):
    v = np.rint((a + offset) * scale)
    v = np.clip(v, 0, vmax)
    v[~np.isfinite(a)] = 255
    return v.astype(np.uint8)


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('out'); ap.add_argument('--date'); ap.add_argument('--local')
    A = ap.parse_args()
    os.makedirs(A.out, exist_ok=True); tmp = os.path.join(A.out, '_tmp'); os.makedirs(tmp, exist_ok=True)
    today = dt.date.fromisoformat(A.date) if A.date else dt.datetime.now(dt.timezone.utc).date()
    days = [today - dt.timedelta(days=k) for k in range(0, 21)]
    years = sorted({d.year for d in days})
    log('Stichtag', today, '| Raster', G.W, 'x', G.H)

    def collect(subdir_fn, pattern_fn, var):
        vals, info = {}, None
        for y in years:
            p = find_file(subdir_fn(y), pattern_fn(y), A.local, tmp)
            if not p: log('keine Datei für', var, y); continue
            v, i = read_days(p, var, set(days)); vals.update(v)
            if info is None or (i['last'] and (info['last'] is None or i['last'] > info['last'])): info = i
            if not A.local: os.remove(p)
        return vals, info

    meta = {'date': today.isoformat(), 'grid': G.grid_meta(), 'weights': WEIGHTS, 'layers': [], 'cols': 3,
            'generated': dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%dT%H:%MZ')}
    layers = []

    # --- Niederschlag ---
    pr, pinfo = collect(lambda y: 'hyras_de/precipitation/', lambda y: rf'pr_hyras_1_{y}_v[\d\-]+_de\.nc', 'pr')
    if not pr: raise RuntimeError('keine Niederschlagsdaten')
    pim = index_map(pinfo, 'EPSG:3035')
    peff = None; recent = None; used = []; missing = []
    for k, day in enumerate(days):
        w = weight(k)
        if day not in pr:
            if w > 0: missing.append(day.isoformat())
            continue
        a = pr[day]
        if w > 0:
            peff = a * w if peff is None else peff + a * w; used.append(day.isoformat())
        if 1 <= k <= 3: recent = a.copy() if recent is None else recent + a
    if peff is None: raise RuntimeError('kein Tag mit Gewicht > 0 vorhanden')
    if recent is None: recent = np.where(np.isfinite(peff), 0.0, np.nan).astype('float32')
    peff_g, recent_g = sample(peff, pim), sample(recent, pim)
    layers += [enc(peff_g, 2.0), enc(recent_g, 2.0)]
    meta['layers'] += [{'id': 'peff', 'scale': 2.0, 'offset': 0, 'unit': 'mm'}, {'id': 'recent', 'scale': 2.0, 'offset': 0, 'unit': 'mm'}]
    meta['pr_last'] = pinfo['last'].isoformat(); meta['pr_missing'] = missing
    log('Niederschlag bis', pinfo['last'], '| Tage mit Gewicht:', len(used), '| fehlend:', missing)
    log('  wirksamer Niederschlag mm: Mittel %.1f, Max %.1f' % (np.nanmean(peff_g), np.nanmax(peff_g)))

    # --- Temperatur ---
    try:
        ta, tinfo = collect(lambda y: 'hyras_de/air_temperature_mean/', lambda y: rf'tas_hyras_1_{y}_v[\d\-]+_de\.nc', 'tas')
        have = [d for d in days[1:] if d in ta]
        if not have: raise RuntimeError('keine Temperaturtage')
        t15 = np.nanmean(np.stack([ta[d] for d in have[:15]]), axis=0)
        tmin = np.nanmin(np.stack([ta[d] for d in have[:5]]), axis=0)
        tim = index_map(tinfo, 'EPSG:3035')
        t15_g, tmin_g = sample(t15, tim), sample(tmin, tim)
        meta['tas_last'] = tinfo['last'].isoformat(); meta['tas_days'] = len(have[:15])
        log('Temperatur bis', tinfo['last'], '| Mittel 15 Tage: %.1f °C' % np.nanmean(t15_g))
    except Exception as e:
        log('Temperatur fehlgeschlagen:', e); LOG.append(traceback.format_exc())
        t15_g = tmin_g = np.full((G.H, G.W), np.nan, 'float32'); meta['tas_last'] = None
    layers += [enc(t15_g, 4.0, 20.0), enc(tmin_g, 4.0, 20.0)]
    meta['layers'] += [{'id': 't15', 'scale': 4.0, 'offset': 20, 'unit': '°C'}, {'id': 'tmin5', 'scale': 4.0, 'offset': 20, 'unit': '°C'}]

    # --- Frost: Tagestiefstwerte (2 m) der letzten 5 Tage und seit Saisonbeginn ---
    # Saison = seit 1. August (ab August); in der ersten Jahreshälfte die letzten 30 Tage
    since = dt.date(today.year, 8, 1) if today.month >= 8 else today - dt.timedelta(days=30)
    try:
        last5 = set(days[1:6]); seas = m5 = None; n = n5 = 0; finfo = None
        for y in sorted({since.year, today.year}):
            p = find_file('hyras_de/air_temperature_min/', rf'tasmin_hyras_1_{y}_v[\d\-]+_de\.nc', A.local, tmp)
            if not p: log('keine Datei für tasmin', y); continue
            a, b, k, k5, i = read_min(p, 'tasmin', since, today, last5)
            if a is not None: seas = a if seas is None else np.fmin(seas, a)
            if b is not None: m5 = b if m5 is None else np.fmin(m5, b)
            n += k; n5 += k5
            if finfo is None or (i['last'] and (finfo['last'] is None or i['last'] > finfo['last'])): finfo = i
            if not A.local: os.remove(p)
        if seas is None: raise RuntimeError('keine Tiefsttemperaturen im Zeitraum')
        fim = index_map(finfo, 'EPSG:3035')
        fseas_g = sample(seas, fim)
        fmin5_g = sample(m5, fim) if m5 is not None else np.full((G.H, G.W), np.nan, 'float32')
        meta['frost_since'] = since.isoformat(); meta['frost_last'] = finfo['last'].isoformat()
        meta['frost_days'] = n; meta['frost_days5'] = n5
        ok = np.isfinite(fseas_g)
        log('Tiefstwerte', since, 'bis', finfo['last'], '|', n, 'Tage | Zellen mit Frost: %.0f %%, unter -5 °C: %.0f %%, unter -10 °C: %.0f %%'
            % (100 * np.mean(fseas_g[ok] < 0), 100 * np.mean(fseas_g[ok] < -5), 100 * np.mean(fseas_g[ok] < -10)))
    except Exception as e:
        log('Frost fehlgeschlagen:', e); LOG.append(traceback.format_exc())
        fseas_g = fmin5_g = None; meta['frost_since'] = None
    if fseas_g is not None:   # nur anhängen, wenn vorhanden – die App kommt auch ohne aus
        layers += [enc(fmin5_g, 4.0, 30.0), enc(fseas_g, 4.0, 30.0)]
        meta['layers'] += [{'id': 'fmin5', 'scale': 4.0, 'offset': 30, 'unit': '°C'}, {'id': 'fseas', 'scale': 4.0, 'offset': 30, 'unit': '°C'}]

    # --- Bodenfeuchte ---
    try:
        sm, sinfo = collect(lambda y: f'soil_moisture/grass/{y}/', lambda y: rf'grids_germany_daily_soil_moisture_grass_{y}_0-30_v[\d.]+\.nc', 'paws')
        have = [d for d in days if d in sm]
        if not have: raise RuntimeError('keine aktuellen Bodenfeuchtetage (letzter Stand: %s)' % (sinfo and sinfo['last']))
        sm_g = sample(sm[have[0]], index_map(sinfo, 'EPSG:31467'))
        meta['sm_date'] = have[0].isoformat()
        log('Bodenfeuchte vom', have[0], '| Mittel %.0f %% nFK' % np.nanmean(sm_g))
    except Exception as e:
        log('Bodenfeuchte fehlgeschlagen:', e); LOG.append(traceback.format_exc())
        sm_g = np.full((G.H, G.W), np.nan, 'float32'); meta['sm_date'] = None
    layers.append(enc(sm_g, 2.0)); meta['layers'].append({'id': 'sm', 'scale': 2.0, 'offset': 0, 'unit': '% nFK'})

    Image.fromarray(G.mosaic(layers, meta['cols']), 'L').save(os.path.join(A.out, 'daily.png'), optimize=True)
    json.dump(meta, open(os.path.join(A.out, 'daily.json'), 'w'), ensure_ascii=False)
    log('fertig:', os.path.getsize(os.path.join(A.out, 'daily.png')) // 1024, 'KB')


if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else '.'
    code = 0
    try:
        main()
    except Exception:
        LOG.append(traceback.format_exc()); print(LOG[-1]); code = 1
    os.makedirs(out, exist_ok=True)
    open(os.path.join(out, 'log.txt'), 'w', encoding='utf-8').write('\n'.join(LOG) + '\n')
    try:
        import shutil; shutil.rmtree(os.path.join(out, '_tmp'), ignore_errors=True)
    except Exception: pass
    sys.exit(code)
