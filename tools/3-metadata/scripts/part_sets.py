"""Detect part-1/part-2 style sibling sets and same-title groups outside the radio-episode folder.

Usage: python -I -X utf8 part_sets.py <profile_items.csv>
"""
import csv, sys, re, collections

P = list(csv.DictReader(open(sys.argv[1], encoding='utf-8-sig')))
RADIO = 'Uncle Yossi - Tzivos Hashem Radio Program'

def split(title, folder, collection):
    t = title.strip()
    marker = ''
    pats = [
        (r'(?i)[\s\-_]*\bpart\s*(\d+|one|two|three)\b.*$', 'partN'),
        (r'(?i)\s*-\s*(\d)\s*$', '-N'),
        (r'\s+0?(\d)\s*$', 'trailing digit'),
        (r'(?i)[\s.]+([abc])\s*$', 'letter'),
        (r'(?i)\s+(\d)\s*-\s*(\d)\s*$', 'N-M range'),
    ]
    for p, name in pats:
        m = re.search(p, t)
        if m:
            return t[:m.start()].strip(' .-_'), name, m.group(1)
    m = re.match(r'^(\d{1,2})[.\s]+(.*)$', t)
    if m and collection != RADIO and 'Tanya' not in folder:
        return m.group(2), 'leading ordinal', m.group(1)
    return t, '', ''

def norm(s):
    s = s.lower().replace('secratary', 'secretary').replace('agunah', 'aguna')
    s = re.sub(r"[^\w֐-׿]+", ' ', s)
    return re.sub(r'\s+', ' ', s).strip()

groups = collections.defaultdict(list)
for d in P:
    if d['collection'] == RADIO: continue
    if 'Tanya' in d['folder'] or 'Heritage' in d['folder']: continue
    base, kind, n = split(d['title'], d['folder'], d['collection'])
    groups[(d['folder'], norm(base))].append((kind, n, d['title'], d['dur_min']))

sets = {k: v for k, v in groups.items() if len(v) > 1}
with_marker = {k: v for k, v in sets.items() if any(x[0] for x in v)}
print('non-radio, non-Tanya, non-Heritage items:', sum(len(v) for v in groups.values()))
print('groups with >1 item (same folder + base title):', len(sets), 'items', sum(len(v) for v in sets.values()))
print('  of which have part/letter/number markers:', len(with_marker), 'items', sum(len(v) for v in with_marker.values()))
print('  identical-title groups without markers (likely duplicates/versions):', len(sets) - len(with_marker))
kinds = collections.Counter(x[0] for v in sets.values() for x in v)
print('marker styles:', dict(kinds))
for k, v in sorted(sets.items()):
    print(f'  [{k[0][-28:]}] {k[1]!r}:', ' | '.join(f'{t} ({m}m)' for _, _, t, m in v))
# incomplete sets: part 2 without part 1 etc
print('\nlone markers (a part N with no sibling):')
for k, v in groups.items():
    if len(v) == 1 and v[0][0] in ('partN', '-N', 'letter') :
        print('  ', k[0][-28:], '|', v[0][2])
