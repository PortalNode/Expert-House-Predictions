"""Build current issuer fiscal-year groups from dated financial-result notices.

Historical transitions are explicit because a quarter number alone cannot describe
two different fiscal years that both ended during the same calendar year.
"""

import calendar
import collections
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
    r'conference|expected announcement|delay|postpone|update on|latest development|supplementary',
    re.I,
)
companies = json.loads(re.search(
    r'^const COMPANIES\s*=\s*(\[.*\]);$',
    (ROOT / 'index.html').read_text(), re.M,
).group(1))
source_page = ('https://www.saudiexchange.sa/wps/portal/saudiexchange/'
               'rules-guidance/capital-market-overview/Restrictions-Periods-and-Financials-Deadline?locale=ar')
transitions = {
    '2270': ('03-31', 2023, 'https://www.saudiexchange.sa/wps/portal/saudiexchange/newsandreports/issuer-news/issuer-announcements/issuer-announcements-details/?anCat=1&anId=85790&cs=2270&locale=ar'),
    '4240': ('03-31', 2022, 'https://www.saudiexchange.sa/wps/portal/saudiexchange/newsandreports/issuer-news/issuer-announcements/issuer-announcements-details/?anCat=1&anId=72796&cs=4240&locale=ar'),
    '4321': ('03-31', 2022, 'https://www.saudiexchange.sa/wps/portal/saudiexchange/newsandreports/issuer-news/issuer-announcements/issuer-announcements-details?anCat=1&anId=71970&cs=4321&locale=ar'),
    '4291': ('08-31', 2024, 'https://www.saudiexchange.sa/wps/portal/saudiexchange/newsandreports/issuer-news/issuer-announcements/issuer-announcements-details/?anCat=1&anId=83227&cs=4291&locale=ar'),
    '4100': ('هجري', 2022, 'https://www.saudiexchange.sa/wps/portal/saudiexchange/newsandreports/issuer-news/issuer-announcements/issuer-announcements-details/?anCat=17&anId=72793&cs=4100&locale=ar'),
}
result = {}
for company in companies:
    symbol = company['symbol']
    if company['sector'] == 'الصناديق العقارية المتداولة':
        result[symbol] = {'cadence': 'fund', 'yearEnd': None, 'sourceUrl': source_page}
        continue
    entries = parser.entries_for(symbol)
    votes = collections.Counter()
    evidence = {}
    for entry in entries:
        if entry['published'][:10] < '2024-10-01':
            continue
        quarter = parser.quarter_hint(entry['title'])
        if quarter is None:
            continue
        month = (entry['month'] + 3 * (4 - quarter) - 1) % 12 + 1
        votes[month] += 1
        if month not in evidence or entry['published'] > evidence[month]['published']:
            evidence[month] = entry
    if symbol == '4147':
        month = 3
        evidence_url = source_page
    elif votes:
        month = votes.most_common(1)[0][0]
        evidence_url = evidence[month]['url']
    else:
        raise ValueError(f'No current fiscal-year evidence for {symbol} {company["name"]}')
    record = {
        'cadence': 'quarterly',
        'yearEnd': f'{month:02d}-{calendar.monthrange(2025, month)[1]:02d}',
        'sourceUrl': evidence_url,
        'evidenceCount': votes[month],
    }
    if symbol in transitions:
        previous_end, change_year, transition_url = transitions[symbol]
        record.update(previousYearEnd=previous_end, changeYear=change_year,
                      transitionSourceUrl=transition_url)
    result[symbol] = record

target = ROOT / 'assets/fiscal-calendars.js'
target.write_text('globalThis.FISCAL_CALENDARS = ' + json.dumps(result, ensure_ascii=False, indent=2) + ';\n')
print('companies', len(result), 'groups', dict(collections.Counter(x['yearEnd'] or 'fund' for x in result.values())))
