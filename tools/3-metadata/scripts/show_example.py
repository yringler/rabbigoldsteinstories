"""Print one worked example from examples.json.  Usage: python -I -X utf8 scripts/show_example.py <id>"""
import sys, os, json
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
D = json.load(open(os.path.join(ROOT, 'examples.json'), encoding='utf-8'))
for it in D['items']:
    if it['id'] == sys.argv[1]: print(json.dumps(it, ensure_ascii=False, indent=1)); break
else: sys.exit('ids: ' + ', '.join(f"{x['id']} ({x['source']['filename_title']})" for x in D['items']))
