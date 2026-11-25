"""SUPERSEDED by validate_items.py (schema v0.2, facts checks). Kept for the v0.1 proposal.
Validate item metadata against metadata.schema.json AND vocabularies.json.

Usage: python -I -X utf8 validate.py <schema.json> <vocabularies.json> <items.json | dir of <id>.json> [catalog.csv]
items.json may be a list of items or {"items": [...]}. Exit code 1 on any error.
"""
import sys, os, json, csv
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '_vendor'))
from jsonschema import Draft202012Validator, FormatChecker

schema = json.load(open(sys.argv[1], encoding='utf-8'))
vocab = json.load(open(sys.argv[2], encoding='utf-8'))
src = sys.argv[3]
cat_ids = None
if len(sys.argv) > 4:
    cat_ids = {r['id'] for r in csv.DictReader(open(sys.argv[4], encoding='utf-8-sig'))}

def ids(name):
    v = vocab[name]
    return {x['id'] if isinstance(x, dict) else x for x in v}
V = {k: ids(k) for k, v in vocab.items() if isinstance(v, list) and k not in ('asr_glossary',)}

if os.path.isdir(src):
    items = [json.load(open(os.path.join(src, f), encoding='utf-8')) for f in sorted(os.listdir(src)) if f.endswith('.json')]
else:
    data = json.load(open(src, encoding='utf-8'))
    items = data['items'] if isinstance(data, dict) else data

validator = Draft202012Validator(schema, format_checker=FormatChecker())
CHECKS = [  # (path, vocabulary); '*' = every list element
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
    if not parts:
        yield obj; return
    p, rest = parts[0], parts[1:]
    if p == '*':
        if isinstance(obj, list):
            for x in obj: yield from walk(x, rest)
    elif isinstance(obj, dict) and p in obj and obj[p] is not None:
        yield from walk(obj[p], rest)

errors = 0
seen = set()
for it in items:
    iid = it.get('id', '?')
    if iid in seen: print(f'{iid}: duplicate id'); errors += 1
    seen.add(iid)
    for e in sorted(validator.iter_errors(it), key=lambda e: list(e.path)):
        print(f'{iid}: schema: /{"/".join(map(str, e.path))}: {e.message[:200]}'); errors += 1
    for path, vname in CHECKS:
        for val in walk(it, path.split('.')):
            if isinstance(val, str) and val not in V[vname]:
                print(f'{iid}: vocab: {path} = {val!r} not in {vname}'); errors += 1
    if cat_ids is not None:
        for t in [iid] + [r.get('target_id') for r in it.get('relations', [])] + \
                 [x for s in it.get('segments', []) for x in s.get('linked_items', [])]:
            if t not in cat_ids: print(f'{iid}: unknown catalog id {t}'); errors += 1
    for s in it.get('segments', []):
        if 'end_sec' in s and s['end_sec'] < s['start_sec']:
            print(f'{iid}: segment ends before it starts: {s["title"]}'); errors += 1
        if s['start_sec'] > it['source']['duration_sec']:
            print(f'{iid}: segment starts after end of file: {s["title"]}'); errors += 1
print(f'{len(items)} items checked, {errors} errors')
sys.exit(1 if errors else 0)
