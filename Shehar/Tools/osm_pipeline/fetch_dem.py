"""Download elevation for a city bbox from the public AWS Terrain Tiles dataset (Terrarium PNG encoding)
and resample it to a regular grid in the game's local metric frame.

Usage: python3 fetch_dem.py pune [--zoom 14] [--cell 12.5]
Writes raw/<city>/dem.npz with: grid (float32 metres, rows = z from south to north), cell, x0, z0.

Terrain data: "Terrain Tiles" on AWS Open Data (Mapzen / Linux Foundation), sources include SRTM (NASA),
GMTED2010, ETOPO1 and others - see https://github.com/tilezen/joerd/blob/master/docs/attribution.md
"""
import argparse, io, json, math, os, urllib.request
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
URL = "https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png"


def mperdeg(lat):
    p = math.radians(lat)
    return 111132.92 - 559.82 * math.cos(2 * p) + 1.175 * math.cos(4 * p), 111412.84 * math.cos(p) - 93.5 * math.cos(3 * p)


def tile_xy(lat, lon, z):
    n = 2 ** z
    x = (lon + 180) / 360 * n
    y = (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n
    return x, y


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("city"); ap.add_argument("--zoom", type=int, default=14); ap.add_argument("--cell", type=float, default=12.5)
    a = ap.parse_args()
    cfg = json.load(open(os.path.join(HERE, "cities.json")))[a.city]
    S, W, N, E = cfg["bbox"]
    lat0, lon0 = (S + N) / 2, (W + E) / 2
    mlat, mlon = mperdeg(lat0)
    z = a.zoom
    margin = 0.004
    x0t, y1t = tile_xy(S - margin, W - margin, z)
    x1t, y0t = tile_xy(N + margin, E + margin, z)
    tx0, tx1, ty0, ty1 = int(x0t), int(x1t), int(y0t), int(y1t)
    tiles = {}
    for tx in range(tx0, tx1 + 1):
        for ty in range(ty0, ty1 + 1):
            req = urllib.request.Request(URL.format(z=z, x=tx, y=ty), headers={"User-Agent": "osm-city-game-prototype/0.1"})
            png = Image.open(io.BytesIO(urllib.request.urlopen(req, timeout=60).read())).convert("RGB")
            arr = np.asarray(png, dtype=np.float64)
            tiles[(tx, ty)] = arr[:, :, 0] * 256 + arr[:, :, 1] + arr[:, :, 2] / 256 - 32768
    print("downloaded %d terrain tiles at zoom %d" % (len(tiles), z))
    mosaic = np.zeros(((ty1 - ty0 + 1) * 256, (tx1 - tx0 + 1) * 256))
    for (tx, ty), h in tiles.items():
        mosaic[(ty - ty0) * 256:(ty - ty0 + 1) * 256, (tx - tx0) * 256:(tx - tx0 + 1) * 256] = h

    minx, maxx = (W - lon0) * mlon, (E - lon0) * mlon
    minz, maxz = (S - lat0) * mlat, (N - lat0) * mlat
    pad = 400.0  # metres of terrain outside the playable extract
    gx0, gz0 = minx - pad, minz - pad
    nx = int(math.ceil((maxx - minx + 2 * pad) / a.cell)) + 1
    nz = int(math.ceil((maxz - minz + 2 * pad) / a.cell)) + 1
    xs = gx0 + np.arange(nx) * a.cell
    zs = gz0 + np.arange(nz) * a.cell
    lon = lon0 + xs / mlon
    lat = lat0 + zs / mlat
    n = 2 ** z
    px = ((lon + 180) / 360 * n - tx0) * 256 - 0.5
    py = ((1 - np.arcsinh(np.tan(np.radians(lat))) / np.pi) / 2 * n - ty0) * 256 - 0.5
    PX, PY = np.meshgrid(px, py)
    ix = np.clip(np.floor(PX).astype(int), 0, mosaic.shape[1] - 2); iy = np.clip(np.floor(PY).astype(int), 0, mosaic.shape[0] - 2)
    fx = np.clip(PX - ix, 0, 1); fy = np.clip(PY - iy, 0, 1)
    h = (mosaic[iy, ix] * (1 - fx) * (1 - fy) + mosaic[iy, ix + 1] * fx * (1 - fy) +
         mosaic[iy + 1, ix] * (1 - fx) * fy + mosaic[iy + 1, ix + 1] * fx * fy)
    # light Gaussian blur: removes SRTM surface noise (rooftops / tree canopy) while keeping the hills
    k = np.exp(-0.5 * (np.arange(-4, 5) / 1.6) ** 2); k /= k.sum()
    for axis in (0, 1):
        h = np.apply_along_axis(lambda r: np.convolve(np.pad(r, 4, mode="edge"), k, mode="valid"), axis, h)
    out = os.path.join(HERE, "raw", a.city, "dem.npz")
    np.savez_compressed(out, grid=h.astype(np.float32), cell=a.cell, x0=gx0, z0=gz0)
    print("DEM grid %dx%d @ %.1f m -> %s ; elevation %.0f..%.0f m" % (nx, nz, a.cell, out, h.min(), h.max()))


if __name__ == "__main__":
    main()
