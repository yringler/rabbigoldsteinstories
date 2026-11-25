"""Check whether row N of the TZH master tape catalog describes radio episode N.

For each catalog row with a story title, look for the title's content words in the transcript
of episode N and of episodes N+offset (offset -3..+3); a correct alignment should peak at 0.

Usage: python -I -X utf8 check_catalog_alignment.py <StoryArchive> <profile_items.csv> <tzh_catalog_raw.csv> <out csv>
"""
import csv, sys, os, re, collections

ARCH, PROF, CAT, OUT = sys.argv[1:5]
prof = list(csv.DictReader(open(PROF, encoding='utf-8-sig')))
eps = collections.defaultdict(list)
for d in prof:
    if d['episode_no']: eps[int(d['episode_no'])].append(d)
cat = list(csv.reader(open(CAT, encoding='utf-8-sig')))
STOP = set('the a an of and in on to for with by at from his her my our is was #1 #2 #3 #4 1 2 3 4 5 6 7 8 9 10 11 12'.split())

def toks(s):
    return [w for w in re.findall(r"[a-z']+", s.lower().replace('’', "'")) if w not in STOP and len(w) > 2]

cache = {}
def ep_text(n):
    if n in cache: return cache[n]
    t = ''
    for d in eps.get(n, []):
        p = os.path.join(ARCH, 'transcripts', d['id'] + '.txt')
        if os.path.exists(p): t += ' ' + open(p, encoding='utf-8').read().lower()
    cache[n] = set(re.findall(r"[a-z']+", t)); return cache[n]

def score(title, n):
    tk = toks(title)
    if not tk or n not in eps: return None
    T = ep_text(n)
    return sum(1 for w in tk if w in T) / len(tk)

offs = range(-3, 4)
agg = {o: [] for o in offs}
rows = []
for n in range(1, len(cat)):
    vis, topic, story, done = (cat[n] + [''] * 5)[:4]
    if n not in eps: continue
    title = story + ' ' + topic
    s = {o: score(story, n + o) for o in offs} if toks(story) else {}
    for o, v in s.items():
        if v is not None: agg[o].append(v)
    rows.append({'episode': n, 'visitors': vis, 'topic': topic, 'story': story, 'done': done,
                 'score_at_0': '' if not s or s[0] is None else round(s[0], 2),
                 'best_offset': '' if not s else max((o for o in offs if s[o] is not None), key=lambda o: s[o], default='')})
print('mean title-word hit rate by offset (row N vs episode N+offset):')
for o in offs:
    L = agg[o]; print(f'  {o:+d}: n={len(L)} mean={sum(L) / max(1, len(L)):.2f} full={sum(1 for v in L if v >= 0.99)}')
# by range
for lo, hi in ((1, 112), (113, 200), (201, 300), (301, 400), (401, 555)):
    L = [r for r in rows if lo <= r['episode'] <= hi and r['score_at_0'] != '']
    good = [r for r in L if r['score_at_0'] >= 0.6]
    filled = [r for r in rows if lo <= r['episode'] <= hi and (r['story'] or r['topic'])]
    print(f'  episodes {lo}-{hi}: in archive {sum(1 for n in eps if lo <= n <= hi)}, catalog rows with story/topic {len(filled)}, '
          f'title found in transcript (>=60% words) {len(good)}/{len(L)}')
with open(OUT, 'w', encoding='utf-8-sig', newline='') as f:
    w = csv.DictWriter(f, fieldnames=list(rows[0].keys())); w.writeheader(); w.writerows(rows)
bad = [r for r in rows if r['score_at_0'] != '' and r['score_at_0'] < 0.5]
print('low-score rows:', len(bad))
for r in bad[:30]: print('  ', r['episode'], '|', r['topic'], '|', r['story'], '|', r['score_at_0'], 'best', r['best_offset'])
