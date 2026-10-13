"""Apply reviewed cases where the first result preceded the stored filing date."""

import importlib.util
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('reconcile', ROOT / 'scripts/reconcile-announcements.py')
parser = importlib.util.module_from_spec(spec)
spec.loader.exec_module(parser)
parser.EXCLUDE = re.compile(
    r'correction|corrective|addendum|regarding|inability|unable|intention|'
    r'conference|expected announcement|delay|postpone|update on|latest development|supplementary', re.I,
)
path = ROOT / 'assets/announcement-updates.js'
updates = json.loads(path.read_text().split(' = ', 1)[1].rstrip(' ;\n'))
original = parser.SOURCE
targets = {
    '2250': [(2021, 'Q4'), (2022, 'Q4'), (2023, 'Q4'), (2024, 'Q4'), (2025, 'Q4')],
    '4001': [(2021, 'Q4'), (2022, 'Q4'), (2023, 'Q4'), (2024, 'Q4')],
    '2010': [(2021, 'Q4')],
    '2290': [(2021, 'Q4')],
    '2020': [(2021, 'Q4')],
    '2350': [(2021, 'Q4')],
    '4163': [(2024, 'Q4')],
    '4164': [(2024, 'Q4')],
    '6002': [(2023, 'Q4')],
    '3091': [(2022, 'Q4')],
    '8120': [(2021, 'Q4')],
    '4230': [(2022, 'Q3')],
}
existing = {(x['symbol'], x['year'], x['quarter']) for x in updates['earlierEstimatedAnnouncements']}
for symbol, periods in targets.items():
    records = original.get(symbol, {}).get('history', []) + [
        x for x in updates['records'] if x['symbol'] == symbol
    ]
    entries = parser.entries_for(symbol)
    for year, quarter in periods:
        if (symbol, year, quarter) in existing:
            continue
        old = next((x for x in records if x['year'] == year and x['quarter'] == quarter), None)
        if old is None:
            raise ValueError(f'Missing stored quarter {symbol} {year} {quarter}')
        key = f'{year}|{quarter}'
        candidates = sorted((x for x in entries if parser.direct_fiscal_key(x) == key
                             and x['published'][:10] < old['date']),
                            key=lambda x: x['published'])
        if not candidates:
            raise ValueError(f'No earlier result for {symbol} {key}')
        first = candidates[0]
        later = next((x for x in entries if x['published'][:10] == old['date']
                      and x['periodEnd'] == first['periodEnd']), None)
        if quarter == 'Q4' and first['periodEnd'] != f'{year}-12-31':
            raise ValueError(f'Unexpected fiscal period for {symbol} {key}')
        company = original.get(symbol, {}).get('company') or next(
            x['company'] for x in updates['records'] if x['symbol'] == symbol)
        updates['earlierEstimatedAnnouncements'].append({
            'symbol': symbol, 'company': company, 'year': year, 'quarter': quarter,
            'date': first['published'][:10], 'previousDate': old['date'],
            'periodEnd': first['periodEnd'], 'sourceUrl': first['url'],
            'finalSourceUrl': later['url'] if later else old.get('sourceUrl', ''),
            'sourceLabel': 'أول إعلان نتائج • مصدر إفصاح الشركة',
            'verification': 'The first results disclosure precedes the later stored filing for the same period',
            'noticeTitle': first['title'],
            'finalNoticeTitle': later['title'] if later else 'التاريخ السابق في الملف المرفق',
            'sourceKind': 'first-results',
        })
def compact_array(name, rows, trailing=True):
    lines = [f'  "{name}": [']
    lines.extend('    ' + json.dumps(row, ensure_ascii=False, separators=(',', ':'))
                 + (',' if index < len(rows) - 1 else '')
                 for index, row in enumerate(rows))
    lines.append('  ]' + (',' if trailing else ''))
    return '\n'.join(lines)


path.write_text('\n'.join([
    '/* Verified additions and corrections to built-in bank defaults; visitor edits are preserved. */',
    'globalThis.ANNOUNCEMENT_UPDATES = {',
    '  "asOf": ' + json.dumps(updates['asOf']) + ',',
    compact_array('records', updates['records']),
    compact_array('earlierEstimatedAnnouncements', updates['earlierEstimatedAnnouncements']),
    compact_array('verifiedBankCorrections', updates['verifiedBankCorrections'], False),
    '};',
    '',
]))
print('first-result corrections', len(updates['earlierEstimatedAnnouncements']))
