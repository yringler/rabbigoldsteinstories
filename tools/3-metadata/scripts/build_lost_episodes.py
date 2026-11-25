"""Build data/indexes/lost_episodes.json: radio episode numbers in the master tape
catalog that have no full episode recording in the archive (or only a hidden one).

Usage: python -X utf8 build_lost_episodes.py <eps.csv from parse_tzh_catalog.py> <repo root>

The catalog's 'Visitor(s)' column holds children's names and is deliberately NOT copied.
"""
import csv, glob, json, os, sys
from datetime import date

eps_csv, root = sys.argv[1], sys.argv[2]
cat = {}
with open(eps_csv, encoding='utf-8-sig') as f:
    for r in csv.DictReader(f):
        clean = lambda v: (v.strip(' /') if v.strip(' /').upper() != 'MISSING' else '') or None
        cat[int(r['episode'])] = {'topic': clean(r['topic']), 'story': clean(r['story'])}

held, hidden, dated = {}, set(), {}
for p in glob.glob(os.path.join(root, 'data/recordings/**/*.meta.json'), recursive=True):
    d = json.load(open(p, encoding='utf-8'))
    c = d['classification']
    ep = (c.get('episode') or {})
    if ep.get('is_clip') or not ep.get('number') or c.get('series') != 'uy_tzivos_hashem_on_the_air':
        continue
    n = ep['number']
    if (d.get('quality') or {}).get('publish_recommendation') == 'hide':
        hidden.add(n); continue
    if c.get('content_type') != 'radio_episode':
        continue
    held[n] = d['id']
    g = (c.get('date') or {}).get('gregorian')
    if g and len(g) == 10 and (c['date'].get('precision') == 'day'):
        dated[n] = date.fromisoformat(g)

maxn = max(max(cat), max(held))
def neighbour(n, step):
    m = n + step
    while 1 <= m <= maxn:
        if m in dated: return m, dated[m]
        m += step
    return None

out = []
for n in range(1, maxn + 1):
    if n in held: continue
    e = {'episode': n, 'catalog_topic': (cat.get(n) or {}).get('topic'),
         'catalog_story': (cat.get(n) or {}).get('story'),
         'status': 'defective_copy' if n in hidden else 'lost'}
    lo, hi = neighbour(n, -1), neighbour(n, 1)
    # Weekly show: estimate by counting weeks from the nearest dated neighbour.
    # Rough only: the show had breaks, so give both bounds.
    e['aired_after'] = lo[1].isoformat() if lo else None
    e['aired_before'] = hi[1].isoformat() if hi else None
    e['estimated_date'] = None
    span = (hi[1] - lo[1]).days / (hi[0] - lo[0]) if lo and hi else 0
    # Only estimate where the neighbours are consistent with an unbroken weekly run.
    if 6 <= span <= 8:
        e['estimated_date'] = date.fromordinal(lo[1].toordinal() + round(span * (n - lo[0]))).isoformat()
    out.append(e)

res = {'generated_from': "TZH Catalouge updated (1).docx (media id 23e0277064) via parse_tzh_catalog.py, plus data/recordings; 2026-11-25",
       'note': "Episode numbers 1..%d with no publishable full-episode recording. catalog_topic/catalog_story are the producer's own notes (may be terse, partly Hebrew). estimated_date interpolates between the nearest dated episodes and ignores breaks: show it as approximate. The catalog's visitor names are intentionally omitted (children's names)." % maxn,
       'count': len(out), 'episodes': out}
dst = os.path.join(root, 'data/indexes/lost_episodes.json')
open(dst, 'w', encoding='utf-8').write(json.dumps(res, ensure_ascii=False, indent=1))
print(len(out), 'lost;', sum(1 for e in out if e['catalog_story'] or e['catalog_topic']), 'with a catalog title;', 'max', maxn)
