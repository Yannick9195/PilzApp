"""Gemeinsames Kartenraster (Web-Mercator, ca. 1 km) für die Pilz-Heatmap."""
import math
import numpy as np

R = 6378137.0
LON0, LON1, LAT0, LAT1 = 5.8, 15.1, 47.2, 55.1
CELL = 1600.0  # Mercator-Meter; entspricht in Deutschland etwa 0,9–1,1 km am Boden


def mx(lon): return R * math.radians(lon)
def my(lat): return R * math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))


X0, Y1 = mx(LON0), my(LAT1)
W = int(math.ceil((mx(LON1) - X0) / CELL))
H = int(math.ceil((Y1 - my(LAT0)) / CELL))


def grid_meta():
    return {"W": W, "H": H, "x0": X0, "y1": Y1, "cell": CELL, "crs": "EPSG:3857"}


def cell_centres():
    """Mercator-Koordinaten der Zellmittelpunkte, Form (H, W); Zeile 0 = Norden."""
    xs = X0 + (np.arange(W) + 0.5) * CELL
    ys = Y1 - (np.arange(H) + 0.5) * CELL
    return np.meshgrid(xs, ys)


def mosaic(layers, cols):
    """Mehrere uint8-Ebenen (H, W) zu einem Graustufenbild nebeneinander/untereinander legen."""
    rows = int(math.ceil(len(layers) / cols))
    out = np.full((rows * H, cols * W), 255, dtype=np.uint8)
    for i, a in enumerate(layers):
        r, c = divmod(i, cols)
        out[r * H:(r + 1) * H, c * W:(c + 1) * W] = a
    return out
