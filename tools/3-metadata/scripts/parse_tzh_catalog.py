"""Parse the 'TZH Catalouge updated' master tape catalog (docx table) into CSV.

Usage: python -I -X utf8 parse_tzh_catalog.py <docx> <out csv>
"""
import zipfile, re, sys, csv, html

z = zipfile.ZipFile(sys.argv[1])
x = z.read('word/document.xml').decode('utf8')

def text(fragment):
    parts = []
    for p in re.findall(r'<w:p[ >].*?</w:p>', fragment, re.S):
        t = ''.join(re.findall(r'<w:t(?: [^>]*)?>(.*?)</w:t>', p, re.S))
        if t.strip(): parts.append(html.unescape(t).strip())
    return ' / '.join(parts)

rows = []
for tbl in re.findall(r'<w:tbl>.*?</w:tbl>', x, re.S):
    for tr in re.findall(r'<w:tr[ >].*?</w:tr>', tbl, re.S):
        cells = [text(tc) for tc in re.findall(r'<w:tc>.*?</w:tc>', tr, re.S)]
        rows.append(cells)
print('rows', len(rows))
from collections import Counter
print('cell counts', Counter(len(r) for r in rows))
for r in rows[:8]: print(r)
with open(sys.argv[2], 'w', encoding='utf-8-sig', newline='') as f:
    w = csv.writer(f); [w.writerow(r) for r in rows]
# Structured version: row N (header = row 0) describes radio episode N (verified against
# transcripts by check_catalog_alignment.py). Column 4 ('No.') is empty in the source.
if len(sys.argv) > 3:
    with open(sys.argv[3], 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.writer(f)
        w.writerow(['episode', 'visitors', 'topic', 'story', 'done_mark'])
        for n, r in enumerate(rows[1:], start=1):
            r = (r + [''] * 5)[:5]
            if any(c.strip() for c in r[:4]):
                w.writerow([n, r[0], r[1], r[2], r[3]])
