"""Apply the pass-2 patch files to items/ and vocabularies.json (idempotent).

Usage: python -I -X utf8 scripts/apply_pass2.py [--base DIR] [--out DIR] [--dry-run]

  --base DIR  items to start from. Default: pass2/backup/items (the pass-1 snapshot taken before the merge),
              so a re-run always rebuilds the same result from the same inputs. --base items also works:
              every op is idempotent (set = same value; add_to_list / add_relation skip what is already
              there; remove_relation is a no-op when the relation is gone).
  --out DIR   where to write items (default items/). Vocabulary files are only written when --out is items/.
  --dry-run   apply in memory, report, write nothing.

Order: vocab_additions (vocabularies.json, then vocab_compact.txt regenerated with
scripts/make_vocab_compact.py, carrying over the hand-edited lines of the old compact file), then the patch
files vocab, versions_speakers, dates, serials, same_story, deliverables, then merge_fixes (pass2/merge_fixes.json,
small corrections made while merging, same patch format).

Patch format: {"task", "patches": [{item, op: set|add_to_list|add_relation|remove_relation, path, value,
match: {type, target_id|target}, reason}], ...}.

Conflict handling (all logged to pass2/apply_log.json):
  - two tasks setting the same path (or a path and its prefix) to different values: the later task in the
    order wins, unless the earlier one is listed in PRIORITY below;
  - add_relation vs remove_relation of the same (item, type, target) in different tasks: the removal wins
    (removals were made on transcript evidence);
  - relation duplicates (same type+target already present): kept as is, the new copy skipped;
  - after all patches: a pair linked both as the same recording (same_recording, alternate_take,
    superseded_by, clip_of, contains, aired_again_in) and as same_story(_other_language) loses the same_story
    links; superseded_by cycles and chains are reported; asymmetric same_story / same_recording links are
    completed; a remove_relation that would drop a facts-required relation is refused.
"""
import sys, os, json, glob, argparse, copy, difflib, datetime, shutil

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..'))
P2 = os.path.join(ROOT, 'pass2')
ORDER = ['vocab', 'versions_speakers', 'dates', 'serials', 'same_story', 'deliverables', 'merge_fixes']
SAME_REC = {'same_recording', 'alternate_take', 'superseded_by', 'clip_of', 'contains', 'aired_again_in'}
SAME_STORY = {'same_story', 'same_story_other_language'}
SYMMETRIC = {'same_recording', 'same_story', 'same_story_other_language', 'part_of_set'}

ap = argparse.ArgumentParser()
ap.add_argument('--base', default=os.path.join(P2, 'backup', 'items'))
ap.add_argument('--out', default=os.path.join(ROOT, 'items'))
ap.add_argument('--dry-run', action='store_true')
a = ap.parse_args()

LOG = {'run_at': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
       'base': os.path.relpath(a.base, ROOT), 'tasks': {}, 'conflicts': [], 'errors': [], 'post_checks': [],
       'vocab': {}}

def jl(p): return json.load(open(p, encoding='utf-8'))
def jd(o): return json.dumps(o, ensure_ascii=False, sort_keys=True)

# ---------------------------------------------------------------- vocabulary
vbase_path = os.path.join(P2, 'backup', 'vocabularies.json')
if not os.path.exists(vbase_path): vbase_path = os.path.join(ROOT, 'vocabularies.json')
vocab_old = jl(vbase_path)
vocab = copy.deepcopy(vocab_old)
added, skipped = [], []
vp = os.path.join(P2, 'vocab.json')
for section, entries in (jl(vp).get('vocab_additions') or {}).items():
    if section not in vocab: LOG['errors'].append(f'vocab_additions: unknown vocabulary {section}'); continue
    have = {(x['id'] if isinstance(x, dict) else x): x for x in vocab[section]}
    for e in entries:
        eid = e['id'] if isinstance(e, dict) else e
        if eid in have:
            if jd(have[eid]) != jd(e): LOG['conflicts'].append({'kind': 'vocab_id_exists', 'section': section, 'id': eid,
                                                                'resolution': 'kept the existing entry'})
            skipped.append(f'{section}:{eid}'); continue
        if section == 'people' and e.get('category') not in vocab['people_categories']:
            LOG['errors'].append(f'vocab_additions: people {eid} has unknown category {e.get("category")}'); continue
        vocab[section].append(e); added.append(f'{section}:{eid}')
if added and vocab['_meta'].get('version') == vocab_old['_meta'].get('version'):
    vocab['_meta']['version'] = '0.3'
    vocab['_meta']['changes'].append(f'0.3 (2026-11-25): pass-2 merge added {len(added)} entries (' +
        ', '.join(f'{s} {sum(1 for x in added if x.startswith(s + ":"))}' for s in dict.fromkeys(x.split(':')[0] for x in added)) +
        '); see pass2/vocab.json and PASS2_REPORT.md.')
LOG['vocab'] = {'added': added, 'already_present': skipped}

def gen_compact(v):
    """Run make_vocab_compact.py against vocabulary v in a scratch root; return its text."""
    import tempfile
    with tempfile.TemporaryDirectory() as td:
        os.makedirs(os.path.join(td, 'scripts'))
        json.dump(v, open(os.path.join(td, 'vocabularies.json'), 'w', encoding='utf-8'), ensure_ascii=False)
        src = open(os.path.join(HERE, 'make_vocab_compact.py'), encoding='utf-8').read()
        import io, contextlib
        with contextlib.redirect_stdout(io.StringIO()):
            exec(compile(src, 'make_vocab_compact.py', 'exec'), {'__file__': os.path.join(td, 'scripts', 'x.py'), '__name__': '__main__'})
        return open(os.path.join(td, 'vocab_compact.txt'), encoding='utf-8').read()

def key_of(line): return line.split(' = ')[0] if ' = ' in line else None

cbase_path = os.path.join(P2, 'backup', 'vocab_compact.txt')
if not os.path.exists(cbase_path): cbase_path = os.path.join(ROOT, 'vocab_compact.txt')
old_hand = open(cbase_path, encoding='utf-8').read().split('\n')
old_gen = gen_compact(vocab_old).split('\n')
new_gen = gen_compact(vocab).split('\n')
hand = {}   # key -> (generated line, hand line)
sm = difflib.SequenceMatcher(a=old_gen, b=old_hand, autojunk=False)
for tag, i1, i2, j1, j2 in sm.get_opcodes():
    if tag == 'equal': continue
    if tag == 'replace' and i2 - i1 == j2 - j1:
        for g, h in zip(old_gen[i1:i2], old_hand[j1:j2]):
            k = key_of(g)
            if k and key_of(h) == k: hand[k] = (g, h)
            else: LOG['errors'].append(f'vocab_compact: hand edit not carried over automatically: {h[:100]!r}')
    else:
        for h in old_hand[j1:j2]: LOG['errors'].append(f'vocab_compact: hand edit not carried over automatically: {h[:100]!r}')
carried = []
for n, line in enumerate(new_gen):
    k = key_of(line)
    if k in hand:
        g, h = hand[k]
        if line == g: new_gen[n] = h; carried.append(k)
        else: LOG['errors'].append(f'vocab_compact: entry {k} changed since its hand edit; regenerated line kept')
compact_text = '\n'.join(new_gen)
LOG['vocab']['compact_hand_edits_carried'] = carried

# ---------------------------------------------------------------- items
facts = {os.path.basename(p)[:-5]: jl(p) for p in glob.glob(os.path.join(ROOT, 'facts', '*.json'))}
items = {}
for p in glob.glob(os.path.join(a.base, '*.json')):
    items[os.path.basename(p)[:-5]] = jl(p)
orig = {k: jd(v) for k, v in items.items()}

def split(path): return [int(x) if x.isdigit() else x for x in path.split('.')]

def get_parent(obj, parts, create):
    for k in parts[:-1]:
        if isinstance(k, int):
            if not isinstance(obj, list) or k >= len(obj): raise KeyError(f'index {k} out of range')
            obj = obj[k]
        else:
            if not isinstance(obj, dict): raise KeyError(f'{k}: parent is not an object')
            if obj.get(k) is None:
                if not create: raise KeyError(f'{k} missing')
                obj[k] = {}
            obj = obj[k]
    return obj

def entry_key(v):
    if isinstance(v, dict):
        for k in ('id', 'flag'):
            if k in v: return (k, v[k])
    return ('value', jd(v))

def rel_target(m): return m.get('target_id', m.get('target'))

tasks = {}
for t in ORDER:
    p = os.path.join(P2, t + '.json')
    if os.path.exists(p): tasks[t] = jl(p)['patches']
    elif t != 'merge_fixes': LOG['errors'].append(f'patch file {t}.json missing')

# pre-scan for cross-task conflicts
setters = {}
for t, P in tasks.items():
    for p in P:
        if p['op'] in ('set', 'add_to_list'):
            setters.setdefault((p['item'], p['path']), []).append((t, p['op'], jd(p['value'])))
for (iid, path), v in setters.items():
    ts = {x[0] for x in v}
    sets = {x[2] for x in v if x[1] == 'set'}
    if len(ts) > 1 and (len(sets) > 1 or (sets and any(x[1] == 'add_to_list' for x in v))):
        LOG['conflicts'].append({'kind': 'same_path', 'item': iid, 'path': path, 'tasks': sorted(ts),
                                 'resolution': 'applied in task order; the later task wins'})
for t, P in tasks.items():
    for p in P:
        if p['op'] != 'set': continue
        for (iid, path), v in setters.items():
            if iid == p['item'] and path.startswith(p['path'] + '.') and any(x[0] != t for x in v):
                LOG['conflicts'].append({'kind': 'prefix_path', 'item': iid, 'path': p['path'], 'sub_path': path,
                                         'tasks': sorted({t} | {x[0] for x in v}), 'resolution': 'applied in task order'})
removed_keys = {}
for t, P in tasks.items():
    for p in P:
        if p['op'] == 'remove_relation':
            removed_keys[(p['item'], p['match']['type'], rel_target(p['match']))] = t
drop_adds = set()
for t, P in tasks.items():
    for p in P:
        if p['op'] == 'add_relation':
            k = (p['item'], p['value']['type'], p['value']['target_id'])
            if k in removed_keys and removed_keys[k] != t:
                drop_adds.add((t, k))
                LOG['conflicts'].append({'kind': 'add_vs_remove', 'relation': list(k), 'added_by': t, 'removed_by': removed_keys[k],
                                         'resolution': 'removal wins; add skipped'})

touched = {}
for t, P in tasks.items():
    st = LOG['tasks'][t] = {'patches': len(P), 'applied': 0, 'no_change': 0, 'skipped': 0, 'failed': 0, 'items': 0}
    tset = set()
    for n, p in enumerate(P):
        iid, op = p['item'], p['op']
        it = items.get(iid)
        if it is None: st['failed'] += 1; LOG['errors'].append(f'{t}#{n}: item {iid} not found'); continue
        before = jd(it)
        try:
            if op == 'set':
                parts = split(p['path'])
                par = get_parent(it, parts, create=True)
                last = parts[-1]
                if isinstance(last, int):
                    if last >= len(par): raise KeyError(f'index {last} out of range')
                par[last] = copy.deepcopy(p['value'])
            elif op == 'add_to_list':
                parts = split(p['path'])
                par = get_parent(it, parts, create=True)
                lst = par.get(parts[-1])
                if lst is None: lst = par[parts[-1]] = []
                k = entry_key(p['value'])
                same = [x for x in lst if entry_key(x) == k]
                if same:
                    if jd(same[0]) != jd(p['value']):
                        LOG['conflicts'].append({'kind': 'list_entry_differs', 'task': t, 'item': iid, 'path': p['path'],
                                                 'key': list(k), 'resolution': 'kept the existing entry'})
                else: lst.append(copy.deepcopy(p['value']))
            elif op == 'add_relation':
                v = p['value']
                if (t, (iid, v['type'], v['target_id'])) in drop_adds: st['skipped'] += 1; continue
                rels = it.setdefault('relations', [])
                if not any(r['type'] == v['type'] and r['target_id'] == v['target_id'] for r in rels):
                    rels.append(copy.deepcopy(v))
            elif op == 'remove_relation':
                m = p['match']; tgt = rel_target(m)
                req = facts.get(iid, {}).get('required_relations', [])
                if any(r['type'] == m['type'] and r['target_id'] == tgt for r in req):
                    st['skipped'] += 1
                    LOG['conflicts'].append({'kind': 'remove_required', 'task': t, 'item': iid, 'relation': [m['type'], tgt],
                                             'resolution': 'refused: relation is required by facts'})
                    continue
                it['relations'] = [r for r in it.get('relations', []) if not (r['type'] == m['type'] and r['target_id'] == tgt)]
            else:
                raise ValueError(f'unknown op {op}')
        except (KeyError, ValueError, TypeError, AttributeError) as e:
            st['failed'] += 1; LOG['errors'].append(f'{t}#{n} {iid} {op} {p.get("path", "")}: {e}'); continue
        if jd(it) != before:
            st['applied'] += 1; tset.add(iid); touched.setdefault(iid, set()).add(t)
        else: st['no_change'] += 1
    st['items'] = len(tset)

# ---------------------------------------------------------------- post checks on relations
def rels_of(i): return items[i].get('relations', [])
def has(i, typ, j): return any(r['type'] == typ and r['target_id'] == j for r in rels_of(i))

# 1. same recording AND same story -> drop the same-story links
for i in sorted(items):
    for r in list(rels_of(i)):
        if r['type'] in SAME_STORY:
            j = r['target_id']
            if j not in items: continue
            if any(x['type'] in SAME_REC and x['target_id'] == j for x in rels_of(i)) or \
               any(x['type'] in SAME_REC and x['target_id'] == i for x in rels_of(j)):
                items[i]['relations'] = [x for x in rels_of(i) if not (x['type'] in SAME_STORY and x['target_id'] == j)]
                items[j]['relations'] = [x for x in rels_of(j) if not (x['type'] in SAME_STORY and x['target_id'] == i)]
                touched.setdefault(i, set()).add('post_checks'); touched.setdefault(j, set()).add('post_checks')
                LOG['conflicts'].append({'kind': 'same_recording_and_same_story', 'pair': [i, j],
                                         'resolution': 'same-recording link kept; same_story links removed both ways'})
# 2. same_story and same_story_other_language on the same pair
for i in sorted(items):
    for j in {r['target_id'] for r in rels_of(i) if r['type'] == 'same_story'}:
        if has(i, 'same_story_other_language', j):
            li = (items[i].get('language') or {}).get('primary'); lj = (items.get(j, {}).get('language') or {}).get('primary')
            drop = 'same_story' if li != lj else 'same_story_other_language'
            for x, y in ((i, j), (j, i)):
                if x in items: items[x]['relations'] = [r for r in rels_of(x) if not (r['type'] == drop and r['target_id'] == y)]
            LOG['conflicts'].append({'kind': 'same_story_both_types', 'pair': [i, j], 'resolution': f'kept by language ({li}/{lj}); removed {drop}'})
# 3. symmetric relations: complete missing directions
for i in sorted(items):
    for r in list(rels_of(i)):
        if r['type'] in SYMMETRIC and r['target_id'] in items and not has(r['target_id'], r['type'], i):
            back = {k: v for k, v in r.items() if k != 'offset_sec'}; back['target_id'] = i
            items[r['target_id']].setdefault('relations', []).append(back)
            touched.setdefault(r['target_id'], set()).add('post_checks')
            LOG['post_checks'].append(f'added missing reverse {r["type"]} {r["target_id"]} -> {i}')
# 4. superseded_by cycles / chains / preferred copy that is itself superseded
sup = {i: [r['target_id'] for r in rels_of(i) if r['type'] == 'superseded_by'] for i in items}
for i, ts in sup.items():
    if len(ts) > 1: LOG['post_checks'].append(f'superseded_by: {i} points to more than one preferred copy {ts}')
    for j in ts:
        if i in sup.get(j, []): LOG['conflicts'].append({'kind': 'superseded_cycle', 'pair': sorted([i, j]), 'resolution': 'reported, not changed'})
        elif sup.get(j): LOG['post_checks'].append(f'superseded_by chain: {i} -> {j} -> {sup[j]}')
# 5. continues: one previous chapter per item; target exists
for i in items:
    c = [r['target_id'] for r in rels_of(i) if r['type'] == 'continues']
    if len(c) > 1: LOG['post_checks'].append(f'continues: {i} has {len(c)} previous parts {c}')

changed = sorted(i for i in items if jd(items[i]) != orig[i])
LOG['summary'] = {'items_changed_vs_base': len(changed), 'touched_by_task': {}}
for i, ts in touched.items():
    for t in ts: LOG['summary']['touched_by_task'][t] = LOG['summary']['touched_by_task'].get(t, 0) + 1

# ---------------------------------------------------------------- write
if not a.dry_run:
    os.makedirs(a.out, exist_ok=True)
    for i, it in items.items():
        p = os.path.join(a.out, i + '.json')
        # write only files whose content differs (house style: indent=1, platform newlines)
        if os.path.exists(p):
            try:
                if jl(p) == it: continue
            except json.JSONDecodeError: pass
        open(p, 'w', encoding='utf-8').write(json.dumps(it, ensure_ascii=False, indent=1) + '\n')
    if os.path.abspath(a.out) == os.path.abspath(os.path.join(ROOT, 'items')):
        if jl(os.path.join(ROOT, 'vocabularies.json')) != vocab:
            open(os.path.join(ROOT, 'vocabularies.json'), 'w', encoding='utf-8').write(json.dumps(vocab, ensure_ascii=False, indent=1))
        cp = os.path.join(ROOT, 'vocab_compact.txt')
        if open(cp, encoding='utf-8').read() != compact_text:
            open(cp, 'w', encoding='utf-8').write(compact_text)
    json.dump(LOG, open(os.path.join(P2, 'apply_log.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

print(f'vocab: +{len(added)} entries ({len(skipped)} already present); compact hand edits carried: {carried}')
for t, s in LOG['tasks'].items(): print(f'{t:18} {s}')
print(f'conflicts: {len(LOG["conflicts"])}  post-check notes: {len(LOG["post_checks"])}  errors: {len(LOG["errors"])}')
for c in LOG['conflicts'][:40]: print('  conflict', jd(c)[:220])
for c in LOG['post_checks'][:40]: print('  post', c[:220])
for e in LOG['errors'][:40]: print('  ERROR', e[:220])
print(f'items changed vs base: {len(changed)}' + (' (dry run, nothing written)' if a.dry_run else ''))
