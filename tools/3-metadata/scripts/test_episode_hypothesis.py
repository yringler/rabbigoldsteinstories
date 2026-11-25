"""Test: trailing number on radio topical clips == radio episode they were cut from.

Usage: python -I -X utf8 test_episode_hypothesis.py <StoryArchive dir> <profile_items.csv>
Uses probable_duplicates.csv pairs whose relation says one is contained in / overlaps the other.
"""
import csv, sys, os, collections

ARCH, PROF = sys.argv[1], sys.argv[2]
prof = {r['id']: r for r in csv.DictReader(open(PROF, encoding='utf-8-sig'))}
pairs = list(csv.DictReader(open(os.path.join(ARCH, 'probable_duplicates.csv'), encoding='utf-8-sig')))
print('pairs', len(pairs), collections.Counter(p['relation'] for p in pairs))
print('found_by', collections.Counter(p['found_by'] for p in pairs))

EP = 'UY Radio program'
def kind(d):
    if EP in d['folder']: return 'episode'
    if d['collection'].startswith('Uncle Yossi'): return 'radio-topical'
    if 'Heritage' in d['folder']: return 'heritage'
    if 'אידיש' in d['folder']: return 'yiddish'
    if 'Story Videos' in d['folder']: return 'storyvideo'
    return 'stories'

kp = collections.Counter()
res = collections.Counter(); bad = []
clip_eps = collections.defaultdict(set)
for p in pairs:
    a, b = prof.get(p['id_a']), prof.get(p['id_b'])
    if not a or not b: continue
    ka, kb = kind(a), kind(b)
    kp[(p['relation'], tuple(sorted((ka, kb))))] += 1
    # clip vs episode
    if {ka, kb} >= {'episode'} and ka != kb:
        ep, clip = (a, b) if ka == 'episode' else (b, a)
        num = clip['trailing_no']
        if not num: res['clip has no number'] += 1; continue
        clip_eps[clip['id']].add(ep['episode_no'])
        ok = num == ep['episode_no']
        res[(p['relation'], 'match' if ok else 'MISMATCH')] += 1
        if not ok: bad.append((p['relation'], clip['folder'].split('/')[-1], clip['title'], '->', ep['title'], p['coverage_a'], p['coverage_b']))

print('\nrelation x kinds:')
for k, v in sorted(kp.items(), key=lambda x: -x[1]): print(f'  {v:4d} {k}')
print('\nclip-vs-episode pairs:')
for k, v in sorted(res.items(), key=str): print(f'  {v:4d} {k}')
print('\nmismatches:')
for x in bad: print('  ', x)

# coverage: how many numbered topical clips have at least one contained-in match to some episode
topical = [d for d in prof.values() if kind(d) == 'radio-topical']
num = [d for d in topical if d['trailing_no']]
matched = [d for d in num if d['trailing_no'] in clip_eps.get(d['id'], set())]
print(f'\nnumbered topical clips: {len(num)}; confirmed by audio match to the same-numbered episode: {len(matched)}')
print('clips matched to some episode at all:', sum(1 for d in topical if d['id'] in clip_eps))
# heritage / stories with numbers
for k in ('heritage', 'stories', 'storyvideo'):
    L = [d for d in prof.values() if kind(d) == k and d['trailing_no']]
    m = [d for d in L if d['id'] in clip_eps]
    print(f'{k}: {len(L)} with trailing number, {len(m)} audio-matched to an episode:',
          [(d['title'], sorted(clip_eps[d['id']])) for d in m][:30])
# show the other direction: unmatched numbered clips, are their episodes present?
eps_present = {d['episode_no'] for d in prof.values() if d['episode_no']}
um = [d for d in num if d['id'] not in clip_eps]
print('unmatched numbered topical clips', len(um), 'whose episode number exists in archive', sum(1 for d in um if d['trailing_no'] in eps_present))
print('  samples:', [(d['folder'].split('/')[-1], d['title'], d['dur_min']) for d in um[:25]])
