"""Pass 0: write facts/<id>.json for every converted item (deterministic, cheap to rerun).

Reads at run time (so a transcript refresh is picked up by just rerunning):
  StoryArchive/catalog.csv, transcripts_index.csv, transcripts/<id>.txt + .json, probable_duplicates.csv
  _metadata/scripts/out/tzh_master_catalog.csv (from parse_tzh_catalog.py)

facts/<id>.json = {
  "id", "facts_version", "generated_at",
  "locked":  partial item document; every leaf here must appear unchanged in items/<id>.json,
  "required_relations": relations that must appear verbatim in items/<id>.json (the agent may add more),
  "hints":   non-binding help for the agent (master-catalog row, date estimate, clip spans, candidates...)
}
Usage: python -I -X utf8 scripts/pass0_facts.py [--archive ../StoryArchive] [--out facts]
"""
import csv, json, os, re, sys, argparse, collections, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '_vendor'))
from pyluach import dates as hdates

ap = argparse.ArgumentParser()
ap.add_argument('--archive', default=os.path.join(HERE, '..', '..', 'StoryArchive'))
ap.add_argument('--out', default=os.path.join(HERE, '..', 'facts'))
ap.add_argument('--catalog-csv', default=os.path.join(HERE, 'out', 'tzh_master_catalog.csv'))
args = ap.parse_args()
ARCH, OUT = os.path.abspath(args.archive), os.path.abspath(args.out)
os.makedirs(OUT, exist_ok=True)
SCHEMA_VERSION = '0.3'
RADIO = 'Uncle Yossi - Tzivos Hashem Radio Program'
EPDIR = 'UY Radio program Tzivos Hashem on the Air - missing 42-112'

cat = [r for r in csv.DictReader(open(os.path.join(ARCH, 'catalog.csv'), encoding='utf-8-sig')) if r['status'] == 'converted']
tix = {r['id']: r for r in csv.DictReader(open(os.path.join(ARCH, 'transcripts_index.csv'), encoding='utf-8-sig'))}
pairs = list(csv.DictReader(open(os.path.join(ARCH, 'probable_duplicates.csv'), encoding='utf-8-sig')))
mcat = {int(r['episode']): r for r in csv.DictReader(open(args.catalog_csv, encoding='utf-8-sig'))}
byid = {r['id']: r for r in cat}
missing_tx = [r['id'] for r in cat if r['id'] not in tix]
if missing_tx: sys.exit(f'transcripts_index.csv lacks {len(missing_tx)} converted ids, e.g. {missing_tx[:3]}')

# ---------- filename parsing ----------
re_date = re.compile(r'(?<!\d)(\d{1,2})[-./](\d{1,2})[-./](\d{2,4})(?!\d)')
re_dur = re.compile(r'(\d+)\s*m\s*(\d+)\s*s\b|\b\d+\s*min\b', re.I)
WORDNUM = {'one': 1, 'two': 2, 'three': 3, 'four': 4}

def heb(g):
    h = hdates.GregorianDate(g.year, g.month, g.day).to_heb()
    return f'{h.day} {h.month_name()} {h.year}', h.year

def parse_date(t):
    m = re_date.search(t)
    if not m: return None, t
    mo, dy, yr = int(m.group(1)), int(m.group(2)), int(m.group(3))
    if not (1 <= mo <= 12 and 1 <= dy <= 31): return None, t
    yr = yr + (1900 if yr > 50 else 2000) if yr < 100 else yr
    return datetime.date(yr, mo, dy), (t[:m.start()] + t[m.end():]).strip()

def production_notes(title, orig, folder):
    t = title.lower(); o = os.path.basename(orig).lower(); n = []
    if re.search(r'\bredo\b', t): n.append('redo')
    if folder.endswith(EPDIR) and re.search(r'\bnew\b', t): n.append('new')
    if 'bad recording' in t: n.append('bad_recording')
    if 'unedited' in t: n.append('unedited')
    if 'needs splicing' in t: n.append('needs_splicing')
    if 'needs editing' in t: n.append('needs_editing')
    if re.search(r'(\bgood$|-good$|\bgood [a-c]$|\d good$)', t): n.append('good')
    if re.search(r'\bfinal\b', t): n.append('final')
    if 'double' in t: n.append('double')
    if re.search(r'\(\d+\)', o) or re.search(r'\bcopy\b', o): n.append('copy')
    if re_dur.search(o) or re_dur.search(t): n.append('duration_label')
    return n

PART_PATS = [(r'(?i)[\s\-_]*\bpart\s*(\d+|one|two|three|four)\b.*$', 'explicit'), (r'(?i)\s*-\s*(\d)\s*$', 'explicit'),
             (r'\s+0?(\d)\s*$', 'ambiguous'), (r'(?i)[\s.]+([abc])\s*$', 'ambiguous')]

def split_part(t):
    for p, kind in PART_PATS:
        m = re.search(p, t)
        if m:
            v = m.group(1).lower()
            num = WORDNUM[v] if v in WORDNUM else (int(v) if v.isdigit() else ' abc'.index(v))
            return t[:m.start()].strip(' .-_'), kind, num, m.group(0).strip(' -_')
    return t, None, None, None

def norm(s):
    s = s.lower().replace('secratary', 'secretary').replace('agunah', 'aguna')
    s = re.sub(r"[^\w֐-׿]+", ' ', s)
    return re.sub(r'\s+', ' ', s).strip()

def slug(s):
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-') or 'set'

def collections_for(r):
    c, f = r['collection'], r['folder']
    if c == RADIO:
        return ['Radio episodes'] if f.endswith(EPDIR) else [f]
    if not f: return ['Stories']
    if f.startswith('Uncle Yossi - Heritage Series 2'): return ['Heritage Series 2']
    if f.startswith('אידיש'):
        sub = {'אידיש/Pesach/הגדה - אידיש': ['Pesach Haggadah (Yiddish)'], 'אידיש/R Yosef Goldstein - Tanya Yiddish': ['Tanya (Yiddish)'],
               'אידיש/Sefiras Haomer - Kids': ['Sefiras HaOmer - Kids'], 'אידיש/Yiddish stories': ['Yiddish stories'],
               'אידיש/Yiddish stories/Bubby Chaya Malka etc': ['Yiddish stories', 'Bubby Chaya Malka']}.get(f, [])
        return ['Yiddish'] + sub
    return [f]

def locked_series(r):
    c, f, t = r['collection'], r['folder'], r['title_guess']
    if f.startswith('Uncle Yossi - Heritage Series 2') and t.lower().startswith('shema beni'): return 'shema_beni'
    if c == RADIO or f.startswith('Uncle Yossi - Heritage Series 2'): return 'uy_tzivos_hashem_on_the_air'
    return {'אידיש/R Yosef Goldstein - Tanya Yiddish': 'tanya_yiddish_goldstein', 'אידיש/Pesach/הגדה - אידיש': 'haggadah_yiddish',
            'Simchas Beis Hashoeva 5786': 'simchas_beis_hashoeva_5786'}.get(f)

# ---------- per-item parse ----------
P = {}
for r in cat:
    t = r['title_guess'].strip()
    d = {'r': r, 'title': t, 'episode_no': None, 'date': None, 'trailing_no': None, 'part': None}
    tt = re_dur.sub('', t).strip()
    dt, tt2 = parse_date(tt)
    if r['collection'] == RADIO and r['folder'].endswith(EPDIR):
        m = re.match(r'\s*(\d{1,3})\b', tt)
        if m: d['episode_no'] = int(m.group(1)); d['date'] = dt
    elif r['collection'] == RADIO or r['folder'].startswith('Uncle Yossi - Heritage Series 2'):
        m = re.search(r'[\s_\-]+(\d{2,3}|\d)\s*$', re.sub(r'\(\d+\)\s*$', '', tt).strip())
        if m and not t.lower().startswith('shema beni'): d['trailing_no'] = int(m.group(1))
    else:
        base, kind, num, marker = split_part(tt)
        if kind: d['part'] = {'base': norm(base), 'kind': kind, 'num': num, 'marker': marker}
    P[r['id']] = d

def tx_paths(i):
    x = tix[i]
    return os.path.join(ARCH, x['transcript_txt']), os.path.join(ARCH, x['transcript_json'])

line_re = re.compile(r'^\[(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)\]\s*(.*)$')
def load_words(i):
    words, times = [], []
    p = tx_paths(i)[0]
    if not os.path.exists(p): return words, times
    for ln in open(p, encoding='utf-8'):
        m = line_re.match(ln.strip())
        if not m: continue
        ts = int(m.group(1) or 0) * 3600 + int(m.group(2)) * 60 + float(m.group(3))
        for w in re.findall(r"[\w']+", m.group(4).lower()):
            words.append(w); times.append(ts)
    return words, times

def speech_end(i):
    p = tx_paths(i)[1]
    try:
        segs = json.load(open(p, encoding='utf-8'))['segments']
        return round(max((s['end'] for s in segs), default=0), 1)
    except Exception:
        return None

# ---------- text matching: every English non-episode item vs every English radio episode ----------
N = 6
eps = {i: d for i, d in P.items() if d['episode_no']}
ep_sh, ep_t = {}, {}
for i in eps:
    if tix[i]['language'] != 'en': continue
    w, t = load_words(i)
    ep_sh[i] = {' '.join(w[k:k + N]): k for k in range(len(w) - N + 1)}; ep_t[i] = t
index = collections.defaultdict(set)
for i, s in ep_sh.items():
    for g in s: index[g].add(i)
match = {}
for i, d in P.items():
    if d['episode_no'] or tix[i]['language'] != 'en': continue
    w, wt = load_words(i)
    sh = {}
    for k in range(len(w) - N + 1): sh.setdefault(' '.join(w[k:k + N]), wt[k])
    if len(sh) < 20: continue
    clip_dur = float(byid[i]['duration_sec'])
    cnt = collections.Counter()
    for g in sh:
        for e in index.get(g, ()): cnt[e] += 1
    res = []
    for e, c in cnt.most_common(8):
        cont = c / len(sh)
        if cont < 0.2: break
        # alignment: median of (episode time - clip time) over shared 6-grams = where the clip starts in the episode
        offs = sorted(ep_t[e][ep_sh[e][g]] - ct for g, ct in sh.items() if g in ep_sh[e])
        start = max(0.0, offs[len(offs) // 2])
        res.append({'episode_id': e, 'episode_no': eps[e]['episode_no'], 'containment': round(cont, 2),
                    'start_sec': round(start), 'end_sec': round(start + clip_dur)})
    match[i] = res

# ---------- relations ----------
REL = collections.defaultdict(dict)       # id -> {(type,target): relation}
HINT_REL = collections.defaultdict(list)
def add(i, typ, tgt, ev, conf, offset=None, note=None, hint=False):
    rel = {'type': typ, 'target_id': tgt, 'evidence': ev, 'confidence': round(min(conf, 0.99), 2)}
    if offset is not None: rel['offset_sec'] = offset
    if note: rel['note'] = note[:200]
    if hint: HINT_REL[i].append(rel); return
    REL[i].setdefault((typ, tgt), rel)

def title(i): return P[i]['title']
ep_by_no = collections.defaultdict(list)
for i, d in eps.items(): ep_by_no[d['episode_no']].append(i)

clip_spans = collections.defaultdict(list)  # episode id -> clips
for i, d in P.items():
    radio_like = d['r']['collection'] == RADIO or d['r']['folder'].startswith('Uncle Yossi - Heritage Series 2')
    if d['episode_no'] or not radio_like or i not in match: continue
    M = match[i]
    src = None
    if d['trailing_no'] is not None:
        cand = [m for m in M if m['episode_no'] == d['trailing_no'] and m['containment'] >= 0.5]
        if cand:
            src = max(cand, key=lambda m: m['containment'])
            note = f"Episode {d['trailing_no']} (filename number); clip = {src['start_sec']}-{src['end_sec']} s of the episode."
        elif M and M[0]['containment'] >= 0.5:
            add(i, 'clip_of', M[0]['episode_id'], 'text_overlap', M[0]['containment'], M[0]['start_sec'],
                f"Filename says episode {d['trailing_no']} but the text matches episode {M[0]['episode_no']} (rerun or mislabel).", hint=True)
    elif M and M[0]['containment'] >= 0.8:
        src = M[0]; note = f"Episode {src['episode_no']} (text match; no number in filename)."
    if src:
        add(i, 'clip_of', src['episode_id'], 'text_overlap', src['containment'], src['start_sec'], note)
        clip_spans[src['episode_id']].append({'id': i, 'title': title(i), 'folder': d['r']['folder'], 'start_sec': src['start_sec'], 'end_sec': src['end_sec']})
        add(src['episode_id'], 'contains', i, 'text_overlap', src['containment'], None, f"'{title(i)}' = {src['start_sec']}-{src['end_sec']} s of this episode.")
        for m in M:
            if m['episode_id'] != src['episode_id'] and m['containment'] >= 0.8:
                add(i, 'aired_again_in', m['episode_id'], 'text_overlap', m['containment'], None, f"Also aired in episode {m['episode_no']}.")

def kind(i):
    d = P[i]
    if d['episode_no']: return 'episode'
    if d['r']['collection'] == RADIO or d['r']['folder'].startswith('Uncle Yossi - Heritage Series 2'): return 'radio_clip'
    return 'other'

for p in pairs:
    a, b = p['id_a'], p['id_b']
    if a not in P or b not in P: continue
    rel = p['relation']
    da, db = float(p['duration_a_sec']), float(p['duration_b_sec'])
    conf = min(float(p['coverage_a'] or 0), float(p['coverage_b'] or 0))
    if rel.startswith('same recording'):
        nt = 'Same recording, different length/edit/transfer (audio fingerprint).'
        add(a, 'same_recording', b, 'audio_fingerprint', max(conf, 0.9), None, nt); add(b, 'same_recording', a, 'audio_fingerprint', max(conf, 0.9), None, nt)
    elif rel.startswith('shorter is contained'):
        s, l = (a, b) if da <= db else (b, a)
        ks, kl = kind(s), kind(l)
        cov = max(float(p['coverage_a'] or 0), float(p['coverage_b'] or 0))
        if ks == 'radio_clip' and kl == 'episode':
            has_src = any(t == 'clip_of' for t, _ in REL[s])
            if ('clip_of', l) not in REL[s]:
                add(s, 'aired_again_in', l, 'audio_fingerprint', cov, None, f"Audio also found in episode {P[l]['episode_no']}.", hint=not has_src)
        elif ks == 'other' or kl == 'other' or (ks == 'radio_clip' and kl == 'radio_clip') or (ks == kl == 'episode'):
            if ks == kl == 'other':
                add(s, 'clip_of', l, 'audio_fingerprint', cov, None, f"Excerpt of '{title(l)}' (audio fingerprint).")
                add(l, 'contains', s, 'audio_fingerprint', cov, None, f"Contains '{title(s)}' (audio fingerprint).")
            else:
                add(s, 'clip_of', l, 'audio_fingerprint', cov, None, f"Audio contained in '{title(l)}'; check.", hint=True)
    else:
        typ = 'same_story' if rel.startswith('same title') else 'aired_again_in'
        add(a, typ, b, 'audio_fingerprint', 0.5, None, f"Candidate ({rel}) with '{title(b)}'.", hint=True)
        add(b, typ, a, 'audio_fingerprint', 0.5, None, f"Candidate ({rel}) with '{title(a)}'.", hint=True)

# part sets (outside the radio series)
sets = collections.defaultdict(list)
for i, d in P.items():
    if d['part']: sets[(d['r']['folder'], d['part']['base'])].append(i)
part_locked, part_hint = {}, {}
for (folder, base), ids in sets.items():
    if len(ids) < 2: continue
    nums = [P[i]['part']['num'] for i in ids]
    explicit = all(P[i]['part']['kind'] == 'explicit' for i in ids) or \
        (any(P[i]['part']['kind'] == 'explicit' for i in ids) and all(isinstance(n, int) and n > 0 for n in nums))
    key = slug(base)
    unique = len(set(nums)) == len(nums)
    for i in ids:
        sib = [j for j in ids if j != i]
        if explicit and unique:
            of = len(ids) if sorted(nums) == list(range(1, len(ids) + 1)) else None
            part_locked[i] = {'set_key': key, 'part_number': P[i]['part']['num'], 'of': of}
            for j in sib: add(i, 'part_of_set', j, 'filename', 0.95, None, f"Part {P[j]['part']['num']}: '{title(j)}'.")
        else:
            part_hint[i] = {'set_key': key, 'this_marker': P[i]['part']['marker'], 'siblings': [{'id': j, 'title': title(j)} for j in sib],
                            'note': 'Ambiguous marker (could be part, night, take or version). Decide from the content; set classification.part and part_of_set only if they really are consecutive parts.'}

# identical normalized titles in the same folder without markers -> take/version candidates
same_title = collections.defaultdict(list)
for i, d in P.items():
    if not d['episode_no'] and d['r']['collection'] != RADIO: same_title[(d['r']['folder'], norm(d['title']))].append(i)

# ---------- dates for radio ----------
dated = sorted((d['episode_no'], d['date']) for d in eps.values() if d['date'])
def date_estimate(n):
    prev = [x for x in dated if x[0] <= n]; nxt = [x for x in dated if x[0] >= n]
    est = None
    if prev and n - prev[-1][0] <= 60:
        est = prev[-1][1] + datetime.timedelta(weeks=n - prev[-1][0])
    elif nxt and nxt[0][0] - n <= 60:
        est = nxt[0][1] - datetime.timedelta(weeks=nxt[0][0] - n)
    out = {'prev_dated_episode': {'episode': prev[-1][0], 'date': prev[-1][1].isoformat()} if prev else None,
           'next_dated_episode': {'episode': nxt[0][0], 'date': nxt[0][1].isoformat()} if nxt else None}
    if est:
        h, _ = heb(est)
        out['weekly_estimate'] = {'date': est.isoformat(), 'hebrew': h,
                                  'note': 'Assumes one show a week with no breaks: confirm or correct from cues in the audio (Hebrew date said, holiday, parsha, candle time).'}
    return out

# ---------- write ----------
now = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
counts = collections.Counter()
for i, d in P.items():
    r, x = d['r'], tix[i]
    lang = x['language']
    flags = [f.strip() for f in (x.get('flags') or '').split(';') if f.strip()]
    notes = [f.strip() for f in (r.get('notes') or '').split(';') if f.strip()]
    defective = any(f.startswith('defective_source') for f in flags)
    n_ep = d['episode_no'] or d['trailing_no']
    mrow = mcat.get(n_ep) if n_ep and kind(i) != 'other' else None
    src = {
        'collection': r['collection'], 'folder': r['folder'], 'filename_title': d['title'], 'audio_path': r['out_path'],
        'duration_sec': round(float(r['duration_sec']), 3),
        'filename_facts': {'episode_number': d['episode_no'], 'date_in_filename': d['date'].isoformat() if d['date'] else None,
                           'trailing_number': d['trailing_no'], 'part_marker': d['part']['marker'] if d['part'] else None,
                           'production_notes': production_notes(d['title'], r['original_path'], r['folder'])},
        'master_catalog': ({'episode': n_ep, 'story': mrow['story'], 'topic': mrow['topic'], 'has_visitor_names': bool(mrow['visitors'].strip())}
                           if mrow else ({'episode': n_ep, 'story': '', 'topic': '', 'has_visitor_names': False} if n_ep and kind(i) != 'other' else None)),
        'pipeline_flags': flags + notes,
    }
    locked = {'id': i, 'schema_version': SCHEMA_VERSION, 'source': src,
              'display': {'transcript_display': 'none' if defective else ('show_with_label' if lang == 'en' else 'search_only')},
              'classification': {'collections': collections_for(r)},
              'language': {'transcript_language': lang}}
    ser = locked_series(r)
    if ser: locked['classification']['series'] = ser
    if d['episode_no']: locked['classification']['episode'] = {'number': d['episode_no'], 'is_clip': False}
    elif d['trailing_no'] and kind(i) == 'radio_clip': locked['classification']['episode'] = {'number': d['trailing_no'], 'is_clip': True}
    if d['date']:
        h, hy = heb(d['date'])
        locked['classification']['date'] = {'gregorian': d['date'].isoformat(), 'hebrew': h, 'hebrew_year': hy, 'precision': 'day', 'basis': 'filename'}
    if i in part_locked: locked['classification']['part'] = part_locked[i]
    if defective: locked['quality'] = {'publish_recommendation': 'hide'}

    se = speech_end(i)
    dur = float(r['duration_sec'])
    hints = {'transcript': {'txt': x['transcript_txt'], 'language': lang, 'model': x.get('model', ''), 'words': int(x['words'] or 0),
                            'duration_min': round(dur / 60, 1), 'speech_end_sec': se,
                            'est_tokens': int(os.path.getsize(tx_paths(i)[0]) / (5.0 if lang == 'yi' else 4.0))}}
    notes_h = []
    if se is not None and dur - se > 90:
        notes_h.append(f'Speech ends at {se:.0f} s but the file is {dur:.0f} s long: set quality.trim.content_end_sec (unless the rest is music worth keeping) and add issue trailing_silence.')
    if defective: notes_h.append('Defective source (looped clip): fill minimal metadata from the filename/catalog; publish_recommendation is locked to hide.')
    if any('little_speech' in f for f in flags) or (int(x['words'] or 0) / max(dur / 60, 0.1) < 40):
        notes_h.append('Very little speech: probably a song or music. content_type song (DECISIONS 5: listed, not featured) unless the content says otherwise.')
    if any('language guessed' in n or 'mixed Hebrew/Latin' in n for n in notes):
        notes_h.append('Language was guessed from the filename; trust transcripts_index (already re-checked). Set language.spoken from what you read.')
    hints['notes'] = notes_h
    if mrow is not None or (n_ep and kind(i) != 'other'):
        rows = {k: mcat.get(n_ep + k) for k in (-1, 0, 1)}
        hints['master_catalog'] = {
            'episode': n_ep,
            'rows': {str(n_ep + k): ({'story': v['story'], 'topic': v['topic']} if v else None) for k, v in rows.items()},
            'visitors_PRIVATE': (rows[0]['visitors'] if rows[0] else '') or None,
            'note': 'Row N = episode N (verified). Story "#n" = serial chapter. visitors_PRIVATE may only be used to spell names in hidden.on_air_people.'}
        hints['date'] = date_estimate(n_ep)
    if kind(i) == 'other':
        sug = None
        if r['folder'].startswith('אידיש/Yiddish stories/Bubby') or 'bubby' in d['title'].lower() or 'zaidy' in d['title'].lower():
            sug = 'bubby_zaidy_stories'
        elif r['folder'] == 'Farbrengen-Power audio': sug = 'farbrengen_power'
        elif r['folder'] == 'Maaseh Rav': sug = 'maaseh_rav'
        hints['series_suggestion'] = sug or 'decide from content: weekly_story_i_believe if it opens with the song "I believe in Hashem, I trust in Hashem" or is clearly the same narrator; otherwise null'
    if i in match and match[i]: hints['text_matches_in_episodes'] = match[i][:5]
    if i in clip_spans: hints['clips_cut_from_this_episode'] = sorted(clip_spans[i], key=lambda c: c['start_sec'])
    if i in part_hint: hints['part_candidates'] = part_hint[i]
    st = [j for j in same_title.get((r['folder'], norm(d['title'])), []) if j != i]
    if st: hints['same_title_in_folder'] = [{'id': j, 'title': title(j), 'duration_min': round(float(P[j]['r']['duration_sec']) / 60, 1)} for j in st]
    if HINT_REL[i]: hints['candidate_relations'] = HINT_REL[i]
    if r['folder'].startswith('Uncle Yossi - Heritage Series 2/'):
        hints['heritage_group'] = r['folder'].split('/', 1)[1]

    facts = {'id': i, 'facts_version': 1, 'generated_at': now, 'locked': locked,
             'required_relations': sorted(REL[i].values(), key=lambda x: (x['type'], x['target_id'])), 'hints': hints}
    json.dump(facts, open(os.path.join(OUT, i + '.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    counts['items'] += 1
    for rel in REL[i].values(): counts['rel:' + rel['type']] += 1
    if 'part' in locked['classification']: counts['locked part'] += 1
    if 'series' in locked['classification']: counts['locked series'] += 1
    if 'date' in locked['classification']: counts['locked date'] += 1
    if any('Speech ends' in n for n in notes_h): counts['trailing silence hint'] += 1
    if i in part_hint: counts['ambiguous part hint'] += 1
print(dict(sorted(counts.items())))
print('wrote', OUT)
