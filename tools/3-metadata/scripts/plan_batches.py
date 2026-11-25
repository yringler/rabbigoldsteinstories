"""Draft batching plan for the metadata fill-in run.

Radio episodes are batched in episode-number order together with every clip / Heritage item whose
number (or best text match) points into that range, so one agent sees an episode and the clips cut
from it. Other items are batched by folder. Batches are capped by an estimated token budget.

Token estimate: English ~4 chars/token, Hebrew-script Yiddish ~2.5 chars/token (conservative).

Usage: python -I -X utf8 plan_batches.py <StoryArchive> <profile_items.csv> <clip_text_matches.csv> <out csv>
"""
import csv, sys, os, collections

ARCH, PROF, MATCH, OUT = sys.argv[1:5]
BUDGET = 70000      # transcript tokens per agent batch
MAX_ITEMS = 24
prof = list(csv.DictReader(open(PROF, encoding='utf-8-sig')))
match = {r['id']: r for r in csv.DictReader(open(MATCH, encoding='utf-8-sig'))}
tix = {r['id']: r for r in csv.DictReader(open(os.path.join(ARCH, 'transcripts_index.csv'), encoding='utf-8-sig'))}

def tokens(d):
    n = os.path.getsize(os.path.join(ARCH, tix[d['id']]['transcript_txt']))
    if d['lang'] == 'yi':
        return int(n / 2 / 2.5)  # utf-8 Hebrew letters are 2 bytes
    return int(n / 4)

def anchor(d):
    """episode number this item belongs with, or None"""
    if d['episode_no']: return int(d['episode_no'])
    if d['trailing_no'] and (d['collection'].startswith('Uncle Yossi') or 'Heritage' in d['folder']):
        return int(d['trailing_no'])
    m = match.get(d['id'])
    if m and m['best_ep'] and float(m['best_containment'] or 0) >= 0.5:
        return int(m['best_ep'].split()[0])
    return None

radio, other = [], collections.defaultdict(list)
for d in prof:
    a = anchor(d)
    if a is not None: radio.append((a, 0 if d['episode_no'] else 1, d))
    else: other[d['folder'] or '(Stories top level)'].append(d)
radio.sort(key=lambda x: (x[0], x[1], x[2]['title']))

batches = []
def pack(name, items):
    cur, tok = [], 0
    for d in items:
        t = tokens(d)
        if cur and (tok + t > BUDGET or len(cur) >= MAX_ITEMS):
            batches.append((name, cur, tok)); cur, tok = [], 0
        cur.append(d); tok += t
    if cur: batches.append((name, cur, tok))

# radio: never split an episode from its clips
groups = collections.OrderedDict()
for a, _, d in radio: groups.setdefault(a, []).append(d)
cur, tok = [], 0
for a, L in groups.items():
    t = sum(tokens(d) for d in L)
    if cur and (tok + t > BUDGET or len(cur) + len(L) > MAX_ITEMS):
        batches.append(('radio', cur, tok)); cur, tok = [], 0
    cur += L; tok += t
if cur: batches.append(('radio', cur, tok))
for f, L in sorted(other.items()):
    pack(f, sorted(L, key=lambda d: d['title']))

with open(OUT, 'w', encoding='utf-8-sig', newline='') as fh:
    w = csv.writer(fh); w.writerow(['batch', 'group', 'id', 'title', 'folder', 'est_tokens'])
    for i, (name, L, tok) in enumerate(batches, 1):
        for d in L: w.writerow([i, name, d['id'], d['title'], d['folder'], tokens(d)])
tot = sum(tokens(d) for d in prof)
print(f'items {len(prof)}, est transcript tokens {tot:,} (en {sum(tokens(d) for d in prof if d["lang"] != "yi"):,}, '
      f'yi {sum(tokens(d) for d in prof if d["lang"] == "yi"):,})')
print('batches', len(batches), '| radio', sum(1 for b in batches if b[0] == 'radio'), '| other', sum(1 for b in batches if b[0] != 'radio'))
print('items/batch median', sorted(len(b[1]) for b in batches)[len(batches) // 2], '| tokens/batch max', max(b[2] for b in batches))
big = [(tokens(d), d['title']) for d in prof if tokens(d) > 40000]
print('items > 40k tokens (chunk the segment pass):', sorted(big, reverse=True))
