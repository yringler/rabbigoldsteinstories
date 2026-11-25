"""Regenerate every pass-1 input after the archive changes (e.g. refreshed transcripts). Safe to rerun.

Steps: master catalog CSV (if missing) -> facts/ -> batches.json -> vocab_compact.txt -> validate examples and existing items.
Usage: python -I -X utf8 scripts/prepare_pass1.py
"""
import os, sys, subprocess, glob
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
PY = [sys.executable, '-I', '-X', 'utf8']
def run(*a):
    print('>', ' '.join(os.path.basename(x) for x in a)); r = subprocess.run(PY + list(a), cwd=ROOT)
    return r.returncode
if not os.path.exists(os.path.join(HERE, 'out', 'tzh_master_catalog.csv')):
    doc = os.path.join(ROOT, '..', 'StoryArchive', 'documents', 'Uncle Yossi - Tzivos Hashem Radio Program', 'Catalog etc', 'TZH Catalouge updated (1).docx')
    run(os.path.join(HERE, 'parse_tzh_catalog.py'), doc, os.path.join(HERE, 'out', 'tzh_catalog_raw.csv'), os.path.join(HERE, 'out', 'tzh_master_catalog.csv'))
assert run(os.path.join(HERE, 'pass0_facts.py')) == 0
assert run(os.path.join(HERE, 'make_batches.py')) == 0
assert run(os.path.join(HERE, 'make_vocab_compact.py')) == 0
run(os.path.join(HERE, 'validate_items.py'), '--file', os.path.join(ROOT, 'examples.json'))
done = [os.path.basename(p)[:-5] for p in glob.glob(os.path.join(ROOT, 'items', '*.json'))]
if done: run(os.path.join(HERE, 'validate_items.py'), *done)
