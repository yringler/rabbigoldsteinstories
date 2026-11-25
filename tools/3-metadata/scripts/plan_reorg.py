"""Dry run: propose a new StoryArchive/audio layout from the metadata. Moves nothing.

Writes reorg/moves_plan.csv (id, old_path, new_path, rule) and reorg/tree.txt (folder counts + sample files).
Run from _metadata: python -I -X utf8 scripts/plan_reorg.py
"""
import csv, glob, json, os, re, collections

ARCH = r"C:\Users\ybrin\Downloads\StoryArchive"
OUT = r"C:\Users\ybrin\Downloads\_metadata\reorg"
os.makedirs(OUT, exist_ok=True)
cat = {r["id"]: r for r in csv.DictReader(open(os.path.join(ARCH, "catalog.csv"), encoding="utf-8-sig"))}

SERIES_DIR = {
    "uy_tzivos_hashem_on_the_air": "Uncle Yossi - Tzivos Hashem on the Air",
    "weekly_story_i_believe": "R' Chaim Levi Goldstein - Weekly Stories",
    "tanya_yiddish_goldstein": "Yiddish/Tanya Shiurim - R' Yosef Goldstein",
    "haggadah_yiddish": "Yiddish/The Haggadah Explained",
    "bubby_zaidy_stories": "Family Recordings - Bubby and Zaidy",
    "maaseh_rav": "Maaseh Rav",
    "simchas_beis_hashoeva_5786": "Live Events/Simchas Beis Hashoeva 5786",
    "simchas_beis_hashoeva_5785": "Live Events/Simchas Beis Hashoeva 5785",
    "farbrengen_power": "Live Events/Farbrengen Power",
    "shema_beni": "Uncle Yossi - Shema B'ni",
    None: "Other Stories",
}
# the producer's own topical folders for radio clips are kept as segment categories
CLIP_FOLDERS = ["Inyonei Mitzvos", "Midos Tovos", "Yomim Tovim", "Chasidishe Yomim Tovim", "Parsha of the Week", "Stories"]


def clean(s, maxlen=110):
    s = s.replace(":", " -").replace("/", "-").replace("\\", "-")
    s = re.sub(r'[*?"<>|]', "", s)
    s = re.sub(r"\s+", " ", s).strip(" .")
    return s[:maxlen].rstrip(" .-")


def hebrew_year_dir(date):
    hy, g = (date or {}).get("hebrew_year"), (date or {}).get("gregorian") or ""
    if not hy:
        return "Undated"
    return f"{hy} ({int(hy) - 3761}-{str(int(hy) - 3760)[-2:]})"


plan = []
for p in sorted(glob.glob("items/*.json")):
    d = json.load(open(p, encoding="utf-8"))
    i, c, disp, q = d["id"], d["classification"], d["display"], d.get("quality", {})
    old = cat[i]["out_path"]
    series = c.get("series")
    base = SERIES_DIR.get(series, SERIES_DIR[None])
    title = disp["title"]
    ctype = c.get("content_type")
    ep = (c.get("episode") or {}).get("number")
    rule = series or "no_series"
    if series == "uy_tzivos_hashem_on_the_air":
        if ctype == "radio_episode" and ep is not None:
            t = re.sub(r"^Episode\s+\d+\w*\s*[:\-]\s*", "", title)
            g = (c.get("date") or {}).get("gregorian") or ""
            name = f"Ep {int(ep):03d} - {t}" + (f" ({g})" if len(g) == 10 else "")
            folder = f"{base}/Episodes/{hebrew_year_dir(c.get('date'))}"
            rule = "radio_episode"
        elif ctype in ("radio_segment",):
            src = cat[i]["folder"]
            sub = "Heritage Series" if "Heritage" in src else next((f for f in CLIP_FOLDERS if re.sub(r"\s+", " ", src).startswith(f)), "Other Segments")
            name = title + (f" (Ep {int(ep):03d})" if ep is not None else "")
            folder = f"{base}/Segments/{sub}"
            rule = "radio_segment"
        else:
            name, folder, rule = title, f"{base}/Extras", "radio_extra"
    else:
        part = c.get("part") or {}
        name = title
        folder = base
        if part.get("set_key") and (part.get("of") or 0) >= 3:  # longer multi-part sets get their own folder
            folder = f"{base}/{clean(re.sub(r',?\s*Part \d+.*$', '', title))}"
            rule += "+part_set"
        st = c.get("study_text") or []
        lec = next((s.get("lecture_number") for s in st if s.get("work") == "tanya" and s.get("lecture_number")), None)
        if series == "tanya_yiddish_goldstein" and lec is not None:
            name = f"Shiur {int(lec):02d} - " + re.sub(r"^Tanya Shiur\s+\w+\s*[:\-]\s*", "", title)
    rec = q.get("publish_recommendation")
    rels = {r["type"] for r in d.get("relations", [])}
    if rec == "hide" and "defective" not in name.lower():
        name += " (defective copy)"
    elif "superseded_by" in rels and "version" not in name.lower():
        name += " (other version)"
    plan.append({"id": i, "old_path": old, "new_path": f"audio/{folder}/{clean(name)}.mp3", "rule": rule})

# resolve collisions deterministically
seen = collections.Counter()
for r in plan:
    k = r["new_path"].lower()
    seen[k] += 1
    if seen[k] > 1:
        r["new_path"] = r["new_path"][:-4] + f" ({seen[k]}).mp3"
with open(os.path.join(OUT, "moves_plan.csv"), "w", newline="", encoding="utf-8-sig") as f:
    w = csv.DictWriter(f, fieldnames=["id", "old_path", "new_path", "rule"]); w.writeheader(); w.writerows(plan)

tree = collections.defaultdict(list)
for r in plan:
    tree[os.path.dirname(r["new_path"])].append(os.path.basename(r["new_path"]))
with open(os.path.join(OUT, "tree.txt"), "w", encoding="utf-8") as f:
    for folder in sorted(tree):
        files = sorted(tree[folder])
        f.write(f"{folder}/  ({len(files)} files)\n")
        for x in files[:3]:
            f.write(f"    {x}\n")
print(len(plan), "files;", len(tree), "folders; collisions renamed:", sum(1 for v in seen.values() if v > 1))
