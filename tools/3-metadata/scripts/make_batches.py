"""Write batches.json from facts/ (run after pass0_facts.py).

Rules: radio episodes in number order, each packed together with every item whose clip_of points at it
(or, failing that, whose filename number is that episode); other items grouped by folder, keeping
connected items (part sets, takes, same recordings, excerpts) in one batch. hg1a-size items get a batch of
their own with kind 'long_single' (chunked reading, see PASS1_INSTRUCTIONS.md).
Caps: MAX_TOKENS transcript tokens and MAX_ITEMS items per batch.

Usage: python -I -X utf8 scripts/make_batches.py [facts dir] [out batches.json]
"""
import json, os, sys, glob, collections

HERE = os.path.dirname(os.path.abspath(__file__))
FACTS = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '..', 'facts')
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(HERE, '..', 'batches.json')
MAX_TOKENS, HARD_MAX, MAX_ITEMS, LONG = 50000, 60000, 22, 40000

F = {}
for fn in glob.glob(os.path.join(FACTS, '*.json')):
    f = json.load(open(fn, encoding='utf-8')); F[f['id']] = f
tok = {i: f['hints']['transcript']['est_tokens'] for i, f in F.items()}
src = {i: f['locked']['source'] for i, f in F.items()}
ep_no = {i: s['filename_facts']['episode_number'] for i, s in src.items() if s['filename_facts']['episode_number']}

# radio groups
group_of = {}
for i, f in F.items():
    if i in ep_no: continue
    co = [r['target_id'] for r in f['required_relations'] if r['type'] == 'clip_of' and r['target_id'] in ep_no]
    if co: group_of[i] = co[0]; continue
    n = src[i]['filename_facts']['trailing_number']
    if n:
        cands = [e for e, k in ep_no.items() if k == n]
        if cands: group_of[i] = sorted(cands)[0]; continue
    hint = [r['target_id'] for r in F[i]['hints'].get('candidate_relations', []) if r['type'] == 'clip_of' and r['target_id'] in ep_no]
    if hint: group_of[i] = hint[0]
radio_groups = collections.defaultdict(list)
for e in ep_no: radio_groups[e].append(e)
for i, e in group_of.items(): radio_groups[e].append(i)

# other items: union-find over links
others = [i for i in F if i not in ep_no and i not in group_of]
parent = {i: i for i in others}
def find(x):
    while parent[x] != x: parent[x] = parent[parent[x]]; x = parent[x]
    return x
def union(a, b):
    if a in parent and b in parent: parent[find(a)] = find(b)
for i in others:
    f = F[i]
    links = [r['target_id'] for r in f['required_relations']]
    links += [s['id'] for s in f['hints'].get('same_title_in_folder', [])]
    links += [s['id'] for s in f['hints'].get('part_candidates', {}).get('siblings', [])]
    links += [r['target_id'] for r in f['hints'].get('candidate_relations', []) if r['type'] in ('clip_of', 'same_story')]
    for j in links: union(i, j)
units = collections.defaultdict(list)
for i in others: units[find(i)].append(i)

batches = []
def emit(kind, ids):
    batches.append({'batch_id': f'b{len(batches) + 1:03d}', 'kind': kind, 'item_ids': ids,
                    'est_transcript_tokens': sum(tok[i] for i in ids)})

def pack(kind, unit_list):
    cur = []
    for u in unit_list:
        t = sum(tok[i] for i in u)
        if cur and (sum(tok[i] for i in cur) + t > MAX_TOKENS or len(cur) + len(u) > MAX_ITEMS):
            emit(kind, cur); cur = []
        cur = cur + u
    if cur: emit(kind, cur)

# radio: episode order; within a group the episode first, then clips by start time
def clip_start(i):
    for r in F[i]['required_relations']:
        if r['type'] == 'clip_of': return r.get('offset_sec', 0)
    return 9e9
radio_units = []
for e in sorted(radio_groups, key=lambda e: (ep_no[e], src[e]['filename_title'])):
    radio_units.append([e] + sorted([i for i in radio_groups[e] if i != e], key=clip_start))
pack('radio', radio_units)

# others: very long items get a batch of their own; oversize units are split (relations are pre-computed anyway)
for i in sorted(others):
    if tok[i] > LONG: emit('long_single', [i])
rest = []
for u in units.values():
    u = [i for i in u if tok[i] <= LONG]
    if not u: continue
    if sum(tok[i] for i in u) <= HARD_MAX: rest.append(u); continue
    u = sorted(u, key=lambda i: src[i]['filename_title'].lower()); cur = []
    for i in u:
        if cur and sum(tok[j] for j in cur) + tok[i] > MAX_TOKENS: rest.append(cur); cur = []
        cur.append(i)
    if cur: rest.append(cur)
by_folder = collections.defaultdict(list)
for u in rest:
    folder = min(src[i]['folder'] for i in u)
    by_folder[folder].append(sorted(u, key=lambda i: src[i]['filename_title'].lower()))
for folder in sorted(by_folder):
    us = sorted(by_folder[folder], key=lambda u: src[u[0]]['filename_title'].lower())
    pack('stories', us)

# label batches by majority transcript language
for b in batches:
    if b['kind'] == 'stories':
        yi = sum(1 for i in b['item_ids'] if F[i]['locked']['language']['transcript_language'] == 'yi')
        if yi * 2 > len(b['item_ids']): b['kind'] = 'yiddish'

all_ids = [i for b in batches for i in b['item_ids']]
assert len(all_ids) == len(set(all_ids)) == len(F), (len(all_ids), len(set(all_ids)), len(F))
json.dump(batches, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
k = collections.Counter(b['kind'] for b in batches)
print(f'{len(batches)} batches {dict(k)}; items {len(all_ids)}; transcript tokens {sum(tok.values()):,} '
      f'(en {sum(t for i, t in tok.items() if F[i]["locked"]["language"]["transcript_language"] == "en"):,}, '
      f'yi {sum(t for i, t in tok.items() if F[i]["locked"]["language"]["transcript_language"] == "yi"):,}); '
      f'max/batch {max(b["est_transcript_tokens"] for b in batches):,}; items/batch max {max(len(b["item_ids"]) for b in batches)}; '
      f'oversize units {[b["batch_id"] for b in batches if b["est_transcript_tokens"] > HARD_MAX and b["kind"] != "long_single"]}')
print('long_single:', [(b['batch_id'], src[b['item_ids'][0]]['filename_title'], b['est_transcript_tokens']) for b in batches if b['kind'] == 'long_single'])
