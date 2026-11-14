"""Convert raw OpenStreetMap tiles for a city into chunked game data for the Unity (and later Unreal) client.

Usage:  python3 build_city.py pune [--raw raw/pune] [--out ../../UnityProject/Assets/StreamingAssets/Cities/pune]

Output (all JSON, readable by Unity's JsonUtility - objects + flat arrays only):
  index.json   : bounds, projection, drivable road graph, road list, POIs, landmarks, signals, chunk list
  global.json  : large polygons (river, big parks, campuses) + waterway lines, always loaded
  chunks/c_X_Z.json : buildings, small areas, road pieces, rail lines, trees inside one chunk

Everything geometric comes from OSM. Values that OSM does not contain (most building heights,
road widths when no lanes tag exists) are filled with documented heuristics, marked in the
output by the `heightSource` statistics printed at the end.

Map data (c) OpenStreetMap contributors, available under the Open Database License (ODbL 1.0).
"""
import argparse, glob, json, math, os, sys, hashlib
import xml.etree.ElementTree as ET
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))

# ----------------------------------------------------------------------------------------------
# Road classification.  width = default carriageway width in metres (ASSUMPTION when no lanes tag)
# speed = default speed limit km/h used by GPS cost + AI (ASSUMPTION: typical Indian urban limits)
# ----------------------------------------------------------------------------------------------
ROAD_TYPES = {
    #  type            width rank speed drivable traffic
    "motorway":       (16.0, 9, 80, True, True),
    "trunk":          (14.0, 8, 50, True, True),
    "primary":        (12.0, 7, 50, True, True),
    "secondary":      (10.0, 6, 40, True, True),
    "tertiary":       (8.0, 5, 40, True, True),
    "motorway_link":  (7.0, 4, 40, True, False),
    "trunk_link":     (7.0, 4, 40, True, False),
    "primary_link":   (7.0, 4, 40, True, False),
    "secondary_link": (7.0, 4, 30, True, False),
    "tertiary_link":  (6.0, 4, 30, True, False),
    "unclassified":   (6.0, 3, 30, True, True),
    "residential":    (6.0, 3, 30, True, True),
    "living_street":  (5.0, 2, 20, True, False),
    "service":        (4.0, 1, 20, True, False),
    "busway":         (7.0, 3, 40, False, False),   # BRTS corridors: rendered, not in car graph
    "pedestrian":     (6.0, 1, 0, False, False),
    "track":          (3.5, 0, 15, False, False),
    "footway":        (2.0, 0, 0, False, False),
    "path":           (1.5, 0, 0, False, False),
    "cycleway":       (2.0, 0, 0, False, False),
    "steps":          (2.0, 0, 0, False, False),
}
RENDER_ONLY_FOOT = {"footway", "path", "cycleway", "steps"}

AREA_RULES = [  # (tag, value or None for any, kind)
    ("natural", "water", "water"), ("waterway", "riverbank", "water"), ("landuse", "reservoir", "water"),
    ("landuse", "basin", "water"), ("leisure", "swimming_pool", "water"),
    ("leisure", "park", "park"), ("leisure", "garden", "park"), ("landuse", "village_green", "park"),
    ("landuse", "recreation_ground", "park"), ("leisure", "playground", "park"),
    ("leisure", "pitch", "pitch"), ("leisure", "stadium", "pitch"), ("leisure", "sports_centre", "pitch"),
    ("leisure", "golf_course", "grass"), ("landuse", "grass", "grass"), ("natural", "grassland", "grass"),
    ("landuse", "meadow", "grass"), ("natural", "scrub", "forest"), ("natural", "wood", "forest"),
    ("landuse", "forest", "forest"), ("landuse", "cemetery", "cemetery"), ("amenity", "grave_yard", "cemetery"),
    ("amenity", "parking", "parking"), ("amenity", "university", "campus"), ("amenity", "college", "campus"),
    ("amenity", "school", "campus"), ("amenity", "hospital", "campus"), ("landuse", "education", "campus"),
    ("landuse", "military", "military"), ("landuse", "railway", "railway"), ("landuse", "industrial", "industrial"),
    ("landuse", "commercial", "commercial"), ("landuse", "retail", "commercial"), ("landuse", "residential", "residential"),
    ("landuse", "construction", "construction"), ("natural", "sand", "sand"), ("natural", "bare_rock", "sand"),
]

POI_RULES = [
    ("amenity", {"fuel": "fuel", "restaurant": "food", "fast_food": "food", "cafe": "food", "hospital": "hospital",
                 "clinic": "hospital", "college": "college", "university": "college", "school": "school",
                 "police": "police", "place_of_worship": "worship", "bus_station": "bus_station",
                 "marketplace": "market", "cinema": "cinema", "theatre": "cinema", "bank": "bank",
                 "post_office": "post"}),
    ("tourism", {"attraction": "attraction", "museum": "attraction", "hotel": "hotel", "viewpoint": "attraction"}),
    ("historic", None),
    ("railway", {"station": "rail_station", "halt": "rail_station"}),
    ("shop", {"mall": "mall", "supermarket": "shop", "department_store": "mall"}),
    ("leisure", {"park": "park", "stadium": "attraction"}),
    ("highway", {"bus_stop": "bus_stop"}),
]

# Landmarks used for missions and map labels.  Each must be found in the OSM data by exact name;
# anything not found is reported and NOT placed (no invented locations).
LANDMARKS = {
    "pune": [
        ("Shaniwar Wada", ["Shaniwar Wada", "Shaniwarwada"]),
        ("Dagdusheth Halwai Ganpati", ["Shreemant Dagdusheth Halwai Ganpati Mandir", "Dagdusheth Halwai Ganpati Mandir"]),
        ("Pune Railway Station", ["Pune Railway Station", "Pune Junction"]),
        ("Savitribai Phule Pune University", ["Savitribai Phule Pune University", "Pune University"]),
        ("Fergusson College", ["Fergusson College"]),
        ("Swargate Bus Stand", ["Swargate MSRTC Bus Stand", "Swargate Bus Stand", "Swargate PMPML Bus Stand", "Swargate"]),
        ("Lal Mahal", ["Lal Mahal"]),
        ("Mahatma Phule Mandai", ["Mahatma Phule Mandai"]),
        ("Chhatrapati Sambhaji Udyan", ["Chhatrapati Sambhaji Udyan", "Sambhaji Udyan"]),
        ("Deccan Gymkhana", ["Deccan Gymkhana"]),
        ("Shivajinagar Railway Station", ["Shivajinagar Railway Station", "Shivajinagar"]),
        ("Pataleshwar Cave Temple", ["Pataleshwar Cave Temple", "Pataleshwar"]),
        ("Bund Garden", ["Bund Garden"]),
        ("College of Engineering Pune", ["College of Engineering, Pune", "College of Engineering Pune", "COEP"]),
        ("Garware College", ["Garware College"]),
        ("Vishrambag Wada", ["Vishrambag Wada", "Vishrambaug Wada"]),
        ("Nana Wada", ["Nana Wada"]),
        ("Bhandarkar Oriental Research Institute", ["Bhandarkar Oriental Research Institute"]),
        ("Trishunda Ganpati Mandir", ["Shree Trishunda Ganpati Mandir"]),
        ("Kasba Ganpati", ["Kasba Ganpati", "Shree Kasba Ganpati", "Kasba Ganapati"]),
        ("Balgandharva Rangmandir", ["Balgandharva Rangmandir", "Bal Gandharva Rang Mandir", "Balgandharva Rang Mandir"]),
        ("Sarasbaug", ["Sarasbaug", "Saras Baug", "Peshwe Udyan"]),
    ]
}

LANDMARK_KIND_PRIORITY = {"attraction": 0, "worship": 0, "historic": 0, "college": 1, "campus": 1, "park": 1,
                          "bus_station": 1, "market": 1, "building": 2, "rail_station": 3, "place": 4, "bus_stop": 6}


def mperdeg(lat):
    p = math.radians(lat)
    mlat = 111132.92 - 559.82 * math.cos(2 * p) + 1.175 * math.cos(4 * p)
    mlon = 111412.84 * math.cos(p) - 93.5 * math.cos(3 * p)
    return mlat, mlon


def r1(v):
    return round(v, 1)


def stable_hash(s):
    return int(hashlib.md5(str(s).encode()).hexdigest()[:8], 16)


# ----------------------------------------------------------------------------------------------
# geometry helpers
# ----------------------------------------------------------------------------------------------
def poly_area(pts):
    a = 0.0
    for i in range(len(pts)):
        x1, z1 = pts[i]
        x2, z2 = pts[(i + 1) % len(pts)]
        a += x1 * z2 - x2 * z1
    return a / 2.0


def centroid(pts):
    a = poly_area(pts)
    if abs(a) < 1e-6:
        return (sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts))
    cx = cz = 0.0
    for i in range(len(pts)):
        x1, z1 = pts[i]
        x2, z2 = pts[(i + 1) % len(pts)]
        f = x1 * z2 - x2 * z1
        cx += (x1 + x2) * f
        cz += (z1 + z2) * f
    return (cx / (6 * a), cz / (6 * a))


def simplify_ring(pts, tol=0.25):
    """Drop duplicate and collinear vertices of a closed ring (no repeated end point)."""
    out = []
    for p in pts:
        if not out or abs(p[0] - out[-1][0]) > 0.05 or abs(p[1] - out[-1][1]) > 0.05:
            out.append(p)
    if len(out) > 1 and abs(out[0][0] - out[-1][0]) < 0.05 and abs(out[0][1] - out[-1][1]) < 0.05:
        out.pop()
    changed = True
    while changed and len(out) > 3:
        changed = False
        for i in range(len(out)):
            a, b, c = out[i - 1], out[i], out[(i + 1) % len(out)]
            abx, abz = b[0] - a[0], b[1] - a[1]
            acx, acz = c[0] - a[0], c[1] - a[1]
            L = math.hypot(acx, acz)
            if L < 1e-6:
                out.pop(i); changed = True; break
            dist = abs(abx * acz - abz * acx) / L
            if dist < tol:
                out.pop(i); changed = True; break
    return out


def clip_polygon(pts, minx, minz, maxx, maxz):
    """Sutherland-Hodgman clip of a ring against an axis-aligned rectangle."""
    def clip(poly, inside, inter):
        res = []
        for i in range(len(poly)):
            cur, prev = poly[i], poly[i - 1]
            if inside(cur):
                if not inside(prev):
                    res.append(inter(prev, cur))
                res.append(cur)
            elif inside(prev):
                res.append(inter(prev, cur))
        return res

    def ix(x):
        return lambda a, b: (x, a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]))

    def iz(z):
        return lambda a, b: (a[0] + (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]), z)

    poly = pts
    for inside, inter in ((lambda p: p[0] >= minx, ix(minx)), (lambda p: p[0] <= maxx, ix(maxx)),
                          (lambda p: p[1] >= minz, iz(minz)), (lambda p: p[1] <= maxz, iz(maxz))):
        if not poly:
            break
        poly = clip(poly, inside, inter)
    return poly


def point_in_poly(x, z, pts):
    inside = False
    j = len(pts) - 1
    for i in range(len(pts)):
        xi, zi = pts[i]
        xj, zj = pts[j]
        if (zi > z) != (zj > z) and x < (xj - xi) * (z - zi) / (zj - zi + 1e-12) + xi:
            inside = not inside
        j = i
    return inside


def assemble_rings(way_node_lists):
    """Join open way segments (relation members) into closed rings by matching end nodes."""
    segs = [list(w) for w in way_node_lists if len(w) >= 2]
    rings = []
    while segs:
        ring = segs.pop(0)
        progress = True
        while ring[0] != ring[-1] and progress:
            progress = False
            for i, s in enumerate(segs):
                if s[0] == ring[-1]:
                    ring += s[1:]
                elif s[-1] == ring[-1]:
                    ring += s[::-1][1:]
                elif s[-1] == ring[0]:
                    ring = s[:-1] + ring
                elif s[0] == ring[0]:
                    ring = s[::-1][:-1] + ring
                else:
                    continue
                segs.pop(i)
                progress = True
                break
        rings.append(ring)  # unclosed rings (members outside the download) are closed implicitly
    return rings


# ----------------------------------------------------------------------------------------------
# OSM loading
# ----------------------------------------------------------------------------------------------
def load_osm(paths):
    nodes, node_tags, ways, rels = {}, {}, {}, {}
    for p in paths:
        for _, el in ET.iterparse(p, events=("end",)):
            if el.tag == "node":
                nid = int(el.get("id"))
                nodes[nid] = (float(el.get("lat")), float(el.get("lon")))
                tags = {t.get("k"): t.get("v") for t in el.findall("tag")}
                if tags:
                    node_tags[nid] = tags
                el.clear()
            elif el.tag == "way":
                wid = int(el.get("id"))
                if wid not in ways:
                    ways[wid] = ([int(n.get("ref")) for n in el.findall("nd")],
                                 {t.get("k"): t.get("v") for t in el.findall("tag")})
                el.clear()
            elif el.tag == "relation":
                rid = int(el.get("id"))
                members = [(m.get("type"), int(m.get("ref")), m.get("role")) for m in el.findall("member")]
                tags = {t.get("k"): t.get("v") for t in el.findall("tag")}
                if rid in rels:  # merge partial member lists from different tiles
                    old = rels[rid][0]
                    seen = set(old)
                    old += [m for m in members if m not in seen]
                else:
                    rels[rid] = (members, tags)
                el.clear()
    return nodes, node_tags, ways, rels


def parse_float(v):
    if v is None:
        return None
    try:
        return float(str(v).replace("m", "").replace(",", ".").split(";")[0].strip())
    except ValueError:
        return None


def building_height(tags, area, wid, stats):
    h = parse_float(tags.get("height"))
    if h and 2 < h < 300:
        stats["height_tag"] += 1
        return h, int(round(h / 3.2))
    lv = parse_float(tags.get("building:levels"))
    if lv and 0 < lv < 80:
        stats["levels_tag"] += 1
        return lv * 3.2 + 1.0, int(lv)
    # ASSUMPTION: heuristic heights for untagged buildings, seeded by OSM id so it is stable
    stats["heuristic"] += 1
    b = tags.get("building", "yes")
    r = (stable_hash(wid) % 1000) / 1000.0
    if b in ("house", "detached", "hut", "shed", "garage", "garages", "roof", "kiosk", "toilets"):
        lv = 1 + int(r * 2)
    elif b in ("apartments", "residential"):
        lv = 3 + int(r * 5)
    elif b in ("commercial", "office", "retail", "hotel"):
        lv = 3 + int(r * 5)
    elif b in ("temple", "church", "mosque", "religious"):
        lv = 2
    elif b in ("industrial", "warehouse"):
        lv = 2
    else:
        # bigger footprints in central Pune tend to be taller apartment / office blocks
        base = 2 if area < 150 else 3 if area < 500 else 4
        lv = base + int(r * 3)
    if b == "roof":
        return 3.5, 1
    return lv * 3.2 + 0.8, lv


# ----------------------------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("city")
    ap.add_argument("--raw")
    ap.add_argument("--out")
    a = ap.parse_args()
    cfg = json.load(open(os.path.join(HERE, "cities.json")))[a.city]
    raw = a.raw or os.path.join(HERE, "raw", a.city)
    out = a.out or os.path.join(HERE, "..", "..", "UnityProject", "Assets", "StreamingAssets", "Cities", a.city)
    out = os.path.normpath(out)
    paths = sorted(glob.glob(os.path.join(raw, "*.osm")))
    if not paths:
        sys.exit("no .osm tiles in %s - run fetch_osm.py first" % raw)
    print("Loading %d tiles ..." % len(paths))
    nodes, node_tags, ways, rels = load_osm(paths)
    print("  nodes %d  ways %d  relations %d" % (len(nodes), len(ways), len(rels)))

    S, W, N, E = cfg["bbox"]
    lat0, lon0 = (S + N) / 2, (W + E) / 2
    mlat, mlon = mperdeg(lat0)

    def proj(nid):
        la, lo = nodes[nid]
        return ((lo - lon0) * mlon, (la - lat0) * mlat)

    minx, maxx = (W - lon0) * mlon, (E - lon0) * mlon
    minz, maxz = (S - lat0) * mlat, (N - lat0) * mlat
    CH = cfg.get("chunk_size", 250)
    ncx, ncz = int(math.ceil((maxx - minx) / CH)), int(math.ceil((maxz - minz) / CH))

    def inside(x, z, m=0.0):
        return minx - m <= x <= maxx + m and minz - m <= z <= maxz + m

    def chunk_of(x, z):
        return (min(ncx - 1, max(0, int((x - minx) // CH))), min(ncz - 1, max(0, int((z - minz) // CH))))

    chunks = defaultdict(lambda: {"buildings": [], "areas": [], "roads": [], "rails": [], "trees": []})
    globals_ = {"areas": [], "waterLines": []}
    stats = defaultdict(int)

    # ---------------- roads + drivable graph ----------------
    graph_index = {}
    gx, gz, gflags = [], [], []
    edges_a, edges_b, edges_road, edges_dir = [], [], [], []
    roads = []

    def gnode(nid):
        if nid not in graph_index:
            x, z = proj(nid)
            graph_index[nid] = len(gx)
            gx.append(r1(x)); gz.append(r1(z))
            t = node_tags.get(nid, {})
            f = 0
            if t.get("highway") == "traffic_signals" or t.get("crossing") == "traffic_signals":
                f |= 1
            if t.get("traffic_calming") in ("bump", "hump", "table", "cushion", "rumble_strip", "yes"):
                f |= 2
            if t.get("highway") == "crossing" or t.get("railway") == "level_crossing":
                f |= 4
            gflags.append(f)
        return graph_index[nid]

    road_way_ids = []
    for wid, (nds, tags) in ways.items():
        hw = tags.get("highway")
        if hw not in ROAD_TYPES or tags.get("area") == "yes":
            continue
        if any(n not in nodes for n in nds):
            nds = [n for n in nds if n in nodes]
        if len(nds) < 2:
            continue
        road_way_ids.append(wid)

    for wid in sorted(road_way_ids):
        nds, tags = ways[wid]
        nds = [n for n in nds if n in nodes]
        hw = tags["highway"]
        width, rank, speed, drivable, traffic = ROAD_TYPES[hw]
        if tags.get("access") in ("private", "no") and hw == "service":
            drivable = False
        if tags.get("tunnel") in ("yes", "building_passage") and hw in RENDER_ONLY_FOOT:
            continue
        lanes = parse_float(tags.get("lanes"))
        oneway_tag = tags.get("oneway", "")
        oneway = 0
        if oneway_tag in ("yes", "1", "true") or tags.get("junction") in ("roundabout", "circular") or hw == "motorway":
            oneway = 1
        elif oneway_tag == "-1":
            oneway = -1
        if lanes and lanes > 0:
            per = 3.1 if rank >= 5 else 2.9
            width = max(width * 0.7, min(lanes * per + 1.0, 28.0))
            stats["road_width_from_lanes"] += 1
        elif tags.get("width"):
            w = parse_float(tags.get("width"))
            if w and 2 < w < 40:
                width = w
        maxspeed = parse_float(tags.get("maxspeed"))
        if maxspeed and 5 < maxspeed < 130:
            speed = maxspeed
        # split into runs of nodes inside the play area (+60 m)
        runs, cur = [], []
        for n in nds:
            x, z = proj(n)
            if inside(x, z, 60):
                cur.append(n)
            else:
                if len(cur) >= 2:
                    runs.append(cur)
                cur = []
        if len(cur) >= 2:
            runs.append(cur)
        for run in runs:
            ridx = len(roads)
            gn = [gnode(n) for n in run]
            name = tags.get("name:en") or tags.get("name") or ""
            alt = tags.get("alt_name", "")
            roads.append({
                "id": wid, "name": name, "alt": alt, "type": hw, "width": round(width, 1), "rank": rank,
                "lanes": int(lanes) if lanes else 0, "oneway": oneway, "speed": int(speed),
                "drivable": 1 if drivable else 0, "traffic": 1 if traffic and drivable else 0,
                "bridge": 1 if tags.get("bridge") not in (None, "no") else 0,
                "tunnel": 1 if tags.get("tunnel") not in (None, "no") else 0,
                "layer": int(parse_float(tags.get("layer")) or 0), "nodes": gn})
            if drivable:
                for i in range(len(gn) - 1):
                    if gn[i] == gn[i + 1]:
                        continue
                    edges_a.append(gn[i]); edges_b.append(gn[i + 1]); edges_road.append(ridx)
                    edges_dir.append(1 if oneway == 1 else 2 if oneway == -1 else 3)
            # chunk pieces (consecutive segments whose midpoint is in the same chunk)
            piece, pchunk = [], None
            for i in range(len(gn) - 1):
                mx, mz = (gx[gn[i]] + gx[gn[i + 1]]) / 2, (gz[gn[i]] + gz[gn[i + 1]]) / 2
                c = chunk_of(mx, mz)
                if c != pchunk:
                    if piece:
                        chunks[pchunk]["roads"].append({"road": ridx, "nodes": piece})
                    piece, pchunk = [gn[i]], c
                piece.append(gn[i + 1])
            if piece:
                chunks[pchunk]["roads"].append({"road": ridx, "nodes": piece})
    stats["roads"] = len(roads)

    # ---------------- area helpers ----------------
    def ring_xy(nds):
        return [proj(n) for n in nds if n in nodes]

    def add_area(pts, kind, name, oid):
        pts = clip_polygon(pts, minx, minz, maxx, maxz)
        if len(pts) < 3:
            return
        pts = simplify_ring(pts, 0.5)
        if len(pts) < 3:
            return
        ar = poly_area(pts)
        if abs(ar) < 20:
            return
        if ar < 0:
            pts = pts[::-1]
        xs = [p[0] for p in pts]; zs = [p[1] for p in pts]
        flat = [r1(v) for p in pts for v in p]
        item = {"id": oid, "kind": kind, "name": name, "pts": flat}
        if max(xs) - min(xs) > CH * 1.2 or max(zs) - min(zs) > CH * 1.2:
            globals_["areas"].append(item)
        else:
            chunks[chunk_of(*centroid(pts))]["areas"].append(item)
        stats["area_" + kind] += 1
        if kind in ("park", "forest") and abs(ar) > 300:
            # ASSUMPTION: decorative trees scattered inside parks (OSM rarely maps individual trees here)
            n = min(int(abs(ar) / 180), 400)
            seed = stable_hash(oid)
            bx0, bx1, bz0, bz1 = min(xs), max(xs), min(zs), max(zs)
            placed = 0
            for k in range(n * 3):
                if placed >= n:
                    break
                seed = (seed * 1103515245 + 12345) & 0x7FFFFFFF
                tx = bx0 + (seed % 10000) / 10000.0 * (bx1 - bx0)
                seed = (seed * 1103515245 + 12345) & 0x7FFFFFFF
                tz = bz0 + (seed % 10000) / 10000.0 * (bz1 - bz0)
                if point_in_poly(tx, tz, pts):
                    chunks[chunk_of(tx, tz)]["trees"] += [r1(tx), r1(tz)]
                    placed += 1

    def area_kind(tags):
        for k, v, kind in AREA_RULES:
            if tags.get(k) == v:
                return kind
        return None

    # ---------------- buildings ----------------
    def add_building(pts, tags, oid):
        if len(pts) < 3:
            return
        cx, cz = centroid(pts)
        if not inside(cx, cz):
            return
        pts = simplify_ring(pts, 0.3)
        if len(pts) < 3:
            return
        ar = poly_area(pts)
        if abs(ar) < 8:
            return
        if ar < 0:
            pts = pts[::-1]
        h, lv = building_height(tags, abs(ar), oid, stats)
        minh = parse_float(tags.get("min_height")) or 0
        minlv = parse_float(tags.get("building:min_level"))
        if minlv and minlv > 0 and not minh:
            minh = minlv * 3.2
        b0 = tags.get("building") or ""
        layer = parse_float(tags.get("layer")) or 0
        if b0 == "roof":                       # canopies (petrol pumps, platforms): open underneath
            minh = max(minh, 3.6); h = max(h, minh + 0.6)
            stats["canopy_roofs"] += 1
        elif layer >= 1 and covers_drivable_road(pts):
            # elevated structures over a carriageway (Pune Metro stations, skywalks): keep the road passable
            minh = max(minh, 7.0); h = max(h, minh + 6.0)
            stats["elevated_over_road"] += 1
        b = tags.get("building") or tags.get("building:part") or "yes"
        kind = b
        if tags.get("amenity") == "place_of_worship" or b in ("temple", "church", "mosque", "religious"):
            kind = "worship"
        elif tags.get("historic"):
            kind = "historic"
        name = tags.get("name:en") or tags.get("name") or ""
        chunks[chunk_of(cx, cz)]["buildings"].append({
            "id": oid, "kind": kind, "name": name, "h": round(h, 1), "minH": round(minh, 1), "levels": lv,
            "pts": [r1(v) for p in pts for v in p]})
        stats["buildings"] += 1

    road_grid = defaultdict(list)
    for r in roads:
        if r["drivable"] and r["rank"] >= 3 and not r["tunnel"]:
            for n in r["nodes"]:
                road_grid[(int(gx[n] // 50), int(gz[n] // 50))].append((gx[n], gz[n]))

    def covers_drivable_road(pts):
        xs = [p[0] for p in pts]; zs = [p[1] for p in pts]
        for cx_ in range(int(min(xs) // 50), int(max(xs) // 50) + 1):
            for cz_ in range(int(min(zs) // 50), int(max(zs) // 50) + 1):
                for (x, z) in road_grid.get((cx_, cz_), ()):
                    if min(xs) <= x <= max(xs) and min(zs) <= z <= max(zs) and point_in_poly(x, z, pts):
                        return True
        return False

    for wid, (nds, tags) in ways.items():
        if len(nds) < 4 or nds[0] != nds[-1]:
            continue
        if tags.get("building") and tags.get("building") != "no":
            add_building(ring_xy(nds[:-1]), tags, wid)
            continue
        kind = area_kind(tags)
        if kind:
            add_area(ring_xy(nds[:-1]), kind, tags.get("name", ""), wid)

    for rid, (members, tags) in rels.items():
        if tags.get("type") not in ("multipolygon", "boundary") or tags.get("type") == "boundary":
            continue
        outers = [ways[ref][0] for typ, ref, role in members if typ == "way" and role in ("outer", "") and ref in ways]
        if not outers:
            continue
        rings = assemble_rings(outers)
        is_building = tags.get("building") and tags.get("building") != "no"
        kind = None if is_building else area_kind(tags)
        for i, ring in enumerate(rings):
            ring = [n for n in ring if n in nodes]
            if len(ring) > 1 and ring[0] == ring[-1]:
                ring = ring[:-1]
            if len(ring) < 3:
                continue
            oid = rid * 10 + i + 9_000_000_000_000
            if is_building:
                add_building(ring_xy(ring), tags, oid)
            elif kind:
                add_area(ring_xy(ring), kind, tags.get("name", ""), oid)

    # ---------------- waterways & railways ----------------
    WATERLINE_W = {"river": 40.0, "canal": 12.0, "stream": 4.0, "drain": 2.5, "ditch": 1.5}
    for wid, (nds, tags) in ways.items():
        ww = tags.get("waterway")
        if ww in WATERLINE_W and tags.get("tunnel") not in ("yes", "culvert"):
            pts = [proj(n) for n in nds if n in nodes]
            pts = [p for p in pts if inside(p[0], p[1], 100)]
            if len(pts) >= 2:
                w = parse_float(tags.get("width")) or WATERLINE_W[ww]
                globals_["waterLines"].append({"id": wid, "kind": ww, "name": tags.get("name", ""), "width": w,
                                               "pts": [r1(v) for p in pts for v in p]})
        rw = tags.get("railway")
        if rw in ("rail", "light_rail", "subway", "narrow_gauge") and tags.get("service") not in ("yard", "siding", "spur"):
            tunnel = tags.get("tunnel") not in (None, "no")
            if tunnel:
                continue  # underground Pune Metro sections are not rendered
            elevated = tags.get("bridge") not in (None, "no") and (rw in ("subway", "light_rail") or (parse_float(tags.get("layer")) or 0) >= 1)
            pts = [proj(n) for n in nds if n in nodes]
            piece, pchunk = [], None
            for i in range(len(pts) - 1):
                p0, p1 = pts[i], pts[i + 1]
                mx, mz = (p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2
                if not inside(mx, mz):
                    if piece:
                        chunks[pchunk]["rails"].append({"id": wid, "kind": rw, "elevated": int(elevated),
                                                        "name": tags.get("name", ""), "pts": piece})
                    piece, pchunk = [], None
                    continue
                c = chunk_of(mx, mz)
                if c != pchunk:
                    if piece:
                        chunks[pchunk]["rails"].append({"id": wid, "kind": rw, "elevated": int(elevated),
                                                        "name": tags.get("name", ""), "pts": piece})
                    piece, pchunk = [r1(p0[0]), r1(p0[1])], c
                piece += [r1(p1[0]), r1(p1[1])]
            if piece:
                chunks[pchunk]["rails"].append({"id": wid, "kind": rw, "elevated": int(elevated),
                                                "name": tags.get("name", ""), "pts": piece})
            stats["rail_" + rw + ("_elevated" if elevated else "")] += 1

    # ---------------- trees (individual natural=tree nodes) ----------------
    for nid, t in node_tags.items():
        if t.get("natural") == "tree":
            x, z = proj(nid)
            if inside(x, z):
                chunks[chunk_of(x, z)]["trees"] += [r1(x), r1(z)]
                stats["osm_trees"] += 1

    # ---------------- POIs, places, landmarks ----------------
    pois = []
    named_centres = defaultdict(list)  # name -> [(x,z,kind)]

    def poi_kind(tags):
        for key, mapping in POI_RULES:
            v = tags.get(key)
            if v is None:
                continue
            if mapping is None:
                return "historic"
            if v in mapping:
                return mapping[v]
        return None

    for nid, t in node_tags.items():
        x, z = proj(nid)
        if not inside(x, z):
            continue
        name = t.get("name:en") or t.get("name")
        k = poi_kind(t)
        if t.get("place") in ("suburb", "neighbourhood", "quarter", "locality"):
            if t.get("name"):
                pois.append({"name": name, "kind": "place", "x": r1(x), "z": r1(z)})
                named_centres[t.get("name")].append((x, z, "place"))
            continue
        if k and (name or k in ("fuel", "bus_stop")):
            pois.append({"name": name or "", "kind": k, "x": r1(x), "z": r1(z)})
        if name:
            named_centres[t.get("name")].append((x, z, k or "other"))
            if t.get("name:en"):
                named_centres[t.get("name:en")].append((x, z, k or "other"))
    for wid, (nds, t) in ways.items():
        name = t.get("name")
        if not name or "highway" in t or "waterway" in t or "railway" in t and t.get("railway") not in ("station", "platform"):
            continue
        pts = ring_xy(nds[:-1] if nds and nds[0] == nds[-1] else nds)
        if len(pts) < 3:
            continue
        cx, cz = centroid(pts)
        if not inside(cx, cz):
            continue
        k = poi_kind(t) or ("building" if t.get("building") else area_kind(t) or "other")
        named_centres[name].append((cx, cz, k))
        if t.get("name:en"):
            named_centres[t.get("name:en")].append((cx, cz, k))
        if poi_kind(t):
            pois.append({"name": t.get("name:en") or name, "kind": poi_kind(t), "x": r1(cx), "z": r1(cz)})
    for rid, (members, t) in rels.items():
        name = t.get("name")
        if not name or t.get("type") != "multipolygon":
            continue
        outers = [ways[ref][0] for typ, ref, role in members if typ == "way" and role == "outer" and ref in ways]
        pts = [p for o in outers for p in ring_xy(o)]
        if len(pts) >= 3:
            cx = sum(p[0] for p in pts) / len(pts); cz = sum(p[1] for p in pts) / len(pts)
            if inside(cx, cz):
                named_centres[name].append((cx, cz, poi_kind(t) or area_kind(t) or "other"))

    landmarks, missing = [], []
    for display, candidates in LANDMARKS.get(a.city, []):
        found = None
        for cand in candidates:
            if cand in named_centres:
                want_station = "Railway Station" in display
                opts = sorted(named_centres[cand], key=lambda o: (0 if want_station and o[2] == "rail_station" else 1,
                                                                   LANDMARK_KIND_PRIORITY.get(o[2], 2)))
                found = (cand, opts[0])
                break
        if found:
            x, z, k = found[1]
            landmarks.append({"name": display, "osmName": found[0], "kind": k, "x": r1(x), "z": r1(z)})
        else:
            missing.append(display)

    # ---------------- connectivity: keep largest strongly-usable component flag ----------------
    adj = defaultdict(list)
    for a_, b_ in zip(edges_a, edges_b):
        adj[a_].append(b_); adj[b_].append(a_)
    comp = [-1] * len(gx)
    sizes = []
    for s in range(len(gx)):
        if comp[s] != -1 or s not in adj:
            continue
        cid = len(sizes); stack = [s]; comp[s] = cid; cnt = 0
        while stack:
            u = stack.pop(); cnt += 1
            for v in adj[u]:
                if comp[v] == -1:
                    comp[v] = cid; stack.append(v)
        sizes.append(cnt)
    main_c = max(range(len(sizes)), key=lambda i: sizes[i]) if sizes else -1
    for i in range(len(gx)):
        if comp[i] == main_c:
            gflags[i] |= 8  # bit 3: node belongs to the main connected road network
    stats["graph_nodes"] = len(gx)
    stats["graph_edges"] = len(edges_a)
    stats["main_component_nodes"] = sizes[main_c] if sizes else 0

    # ---------------- write ----------------
    os.makedirs(os.path.join(out, "chunks"), exist_ok=True)
    for f in glob.glob(os.path.join(out, "chunks", "*.json")):
        os.remove(f)
    chunk_list = []
    for (cx, cz), c in sorted(chunks.items()):
        fn = "c_%d_%d.json" % (cx, cz)
        with open(os.path.join(out, "chunks", fn), "w") as f:
            json.dump({"cx": cx, "cz": cz, **c}, f, separators=(",", ":"), ensure_ascii=False)
        chunk_list.append({"cx": cx, "cz": cz, "file": fn, "buildings": len(c["buildings"])})

    pois.sort(key=lambda p: (p["kind"], p["name"]))
    spawn = next((l for l in landmarks if l["name"] == cfg.get("default_spawn")), landmarks[0] if landmarks else None)
    index = {
        "cityId": a.city, "name": cfg["name"], "state": cfg.get("state", ""),
        "attribution": "Map data (c) OpenStreetMap contributors, ODbL 1.0 - openstreetmap.org/copyright",
        "bboxS": S, "bboxW": W, "bboxN": N, "bboxE": E, "originLat": lat0, "originLon": lon0,
        "metersPerDegLat": mlat, "metersPerDegLon": mlon,
        "minX": r1(minx), "minZ": r1(minz), "maxX": r1(maxx), "maxZ": r1(maxz),
        "chunkSize": CH, "chunksX": ncx, "chunksZ": ncz, "chunks": chunk_list,
        "spawnName": spawn["name"] if spawn else "", "spawnX": spawn["x"] if spawn else 0, "spawnZ": spawn["z"] if spawn else 0,
        "nodeX": gx, "nodeZ": gz, "nodeFlags": gflags,
        "edgeA": edges_a, "edgeB": edges_b, "edgeRoad": edges_road, "edgeDir": edges_dir,
        "roads": [{k: v for k, v in r.items() if k != "nodes"} | {"nodes": r["nodes"]} for r in roads],
        "pois": pois, "landmarks": landmarks,
    }
    with open(os.path.join(out, "index.json"), "w") as f:
        json.dump(index, f, separators=(",", ":"), ensure_ascii=False)
    with open(os.path.join(out, "global.json"), "w") as f:
        json.dump(globals_, f, separators=(",", ":"), ensure_ascii=False)

    size = sum(os.path.getsize(p) for p in glob.glob(os.path.join(out, "**", "*.json"), recursive=True))
    print("Wrote %s  (%.1f MB, %d chunks of %dm)" % (out, size / 1e6, len(chunk_list), CH))
    print("Play area: %.0f m x %.0f m" % (maxx - minx, maxz - minz))
    for k in sorted(stats):
        print("  %-28s %d" % (k, stats[k]))
    print("Landmarks found: %d" % len(landmarks))
    for l in landmarks:
        print("   + %-38s <- '%s' (%s) at %.0f,%.0f" % (l["name"], l["osmName"], l["kind"], l["x"], l["z"]))
    if missing:
        print("Landmarks NOT in OSM data (not placed): " + ", ".join(missing))


if __name__ == "__main__":
    main()
