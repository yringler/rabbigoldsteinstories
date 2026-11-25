"""Write vocab_compact.txt (ids + labels + glossary) from vocabularies.json, for pass-1 agents.

Usage: python -I -X utf8 scripts/make_vocab_compact.py
"""
import json, os
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
v = json.load(open(os.path.join(ROOT, 'vocabularies.json'), encoding='utf-8'))
L = [f"# Controlled vocabularies v{v['_meta']['version']} (generated from vocabularies.json; do not edit by hand)",
     '# Use ids exactly as written (left of "="). Nothing fits? Use the closest id AND add a proposed_new_terms entry. Never invent ids.',
     '# [UNCONFIRMED] = placeholder: allowed as an id, but add identity_guesses; never state a guess in public text. [DEPRECATED] = do not use.', '']

def mark(x):
    if x.get('deprecated'): return f" [DEPRECATED, use {x.get('use_instead')}]"
    if x.get('unconfirmed'): return ' [UNCONFIRMED]'
    return ''

def simple(name, extra=None, per_line=False, title=None):
    items = v[name]
    L.append(f'## {title or name}')
    parts = []
    for x in items:
        if isinstance(x, str): parts.append(x); continue
        s = f"{x['id']} = {x['label']}{mark(x)}"
        if extra:
            e = extra(x)
            if e: s += f' ({e})'
        parts.append(s)
    L.append('\n'.join(parts) if per_line else ' | '.join(parts))
    L.append('')

simple('content_type', lambda x: x.get('description', ''), per_line=True)
simple('story_type', per_line=False)
simple('segment_type')
simple('series', per_line=True)
simple('speakers', per_line=True)
simple('audience_level')
L.append('## content_advisory (severity: mild | moderate | strong)')
L.append('\n'.join(f"{x['id']} = {x['label']}" + (f" ({x['description']})" if x.get('description') else '') for x in v['content_advisory'])); L.append('')
simple('privacy_flag', lambda x: x.get('description', ''), per_line=True)
simple('quality_issue')
simple('relation_type', lambda x: x.get('description', ''), per_line=True)
L.append('## relation evidence: ' + ' | '.join(v['relation_evidence'])); L.append('')
L.append('## topics (child -> parent; tag the most specific)')
L.append(' | '.join(f"{x['id']} = {x['label']}" + (f" < {x['parent']}" if x.get('parent') else '') for x in v['topics'])); L.append('')
simple('midos', lambda x: '; '.join(x.get('aliases', [])) if isinstance(x.get('aliases'), list) else x.get('aliases', ''))
simple('mitzvos')
L.append('## calendar (id = label, when)')
L.append(' | '.join(f"{x['id']} = {x['label']}" + (f", {x['when']}" if x.get('when') else '') for x in v['calendar'])); L.append('')
L.append('## parshiyos'); L.append(' | '.join(f"{x['id']}" for x in v['parshiyos'])); L.append('')
L.append('## people (id = label [aliases]); roles: ' + ' | '.join(v['people_roles']))
for cat in v['people_categories']:
    L.append(f'# {cat}: ' + ' | '.join(f"{x['id']} = {x['label']}" + (f" [{'; '.join(x['aliases'])}]" if x.get('aliases') else '') + mark(x)
                                      for x in v['people'] if x['category'] == cat))
L.append('')
simple('works')
L.append('## study_units: ' + ' | '.join(v['study_units']))
L.append('## production_notes (locked, from filenames): ' + ' | '.join(v['production_notes'])); L.append('')
t = v['transliteration']
L.append('## Transliteration (Chabad/Ashkenazi)')
L.append(t['style']); L.append('Preferred: ' + ', '.join(t['preferred'])); L.append('Titles: ' + t['display_titles']); L.append('Yiddish titles: ' + t['yiddish_titles']); L.append('')
L.append('## ASR glossary (heard -> correct). Read the transcript with these in mind; never copy the ASR spelling into public fields.')
L.append('\n'.join(f"{'; '.join(g['heard'])} -> {g['correct']}" for g in v['asr_glossary']))
open(os.path.join(ROOT, 'vocab_compact.txt'), 'w', encoding='utf-8').write('\n'.join(L) + '\n')
print('wrote vocab_compact.txt', sum(len(x) for x in L), 'chars')
