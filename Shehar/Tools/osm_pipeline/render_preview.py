"""Render a top-down preview of generated city data (verifies geometry before it reaches the engine).
Usage: python3 render_preview.py pune [--out preview.png]"""
import argparse, glob, json, os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.collections import LineCollection, PolyCollection

HERE = os.path.dirname(os.path.abspath(__file__))
AREA_COL = {"water": "#5b9bd5", "park": "#9ccc65", "grass": "#b5d98a", "forest": "#689f38", "pitch": "#aed581",
            "campus": "#efe3c8", "residential": "#ece7df", "commercial": "#f2d7d5", "industrial": "#ddd",
            "parking": "#d6d6d6", "railway": "#cfc6d6", "cemetery": "#c5d6b5", "military": "#e6c9a8",
            "construction": "#d9cbb0", "sand": "#e8dcb0"}


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("city"); ap.add_argument("--out"); a = ap.parse_args()
    d = os.path.join(HERE, "..", "..", "UnityProject", "Assets", "StreamingAssets", "Cities", a.city)
    idx = json.load(open(os.path.join(d, "index.json"))); gl = json.load(open(os.path.join(d, "global.json")))
    chunks = [json.load(open(p)) for p in glob.glob(os.path.join(d, "chunks", "*.json"))]
    fig, ax = plt.subplots(figsize=(16, 16.8), dpi=110)
    ax.set_facecolor("#e9e4d8")
    areas = gl["areas"] + [ar for c in chunks for ar in c["areas"]]
    order = ["residential", "commercial", "industrial", "campus", "military", "railway", "cemetery", "construction",
             "parking", "grass", "pitch", "park", "forest", "sand", "water"]
    for k in order:
        polys = [list(zip(ar["pts"][0::2], ar["pts"][1::2])) for ar in areas if ar["kind"] == k]
        ax.add_collection(PolyCollection(polys, facecolors=AREA_COL[k], edgecolors="none"))
    for wl in gl["waterLines"]:
        ax.plot(wl["pts"][0::2], wl["pts"][1::2], color="#5b9bd5", lw=max(0.5, wl["width"] / 12), solid_capstyle="round")
    bpolys = [list(zip(b["pts"][0::2], b["pts"][1::2])) for c in chunks for b in c["buildings"]]
    ax.add_collection(PolyCollection(bpolys, facecolors="#b9a99a", edgecolors="#8d7d6e", linewidths=0.15))
    nx, nz = idx["nodeX"], idx["nodeZ"]
    for rank_min, col, scale in ((0, "#ffffff", 0.25), (5, "#ffe08a", 0.35), (7, "#f6a04d", 0.4)):
        segs, lws = [], []
        for r in idx["roads"]:
            if r["rank"] < rank_min or (rank_min == 0 and r["rank"] >= 5):
                continue
            pts = [(nx[n], nz[n]) for n in r["nodes"]]
            segs.append(pts); lws.append(max(0.3, r["width"] * scale))
        ax.add_collection(LineCollection(segs, colors=col, linewidths=lws, zorder=3))
    for c in chunks:
        for rl in c["rails"]:
            ax.plot(rl["pts"][0::2], rl["pts"][1::2], color="#7e57c2" if rl["kind"] != "rail" else "#444",
                    lw=1.6 if rl["elevated"] else 1.0, ls="-" if rl["elevated"] or rl["kind"] == "rail" else "--", zorder=4)
    sig = [i for i, f in enumerate(idx["nodeFlags"]) if f & 1]
    ax.scatter([nx[i] for i in sig], [nz[i] for i in sig], s=5, c="red", zorder=5, label="traffic signals (OSM)")
    fuel = [p for p in idx["pois"] if p["kind"] == "fuel"]
    ax.scatter([p["x"] for p in fuel], [p["z"] for p in fuel], s=22, marker="s", c="#2e7d32", zorder=5, label="fuel stations (OSM)")
    for l in idx["landmarks"]:
        ax.scatter([l["x"]], [l["z"]], s=40, c="#1E3A8A", zorder=6)
        ax.annotate(l["name"], (l["x"], l["z"]), xytext=(4, 4), textcoords="offset points", fontsize=8, color="#1E3A8A",
                    weight="bold", zorder=7)
    for r in idx["roads"]:
        if r["rank"] >= 6 and r["name"] and len(r["nodes"]) > 6:
            m = r["nodes"][len(r["nodes"]) // 2]
            ax.annotate(r["alt"] or r["name"], (nx[m], nz[m]), fontsize=6, color="#7a4b00", zorder=6)
    ax.set_xlim(idx["minX"], idx["maxX"]); ax.set_ylim(idx["minZ"], idx["maxZ"]); ax.set_aspect("equal")
    ax.set_title("%s playable area - generated from OpenStreetMap (bbox %.3f,%.3f - %.3f,%.3f); x=east, z=north, metres"
                 % (idx["name"], idx["bboxS"], idx["bboxW"], idx["bboxN"], idx["bboxE"]))
    ax.legend(loc="lower left")
    ax.text(0.99, 0.005, idx["attribution"], transform=ax.transAxes, ha="right", fontsize=8)
    out = a.out or os.path.join(HERE, "..", "..", "Docs", "images", "%s_osm_extract.png" % a.city)
    fig.savefig(out, bbox_inches="tight"); print("wrote", os.path.normpath(out))


if __name__ == "__main__":
    main()
