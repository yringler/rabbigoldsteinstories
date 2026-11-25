"""Text-based test of the episode-number hypothesis for every numbered clip.

For each non-episode item, computes containment of its word 6-gram shingles in every radio
episode transcript; reports the best-matching episode, containment in the same-numbered
episode, and the approximate start time of the clip inside that episode.

Usage: python -I -X utf8 text_match_clips.py <StoryArchive dir> <profile_items.csv> <out csv>
"""
import csv, sys, os, re, collections

ARCH, PROF, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
prof = {r['id']: r for r in csv.DictReader(open(PROF, encoding='utf-8-sig'))}
N = 6
line_re = re.compile(r'^\[(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)\]\s*(.*)$')

def load(i):
    p = os.path.join(ARCH, 'transcripts', i + '.txt')
    words, times = [], []
    if not os.path.exists(p): return words, times
    for ln in open(p, encoding='utf-8'):
        m = line_re.match(ln.strip())
        if not m: continue
        t = int(m.group(1) or 0) * 3600 + int(m.group(2)) * 60 + float(m.group(3))
        for w in re.findall(r"[\w']+", m.group(4).lower()):
            words.append(w); times.append(t)
    return words, times

def shingles(words):
    return {' '.join(words[k:k + N]): k for k in range(len(words) - N + 1)}

eps = {i: d for i, d in prof.items() if d['episode_no']}
ep_sh, ep_t = {}, {}
for i in eps:
    w, t = load(i); ep_sh[i] = shingles(w); ep_t[i] = t
index = collections.defaultdict(set)
for i, s in ep_sh.items():
    for g in s: index[g].add(i)

rows = []
for i, d in prof.items():
    if d['episode_no'] or d['lang'] != 'en': continue
    w, _ = load(i); s = shingles(w)
    if len(s) < 20: continue
    cnt = collections.Counter()
    for g in s:
        for e in index.get(g, ()): cnt[e] += 1
    best = cnt.most_common(3)
    numbered = [e for e in eps if eps[e]['episode_no'] == d['trailing_no']] if d['trailing_no'] else []
    num_cont = max((cnt[e] / len(s) for e in numbered), default=None)
    start = ''
    if numbered:
        e = max(numbered, key=lambda e: cnt[e])
        hits = sorted(ep_sh[e][g] for g in s if g in ep_sh[e])
        if hits:
            k = hits[len(hits) // 10]  # robust-ish start
            start = round(ep_t[e][k]); end = round(ep_t[e][hits[-1]])
            start = f'{start}-{end}'
    rows.append({'id': i, 'folder': d['folder'].split('/')[-1], 'title': d['title'], 'trailing_no': d['trailing_no'],
                 'dur_min': d['dur_min'], 'n_shingles': len(s),
                 'numbered_ep_containment': '' if num_cont is None else round(num_cont, 2),
                 'numbered_ep_span_sec': start,
                 'best_ep': eps[best[0][0]]['title'] if best else '', 'best_containment': round(best[0][1] / len(s), 2) if best else 0,
                 'others': '; '.join(f"{eps[e]['title']}:{c / len(s):.2f}" for e, c in best[1:])})

with open(OUT, 'w', encoding='utf-8-sig', newline='') as f:
    wr = csv.DictWriter(f, fieldnames=list(rows[0].keys())); wr.writeheader(); wr.writerows(rows)

def grp(d):
    if 'UY Radio' in d['folder'] or prof[d['id']]['collection'].startswith('Uncle Yossi'): return 'radio-topical'
    if 'Heritage' in prof[d['id']]['folder']: return 'heritage'
    return 'stories/other'
for g in ('radio-topical', 'heritage', 'stories/other'):
    L = [r for r in rows if grp(r) == g]
    num = [r for r in L if r['trailing_no']]
    hit = [r for r in num if r['numbered_ep_containment'] != '' and r['numbered_ep_containment'] >= 0.5]
    best_is_num = [r for r in num if r['best_ep'] and r['best_ep'].split()[0] == r['trailing_no']]
    nomatch_any = [r for r in L if r['best_containment'] < 0.2]
    print(f'{g}: items {len(L)}, numbered {len(num)}, numbered-episode containment>=0.5: {len(hit)}, '
          f'best-matching episode == number: {len(best_is_num)}, no episode >=0.2: {len(nomatch_any)}')
    lo = [r for r in num if r not in hit]
    for r in lo[:40]:
        print('   low:', r['folder'][:22], '|', r['title'], '| num cont', r['numbered_ep_containment'], '| best', r['best_ep'], r['best_containment'], r['others'])
    un = [r for r in L if not r['trailing_no']]
    for r in un[:40]:
        print('   unnumbered:', r['folder'][:22], '|', r['title'], '| best', r['best_ep'], r['best_containment'])
print('wrote', OUT)
