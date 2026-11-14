"""Download raw OpenStreetMap data for a city bounding box from the OSM main API.

The main API limits /map requests to 50,000 nodes, so the bbox is split into small tiles.
Usage:  python3 fetch_osm.py pune  [--out raw/pune]
Data (c) OpenStreetMap contributors, ODbL 1.0 - https://www.openstreetmap.org/copyright
"""
import argparse, concurrent.futures as cf, json, os, time, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
API = "https://api.openstreetmap.org/api/0.6/map?bbox=%s,%s,%s,%s"


def tiles(bbox, step):
    s, w, n, e = bbox
    lat = s
    while lat < n - 1e-9:
        lon = w
        while lon < e - 1e-9:
            yield (round(lon, 5), round(lat, 5), round(min(lon + step, e), 5), round(min(lat + step, n), 5))
            lon += step
        lat += step


def fetch(tile, out):
    fn = os.path.join(out, "%s_%s.osm" % (tile[1], tile[0]))
    if os.path.exists(fn) and os.path.getsize(fn) > 1000:
        return fn, "cached"
    err = None
    for attempt in range(4):
        try:
            req = urllib.request.Request(API % tile, headers={"User-Agent": "osm-city-game-prototype/0.1"})
            data = urllib.request.urlopen(req, timeout=180).read()
            with open(fn, "wb") as f:
                f.write(data)
            return fn, len(data)
        except Exception as ex:  # network hiccup: back off and retry
            err = ex
            time.sleep(3 * (attempt + 1))
    return fn, "ERROR %s" % err


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("city")
    ap.add_argument("--out")
    ap.add_argument("--workers", type=int, default=3)
    a = ap.parse_args()
    cfg = json.load(open(os.path.join(HERE, "cities.json")))[a.city]
    out = a.out or os.path.join(HERE, "raw", a.city)
    os.makedirs(out, exist_ok=True)
    jobs = list(tiles(cfg["bbox"], cfg.get("tile_step", 0.01)))
    print("Fetching %d tiles for %s" % (len(jobs), cfg["name"]))
    bad = 0
    with cf.ThreadPoolExecutor(a.workers) as ex:
        for fn, r in ex.map(lambda t: fetch(t, out), jobs):
            print(os.path.basename(fn), r, flush=True)
            bad += str(r).startswith("ERROR")
    if bad:
        raise SystemExit("%d tiles failed - re-run to resume" % bad)


if __name__ == "__main__":
    main()
