"""List a batch's items with status, so an agent knows what is left to do.

Usage: python -I -X utf8 scripts/batch_items.py <batch_id>
Status: DONE = items/<id>.json exists and validates; INVALID = exists but fails validation; TODO = missing.
"""
import sys, os, json, subprocess
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
B = {b['batch_id']: b for b in json.load(open(os.path.join(ROOT, 'batches.json'), encoding='utf-8'))}
if len(sys.argv) < 2 or sys.argv[1] not in B: sys.exit(f'usage: batch_items.py <batch_id>; known: {min(B)}..{max(B)}')
b = B[sys.argv[1]]
print(f"batch {b['batch_id']} kind={b['kind']} items={len(b['item_ids'])} est_transcript_tokens={b['est_transcript_tokens']:,}")
for i in b['item_ids']:
    f = json.load(open(os.path.join(ROOT, 'facts', i + '.json'), encoding='utf-8'))
    s = f['locked']['source']; h = f['hints']['transcript']
    p = os.path.join(ROOT, 'items', i + '.json')
    if not os.path.exists(p): st = 'TODO'
    else:
        r = subprocess.run([sys.executable, '-I', '-X', 'utf8', os.path.join(ROOT, 'scripts', 'validate_items.py'), i], capture_output=True, text=True, encoding='utf-8')
        st = 'DONE' if r.returncode == 0 else 'INVALID'
    print(f"{st:8s} {i}  {h['language']}  {h['duration_min']:6.1f} min  ~{h['est_tokens']:>6,} tok  {s['folder'][-34:]:34s} | {s['filename_title']}")
