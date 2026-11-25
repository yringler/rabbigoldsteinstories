"""Profile filenames/folders of the StoryArchive catalog.

Usage: python -I -X utf8 profile_filenames.py <StoryArchive dir> <out dir>
Writes profile_items.csv (one row per converted item with parsed facts) and prints a summary.
Read-only on the archive.
"""
import csv, re, sys, os, collections, json

ARCH, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)

rows = list(csv.DictReader(open(os.path.join(ARCH, 'catalog.csv'), encoding='utf-8-sig')))
tix = {r['id']: r for r in csv.DictReader(open(os.path.join(ARCH, 'transcripts_index.csv'), encoding='utf-8-sig'))}
conv = [r for r in rows if r['status'] == 'converted']
print('catalog rows', len(rows), collections.Counter(r['status'] for r in rows))

RADIO = 'Uncle Yossi - Tzivos Hashem Radio Program'
EPDIR = 'UY Radio program Tzivos Hashem on the Air - missing 42-112'

re_date = re.compile(r'(?<!\d)(\d{1,2})[-./](\d{1,2})[-./](\d{2,4})(?!\d)')
re_trailnum = re.compile(r'[\s_\-]+(\d{1,3})\s*$')
re_part = re.compile(r'(?i)(?:\bpart|\bpt\.?|\bchelek|חלק)\s*(\d+|one|two|three|i{1,3}|[א-ת])\b|(?<![\w])(\d)\s*(?:of)\s*(\d)')
re_dur = re.compile(r'(\d+)\s*m\s*(\d+)\s*s', re.I)
re_copy = re.compile(r'\((\d+)\)\s*$|\bcopy\b', re.I)
re_hebrew = re.compile(r'[֐-׿]')

def stem(r):
    return r['title_guess'].strip()

def parse(r):
    t = stem(r)
    d = {'id': r['id'], 'collection': r['collection'], 'folder': r['folder'], 'title': t,
         'dur_min': round(float(r['duration_sec'] or 0) / 60, 1),
         'lang': tix.get(r['id'], {}).get('language', ''), 'words': tix.get(r['id'], {}).get('words', '')}
    tt = t
    m = re_dur.search(tt)
    d['dur_in_name'] = f"{m.group(1)}m{m.group(2)}s" if m else ''
    if m: tt = (tt[:m.start()] + tt[m.end():]).strip()
    m = re_date.search(tt)
    d['date'] = ''
    if m:
        mo, dy, yr = int(m.group(1)), int(m.group(2)), m.group(3)
        if 1 <= mo <= 12 and 1 <= dy <= 31:
            yr = int(yr); yr = yr + (1900 if yr > 50 else 2000) if yr < 100 else yr
            d['date'] = f'{yr:04d}-{mo:02d}-{dy:02d}'
            tt = (tt[:m.start()] + tt[m.end():]).strip()
    m = re_part.search(tt)
    d['part'] = (m.group(1) or m.group(2) or '') if m else ''
    d['copy_marker'] = '1' if re_copy.search(tt) else ''
    d['episode_no'] = ''
    d['trailing_no'] = ''
    if r['folder'].endswith(EPDIR):
        m = re.match(r'\s*(\d{1,3})\b', tt)
        d['episode_no'] = m.group(1) if m else ''
        d['ep_title_rest'] = tt[m.end():].strip() if m else tt
    else:
        d['ep_title_rest'] = ''
        m = re_trailnum.search(re.sub(r'\(\d+\)\s*$', '', tt).strip())
        if m and not d['part']:
            d['trailing_no'] = m.group(1)
        elif m and d['part'] and m.group(1) != d['part']:
            d['trailing_no'] = m.group(1)
    d['has_hebrew_script'] = '1' if re_hebrew.search(t) else ''
    # normalized base title for cross-folder matching
    b = t.lower()
    b = re_dur.sub('', b); b = re_date.sub('', b)
    b = re.sub(r'\(\d+\)', '', b)
    b = re.sub(r'(?i)\bpart\s*\d+\b', '', b)
    b = re.sub(r'[\s_\-]+\d{1,3}\s*$', '', b)
    b = re.sub(r"[^\w֐-׿]+", ' ', b).strip()
    d['base'] = b
    return d

items = [parse(r) for r in conv]
by_folder = collections.defaultdict(list)
for d in items: by_folder[(d['collection'], d['folder'])].append(d)

print('\n== per folder: n, with trailing number, with date, with part, with mNs, hebrew-script titles')
for k in sorted(by_folder):
    L = by_folder[k]
    print(f"{len(L):4d} tn={sum(1 for d in L if d['trailing_no']):3d} ep={sum(1 for d in L if d['episode_no']):3d} "
          f"date={sum(1 for d in L if d['date']):3d} part={sum(1 for d in L if d['part']):3d} "
          f"dur={sum(1 for d in L if d['dur_in_name']):2d} heb={sum(1 for d in L if d['has_hebrew_script']):2d} | {k[1]}")

# Radio episodes
eps = [d for d in items if d['episode_no']]
nums = collections.Counter(int(d['episode_no']) for d in eps)
print('\n== Radio episodes:', len(eps), 'distinct numbers', len(nums), 'range', min(nums), max(nums))
print('   duplicated numbers:', {k: v for k, v in nums.items() if v > 1})
missing = [n for n in range(1, max(nums) + 1) if n not in nums]
def ranges(xs):
    out = []; s = p = None
    for x in xs:
        if s is None: s = p = x
        elif x == p + 1: p = x
        else: out.append((s, p)); s = p = x
    if s is not None: out.append((s, p))
    return ', '.join(f'{a}-{b}' if a != b else str(a) for a, b in out)
print('   missing numbers:', len(missing), ranges(missing))
noep = [d['title'] for d in items if d['folder'].endswith(EPDIR) and not d['episode_no']]
print('   episode-folder items without leading number:', len(noep), noep[:20])
dated = [d for d in eps if d['date']]
print('   with date:', len(dated))
# date vs number monotonic check
dd = sorted((int(d['episode_no']), d['date']) for d in dated)
viol = [(a, b) for a, b in zip(dd, dd[1:]) if b[1] < a[1]]
print('   date order violations (num ascending, date descending):', len(viol), viol[:10])
print('   sample dated:', dd[:5], dd[-5:])
yrs = collections.Counter(d['date'][:4] for d in dated); print('   years', sorted(yrs.items()))
rest = collections.Counter(bool(d['ep_title_rest']) for d in eps); print('   eps with extra text after number', rest)
print('   extra-text samples:', [d['title'] for d in eps if d['ep_title_rest']][:25])
durs = sorted(d['dur_min'] for d in eps); print('   duration min/median/max', durs[0], durs[len(durs)//2], durs[-1])
print('   short (<20 min):', [(d['title'], d['dur_min']) for d in eps if d['dur_min'] < 20][:20])
print('   long (>35 min):', [(d['title'], d['dur_min']) for d in eps if d['dur_min'] > 35][:20])

# Topical radio folders
topical = [d for d in items if d['collection'] == RADIO and not d['folder'].endswith(EPDIR)]
print('\n== Radio topical items', len(topical), 'with trailing number', sum(1 for d in topical if d['trailing_no']))
tn = [int(d['trailing_no']) for d in topical if d['trailing_no']]
print('   trailing number range', min(tn), max(tn), 'n>max episode no', sum(1 for x in tn if x > max(nums)),
      'number is an existing episode', sum(1 for x in tn if x in nums), 'missing episode', sum(1 for x in tn if x not in nums))
print('   samples without number:', [d['title'] for d in topical if not d['trailing_no']][:40])
c = collections.Counter(tn); print('   most shared clip numbers:', c.most_common(15))

# Part sets
print('\n== part markers:', sum(1 for d in items if d['part']))
for d in items:
    if d['part']: print('   ', d['folder'][-40:], '|', d['title'])

# Cross-folder duplicate titles
bases = collections.defaultdict(list)
for d in items:
    if d['base']: bases[d['base']].append(d)
multi = {b: L for b, L in bases.items() if len(L) > 1}
cross = {b: L for b, L in multi.items() if len({x['folder'] for x in L}) > 1}
print('\n== normalized titles shared by >1 item:', len(multi), 'covering', sum(len(L) for L in multi.values()),
      'items; across folders:', len(cross))
for b, L in sorted(cross.items())[:60]:
    print('   ', b, '|', ' ; '.join(f"{x['folder'].split('/')[-1][:25]}:{x['title']}" for x in L))

# Heritage series
print('\n== Heritage / mNs names:')
for d in items:
    if 'Heritage' in d['folder'] or d['dur_in_name']:
        print('   ', d['folder'].split('Heritage Series 2')[-1] or '/', '|', d['title'], d['dur_min'])

with open(os.path.join(OUT, 'profile_items.csv'), 'w', encoding='utf-8-sig', newline='') as f:
    w = csv.DictWriter(f, fieldnames=list(items[0].keys())); w.writeheader(); w.writerows(items)
print('\nwrote', os.path.join(OUT, 'profile_items.csv'))
