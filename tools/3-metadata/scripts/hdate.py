"""Hebrew <-> Gregorian date helper for pass-1 agents (civil-day conversion, no evening shift).

Usage:
  python -I -X utf8 scripts/hdate.py 1989-12-19          -> 21 Kislev 5750 (Tuesday)
  python -I -X utf8 scripts/hdate.py "4 Iyar 5742"       -> 1982-04-27 (Tuesday)
  python -I -X utf8 scripts/hdate.py "Chanukah 5750"     -> first day of a holiday (Rosh Hashanah, Yom Kippur, Sukkos,
                                                            Chanukah, Purim, Pesach, Lag BaOmer, Shavuos, Tisha B'Av, Yud-Tes Kislev,
                                                            Yud Shevat, Gimmel Tammuz, Yud-Beis Tammuz, Chai Elul)
"""
import sys, os, re, datetime
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '_vendor'))
from pyluach import dates

MONTHS = {'nissan': 1, 'nisan': 1, 'iyar': 2, 'iyyar': 2, 'sivan': 3, 'tammuz': 4, 'tamuz': 4, 'av': 5, 'menachem av': 5, 'elul': 6,
          'tishrei': 7, 'tishri': 7, 'cheshvan': 8, 'marcheshvan': 8, 'kislev': 9, 'teves': 10, 'tevet': 10, 'shevat': 11, 'shvat': 11,
          'adar': 12, 'adar i': 12, 'adar 1': 12, 'adar alef': 12, 'adar ii': 13, 'adar 2': 13, 'adar beis': 13, 'adar sheni': 13}
HOLIDAYS = {'rosh hashanah': (7, 1), 'yom kippur': (7, 10), 'sukkos': (7, 15), 'simchas torah': (7, 23), 'yud-tes kislev': (9, 19),
            'yud tes kislev': (9, 19), 'chanukah': (9, 25), 'yud shevat': (11, 10), 'tu bshvat': (11, 15), 'purim': (12, 14),
            'pesach': (1, 15), 'lag baomer': (2, 18), 'shavuos': (3, 6), 'gimmel tammuz': (4, 3), 'yud-beis tammuz': (4, 12),
            'yud beis tammuz': (4, 12), 'tisha bav': (5, 9), "tisha b'av": (5, 9), 'chai elul': (6, 18)}
WD = 'Monday Tuesday Wednesday Thursday Friday Saturday Sunday'.split()

def heb_str(g):
    h = g.to_heb()
    return f'{h.day} {h.month_name()} {h.year}'

def main(arg):
    a = arg.strip()
    m = re.fullmatch(r'(\d{4})-(\d{2})-(\d{2})', a)
    if m:
        d = datetime.date(*map(int, m.groups()))
        return f'{heb_str(dates.GregorianDate(d.year, d.month, d.day))} ({WD[d.weekday()]})'
    low = a.lower().replace('’', "'")
    m = re.fullmatch(r"(.+?)\s+(\d{4})", low)
    if m and m.group(1) in HOLIDAYS:
        mo, dy = HOLIDAYS[m.group(1)]
        year = int(m.group(2))
        if mo == 12:
            try:
                dates.HebrewDate(year, 13, 1); mo = 13   # leap year: Purim is in Adar II
            except ValueError:
                pass
        g = dates.HebrewDate(year, mo, dy).to_greg()
        return f'{g.year:04d}-{g.month:02d}-{g.day:02d} ({WD[datetime.date(g.year, g.month, g.day).weekday()]})'
    m = re.fullmatch(r"(\d{1,2})\s+(.+?)\s+(\d{4})", low)
    if m and m.group(2) in MONTHS:
        g = dates.HebrewDate(int(m.group(3)), MONTHS[m.group(2)], int(m.group(1))).to_greg()
        return f'{g.year:04d}-{g.month:02d}-{g.day:02d} ({WD[datetime.date(g.year, g.month, g.day).weekday()]})'
    raise SystemExit(f'cannot parse {arg!r}; use YYYY-MM-DD, "4 Iyar 5742" or "Chanukah 5750"')

if __name__ == '__main__':
    for x in sys.argv[1:]:
        print(f'{x} -> {main(x)}')
