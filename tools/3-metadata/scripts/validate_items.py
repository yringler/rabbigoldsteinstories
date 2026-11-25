"""Validate pass-1 item files.

Usage: python -I -X utf8 scripts/validate_items.py <id | batch_id | all> [...] [--items DIR] [--file PATH]
  ids are catalog ids (10 hex chars); batch ids come from batches.json (e.g. b012); 'all' = every facts file.
  --file PATH validates one JSON file (an item, a list of items, or {"items": [...]}) instead of items/<id>.json.
Checks: JSON Schema, vocabulary ids (incl. deprecated/unconfirmed rules), locked facts unchanged, required relations
present verbatim, relation targets exist, segment/hidden times inside the file, privacy flags <-> hidden block,
hidden names not leaking into public text. Prints one line per error; exit code 1 if any.
"""
import sys, os, json, glob, argparse
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..'))
sys.path.insert(0, os.path.join(HERE, '_vendor'))
from jsonschema import Draft202012Validator, FormatChecker

ap = argparse.ArgumentParser()
ap.add_argument('targets', nargs='*')
ap.add_argument('--items', default=os.path.join(ROOT, 'items'))
ap.add_argument('--facts', default=os.path.join(ROOT, 'facts'))
ap.add_argument('--file')
a = ap.parse_args()

schema = json.load(open(os.path.join(ROOT, 'metadata.schema.json'), encoding='utf-8'))
vocab = json.load(open(os.path.join(ROOT, 'vocabularies.json'), encoding='utf-8'))
V, DEPRECATED, UNCONFIRMED = {}, set(), set()
for k, v in vocab.items():
    if not isinstance(v, list) or k == 'asr_glossary': continue
    V[k] = set()
    for x in v:
        xid = x['id'] if isinstance(x, dict) else x
        V[k].add(xid)
        if isinstance(x, dict) and x.get('deprecated'): DEPRECATED.add((k, xid))
        if isinstance(x, dict) and x.get('unconfirmed'): UNCONFIRMED.add(xid)
facts_ids = {os.path.basename(p)[:-5] for p in glob.glob(os.path.join(a.facts, '*.json'))}
validator = Draft202012Validator(schema, format_checker=FormatChecker())
CHECKS = [
    ('source.filename_facts.production_notes.*', 'production_notes'),
    ('classification.content_type', 'content_type'), ('classification.story_type.*', 'story_type'),
    ('classification.series', 'series'), ('classification.speakers.*', 'speakers'),
    ('classification.study_text.*.work', 'works'), ('classification.study_text.*.unit', 'study_units'),
    ('audience.level', 'audience_level'), ('audience.advisories.*.flag', 'content_advisory'), ('audience.privacy.*.flag', 'privacy_flag'),
    ('subjects.people.*.id', 'people'), ('subjects.topics.*', 'topics'), ('subjects.midos.*', 'midos'), ('subjects.mitzvos.*', 'mitzvos'),
    ('subjects.calendar.*', 'calendar'), ('subjects.parshiyos.*', 'parshiyos'), ('subjects.sources_cited.*.work', 'works'),
    ('segments.*.type', 'segment_type'), ('segments.*.people.*', 'people'), ('segments.*.calendar.*', 'calendar'),
    ('relations.*.type', 'relation_type'), ('quality.issues.*', 'quality_issue'),
]

def walk(obj, parts):
    if not parts: yield obj; return
    p, rest = parts[0], parts[1:]
    if p == '*':
        if isinstance(obj, list):
            for x in obj: yield from walk(x, rest)
    elif isinstance(obj, dict) and obj.get(p) is not None:
        yield from walk(obj[p], rest)

def locked_diffs(lock, item, path=''):
    for k, v in lock.items():
        p = f'{path}.{k}' if path else k
        if isinstance(v, dict):
            if not isinstance(item, dict) or not isinstance(item.get(k), dict):
                yield f'{p} missing'; continue
            yield from locked_diffs(v, item[k], p)
        elif not isinstance(item, dict) or k not in item:
            yield f'{p} missing (locked value {json.dumps(v, ensure_ascii=False)[:80]})'
        elif item[k] != v:
            yield f'{p} = {json.dumps(item[k], ensure_ascii=False)[:80]} but locked value is {json.dumps(v, ensure_ascii=False)[:80]}'

def public_text(it):
    d = it.get('display', {})
    parts = [d.get('title', ''), d.get('summary_short', ''), d.get('summary_long', ''), d.get('lesson') or '']
    parts += d.get('keywords', []) + it.get('subjects', {}).get('characters', [])
    parts += [s.get('title', '') + ' ' + s.get('summary', '') for s in it.get('segments', [])]
    parts += [x.get('note', '') for x in it.get('audience', {}).get('advisories', [])]
    return ' \n '.join(parts).lower()

def check(it, facts):
    E = []
    iid = it.get('id', '?')
    for e in sorted(validator.iter_errors(it), key=lambda e: list(e.path)):
        E.append(f'schema /{"/".join(map(str, e.path))}: {e.message[:160]}')
    for path, vname in CHECKS:
        for val in walk(it, path.split('.')):
            if isinstance(val, str):
                if val not in V[vname]: E.append(f'vocab: {path} = {val!r} is not an id in {vname} (use the closest id + proposed_new_terms)')
                elif (vname, val) in DEPRECATED: E.append(f'vocab: {path} = {val!r} is deprecated')
    if facts is None:
        E.append('no facts file'); return E
    E += [f'locked: {d}' for d in locked_diffs(facts['locked'], it)]
    rels = it.get('relations', [])
    for r in facts['required_relations']:
        if r not in rels: E.append(f'required relation missing or altered: {r["type"]} -> {r["target_id"]} (copy it verbatim from facts)')
    seen = set()
    for r in rels:
        key = (r.get('type'), r.get('target_id'))
        if key in seen: E.append(f'duplicate relation {key}')
        seen.add(key)
        if r.get('target_id') not in facts_ids: E.append(f'relation target {r.get("target_id")} is not a catalog id')
        if r.get('target_id') == iid: E.append('relation points to itself')
    dur = facts['locked']['source']['duration_sec']
    segs = it.get('segments', [])
    for k, s in enumerate(segs):
        st, en = s.get('start_sec', 0), s.get('end_sec')
        if st > dur: E.append(f'segment "{s.get("title")}" starts after end of file ({st} > {dur:.0f})')
        if en is not None and (en < st or en > dur + 1): E.append(f'segment "{s.get("title")}" bad end_sec {en}')
        if k and st < segs[k - 1].get('start_sec', 0): E.append(f'segments not sorted by start_sec at "{s.get("title")}"')
        for t in s.get('linked_items', []):
            if t not in facts_ids: E.append(f'linked_items: {t} is not a catalog id')
    h = it.get('hidden', {})
    for kind in ('on_air_people', 'addresses', 'other_personal'):
        for x in h.get(kind, []):
            if x.get('start_sec', 0) > dur + 1 or (x.get('end_sec') or 0) > dur + 1: E.append(f'hidden.{kind}: time outside the file')
    tr = (it.get('quality') or {}).get('trim')
    if tr:
        for k in ('content_start_sec', 'content_end_sec'):
            if k in tr and tr[k] > dur + 1: E.append(f'quality.trim.{k} beyond end of file')
    flags = {p.get('flag') for p in it.get('audience', {}).get('privacy', [])}
    if 'minor_named' in flags and not h.get('on_air_people'): E.append('privacy minor_named but hidden.on_air_people is empty')
    if 'home_address' in flags and not h.get('addresses'): E.append('privacy home_address but hidden.addresses is empty')
    if 'phone_number' in flags and not any(x.get('kind') == 'phone_number' for x in h.get('other_personal', [])): E.append('privacy phone_number but no hidden.other_personal phone_number')
    if h.get('addresses') and 'home_address' not in flags: E.append('hidden.addresses filled but no home_address privacy flag')
    if h.get('on_air_people') and not flags & {'minor_named', 'health_info', 'private_family', 'identifiable_living_people'}:
        E.append('hidden.on_air_people filled but no matching privacy flag (minor_named / health_info / private_family)')
    pub = public_text(it)
    for x in h.get('on_air_people', []):
        nm = (x.get('name') or '').strip().lower()
        if len(nm.split()) >= 2 and nm in pub: E.append(f'hidden name "{x.get("name")}" appears in a public field')
    for x in h.get('addresses', []):
        if (x.get('text') or '').strip().lower()[:12] and (x.get('text') or '').strip().lower() in pub: E.append('hidden address appears in a public field')
    used = set(it.get('classification', {}).get('speakers', [])) | {it.get('classification', {}).get('series')}
    guessed = {g.get('placeholder_id') for g in it.get('identity_guesses', [])}
    for u in used & UNCONFIRMED:
        if u not in guessed: E.append(f'unconfirmed placeholder {u} used but no identity_guesses entry for it')
    for g in guessed - UNCONFIRMED: E.append(f'identity_guesses.placeholder_id {g!r} is not an unconfirmed vocabulary entry')
    return E

# resolve targets
items = []   # (id, item or None)
if a.file:
    data = json.load(open(a.file, encoding='utf-8'))
    lst = data['items'] if isinstance(data, dict) and 'items' in data else (data if isinstance(data, list) else [data])
    items = [(x.get('id'), x) for x in lst]
else:
    ids = []
    batches = None
    for t in a.targets:
        if t == 'all': ids += sorted(facts_ids)
        elif len(t) == 10 and all(c in '0123456789abcdef' for c in t): ids.append(t)
        else:
            if batches is None: batches = {b['batch_id']: b for b in json.load(open(os.path.join(ROOT, 'batches.json'), encoding='utf-8'))}
            if t not in batches: print(f'unknown target {t}'); sys.exit(2)
            ids += batches[t]['item_ids']
    for i in ids:
        p = os.path.join(a.items, i + '.json')
        if not os.path.exists(p): items.append((i, None)); continue
        try: items.append((i, json.load(open(p, encoding='utf-8'))))
        except json.JSONDecodeError as e: items.append((i, {'__bad_json__': str(e)}))
if not items: print('nothing to validate'); sys.exit(2)
bad = 0
for i, it in items:
    if it is None: print(f'{i}: items/{i}.json does not exist'); bad += 1; continue
    if '__bad_json__' in it: print(f'{i}: invalid JSON: {it["__bad_json__"]}'); bad += 1; continue
    fp = os.path.join(a.facts, f'{i}.json')
    facts = json.load(open(fp, encoding='utf-8')) if os.path.exists(fp) else None
    errs = check(it, facts)
    if it.get('id') != i and not a.file: errs.append(f'id field is {it.get("id")!r}')
    for e in errs: print(f'{i}: {e}')
    bad += bool(errs)
print(f'{len(items)} checked, {len(items) - bad} valid, {bad} with errors')
sys.exit(1 if bad else 0)
