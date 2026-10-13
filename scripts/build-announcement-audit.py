"""Export a quarter-by-quarter audit of the supplemental announcement archive."""
import collections
import calendar
import csv
import datetime as dt
import html
import importlib.util
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT.parent.parent / 'outputs'
OUT.mkdir(parents=True, exist_ok=True)
companies = json.loads(re.search(r'^const COMPANIES\s*=\s*(\[.*\]);$', (ROOT / 'index.html').read_text(), re.M).group(1))
original = json.loads((ROOT / 'assets/announcement-history.js').read_text().split(' = ', 1)[1].rstrip(' ;\n'))
updates = json.loads((ROOT / 'assets/announcement-updates.js').read_text().split(' = ', 1)[1].rstrip(' ;\n'))
fiscal = json.loads((ROOT / 'assets/fiscal-calendars.js').read_text().split(' = ', 1)[1].rstrip(' ;\n'))
spec = importlib.util.spec_from_file_location('reconcile', ROOT / 'scripts/reconcile-announcements.py')
parser = importlib.util.module_from_spec(spec)
spec.loader.exec_module(parser)
parser.EXCLUDE = re.compile(r'correction|corrective|addendum|regarding|inability|unable|intention|conference|expected announcement|delay|postpone|update on|latest development|supplementary', re.I)
archive_by_date = {}
for company in companies:
    dates = collections.defaultdict(list)
    for item in parser.entries_for(company['symbol']):
        dates[item['published'][:10]].append(item)
    archive_by_date[company['symbol']] = dates
source = {item['symbol']: item for item in original['forecasts']}
added = collections.defaultdict(list)
for item in updates['records']:
    added[item['symbol']].append(item)
bank_corrections = {(item['symbol'], item['year'], item['quarter']): item for item in updates['verifiedBankCorrections']}
first_estimated = {(item['symbol'], item['year'], item['quarter']): item for item in updates['earlierEstimatedAnnouncements']}
official_overrides = {
    ('4180', 2023, 2, '2023-08-13'): {
        'periodEnd': '2023-06-30',
        'sourceUrl': 'https://www.saudiexchange.sa/wps/portal/saudiexchange/newsandreports/issuer-news/issuer-announcements/issuer-announcements-details/?anCat=1&anId=75350&cs=4180&locale=ar',
        'sourceLabel': 'إعلان الشركة • تداول السعودية',
        'noticeTitle': 'إعلان مجموعة فتيحي القابضة عن النتائج المالية الأولية الموحدة للفترة المنتهية في 30-06-2023 (ستة أشهر)',
    },
}
AS_OF = dt.date.fromisoformat(updates['asOf'])
def expected_period_end(symbol, year, quarter):
    special = {
        # The two Cenomi issuers had a short April–December 2022 fiscal cycle.
        '4240': {2022: {1: '2022-06-30', 2: '2022-09-30', 3: '2022-12-31', 4: '2022-12-31'}},
        '4321': {2022: {1: '2022-06-30', 2: '2022-09-30', 3: '2022-12-31', 4: '2022-12-31'}},
        # SADAFCO's 2023 short cycle followed its March-ended 2023 year.
        '2270': {2023: {1: '2023-06-30', 2: '2023-09-30', 3: '2023-12-31', 4: '2023-12-31'}},
        # National Learning's 2024 year lasted eleven months and ended July.
        '4291': {2024: {1: '2023-11-30', 2: '2024-02-29', 3: '2024-05-31', 4: '2024-07-31'}},
        # Makkah's first Gregorian quarter ran for three months and 17 days.
        '4100': {2022: {1: '2022-09-30'}},
    }
    if year in special.get(symbol, {}) and quarter in special[symbol][year]:
        return special[symbol][year][quarter]
    info = fiscal[symbol]
    end = info.get('previousYearEnd') if year < info.get('changeYear', 0) else info.get('yearEnd')
    if not end or not end[:2].isdigit():
        return None
    end_month = int(end[:2])
    month = (end_month - 1 + 3 * quarter) % 12 + 1
    period_year = year - (month > end_month)
    day = calendar.monthrange(period_year, month)[1]
    return f'{period_year:04d}-{month:02d}-{day:02d}'
SEMIANNUAL = {'2288', '3092', '4021', '4144', '4145', '4146', '4148', '4323', '4324', '6016', '6017', '7211'}
TRANSITIONS = {'2270', '4100'}
HEADER = ['رمز الشركة', 'الشركة', 'القطاع', 'السنة المالية', 'الربع', 'نهاية السنة المالية للشركة', 'الحالة', 'حالة مطابقة المصدر', 'تاريخ أول إعلان نتائج', 'نهاية الفترة', 'المصدر', 'رابط الإثبات', 'عنوان الإفصاح', 'التاريخ السابق في السجل', 'رابط التاريخ السابق']
coverage = []
company_summary = []
for company in companies:
    symbol = company['symbol']
    if company['sector'] == 'الصناديق العقارية المتداولة':
        continue
    periods = {}
    for item in source.get(symbol, {}).get('history', []):
        if item['year'] >= 2021 and dt.date.fromisoformat(item['date']) <= AS_OF:
            verified = bank_corrections.get((symbol, item['year'], item['quarter']))
            periods[(item['year'], int(item['quarter'][1]))] = ('الملف المرفق', {**item, **verified} if verified else item)
    for item in added[symbol]:
        key = (item['year'], int(item['quarter'][1]))
        assert key not in periods, (symbol, key)
        assert dt.date.fromisoformat(item['periodEnd']) <= dt.date.fromisoformat(item['date']) <= AS_OF
        assert item['sourceUrl'].startswith('https://')
        periods[key] = ('إعلان موثق', item)
    for (corrected_symbol, year, quarter), item in first_estimated.items():
        if corrected_symbol != symbol:
            continue
        key = year, int(quarter[1])
        assert key in periods and periods[key][1]['date'] == item['previousDate'], (symbol, key)
        periods[key] = (periods[key][0], item)
    assert periods, symbol
    first, last = min(periods), max(periods)
    counters = collections.Counter()
    verification_counters = collections.Counter()
    for year in range(2021, last[0] + 1):
        for quarter in range(1, 5):
            key = year, quarter
            if key > last:
                break
            category, entry = periods.get(key, ('', {}))
            if not category:
                if key < first:
                    category = 'قبل أول نتيجة متاحة في المصادر'
                elif symbol in SEMIANNUAL and quarter in {1, 3}:
                    category = 'لم يُعثر على إعلان ربعي مستقل؛ إفصاح نصف سنوي'
                elif symbol in TRANSITIONS:
                    category = 'تغيير السنة المالية؛ يحتاج مطابقة يدوية لتسمية الربع'
                else:
                    category = 'لم يُعثر على تاريخ موثق'
            counters[category] += 1
            fiscal_info = fiscal[symbol]
            fiscal_end = fiscal_info.get('previousYearEnd') if fiscal_info.get('changeYear', 0) > year else fiscal_info.get('yearEnd')
            if not category or not entry:
                verification = 'لا يوجد تاريخ'
            elif entry.get('sourceUrl'):
                verification = 'رابط إفصاح محدد'
            elif (symbol, year, quarter, entry['date']) in official_overrides:
                verification = 'مطابق لعنوان إعلان مؤرخ'
                entry = {**entry, **official_overrides[(symbol, year, quarter, entry['date'])]}
            else:
                day_entries = archive_by_date[symbol].get(entry['date'], [])
                key = f'{year}|Q{quarter}'
                expected_end = expected_period_end(symbol, year, quarter)
                matched = next((item for item in day_entries
                                if item['periodEnd'] == expected_end
                                or (expected_end is None and parser.direct_fiscal_key(item) == key)), None)
                if matched:
                    verification = 'مطابق لعنوان إعلان مؤرخ'
                    entry = {**entry, 'periodEnd': matched['periodEnd'], 'sourceUrl': matched['url'],
                             'sourceLabel': 'إعلان شركة مؤرخ • أرشيف مباشر', 'noticeTitle': matched['title']}
                elif day_entries:
                    verification = 'عنوان الإعلان لا يطابق تسمية السنة والربع؛ راجع الفترة الانتقالية'
                    item = day_entries[0]
                    entry = {**entry, 'periodEnd': item['periodEnd'], 'sourceUrl': item['url'],
                             'sourceLabel': 'إعلان شركة مؤرخ • يحتاج مراجعة التسمية', 'noticeTitle': item['title']}
                else:
                    verification = 'لم يُعثر على إعلان مطابق في الأرشيف المفحوص'
            verification_counters[verification] += 1
            coverage.append([
                symbol, company['name'], company['sector'], year, f'Q{quarter}', fiscal_end or 'صندوق', category, verification,
                entry.get('date', ''), entry.get('periodEnd', ''),
                entry.get('sourceLabel', 'الملف المرفق • غير متحقق فرديًا') if entry else '',
                entry.get('sourceUrl', ''), entry.get('noticeTitle', ''),
                entry.get('previousDate', ''), entry.get('finalSourceUrl', ''),
            ])
    company_summary.append({
        'symbol': symbol, 'company': company['name'], 'sector': company['sector'],
        'first': first, 'last': last, 'original': counters['الملف المرفق'],
        'added': counters['إعلان موثق'], 'leading': counters['قبل أول نتيجة متاحة في المصادر'],
        'semiannual': counters['لم يُعثر على إعلان ربعي مستقل؛ إفصاح نصف سنوي'],
        'transition': counters['تغيير السنة المالية؛ يحتاج مطابقة يدوية لتسمية الربع'],
        'unresolved': counters['لم يُعثر على تاريخ موثق'],
        'first_estimated': sum((symbol, year, f'Q{quarter}') in first_estimated for year, quarter in periods),
        'verification': verification_counters,
    })
issues = [
    {'symbol': row[0], 'year': row[3], 'quarter': row[4], 'date': row[8],
     'periodEnd': row[9], 'status': row[7], 'sourceUrl': row[11]}
    for row in coverage if row[8] and row[7] in {
        'عنوان الإعلان لا يطابق تسمية السنة والربع؛ راجع الفترة الانتقالية',
        'لم يُعثر على إعلان مطابق في الأرشيف المفحوص',
    }
]
(ROOT / 'assets/announcement-issues.js').write_text(
    'globalThis.ANNOUNCEMENT_ISSUES = ' + json.dumps(issues, ensure_ascii=False, indent=2) + ';\n'
)
with (OUT / 'سجل-تدقيق-الأرباع-من-2021.csv').open('w', newline='', encoding='utf-8-sig') as handle:
    writer = csv.writer(handle)
    writer.writerow(HEADER)
    writer.writerows(coverage)
with (OUT / 'ملخص-تغطية-الشركات.csv').open('w', newline='', encoding='utf-8-sig') as handle:
    writer = csv.writer(handle)
    writer.writerow(['الرمز', 'الشركة', 'القطاع', 'أول ربع موثق', 'آخر ربع معلن', 'تواريخ الملف الأصلي', 'تواريخ أُضيفت', 'أول إعلان نتائج بديل', 'فترات قبل أول نتيجة متاحة', 'فترات نصف سنوية دون إعلان ربعي مستقل', 'فترات تغيير السنة المالية', 'فترات بلا تاريخ موثق', 'تواريخ مطابقة للإعلان', 'تواريخ مضاف لها رابط مصدر', 'تواريخ غير مطابقة للتسمية', 'تواريخ بلا إعلان مطابق'])
    for item in company_summary:
        v = item['verification']
        writer.writerow([item['symbol'], item['company'], item['sector'], f"{item['first'][0]} Q{item['first'][1]}", f"{item['last'][0]} Q{item['last'][1]}", item['original'], item['added'], item['first_estimated'], item['leading'], item['semiannual'], item['transition'], item['unresolved'], v['مطابق لعنوان إعلان مؤرخ'], v['رابط إفصاح محدد'], v['عنوان الإعلان لا يطابق تسمية السنة والربع؛ راجع الفترة الانتقالية'], v['لم يُعثر على إعلان مطابق في الأرشيف المفحوص']])
with (OUT / 'تصنيف-السنوات-المالية.csv').open('w', newline='', encoding='utf-8-sig') as handle:
    writer = csv.writer(handle)
    writer.writerow(['الرمز', 'الشركة', 'نهاية السنة المالية الحالية', 'النهاية السابقة', 'سنة التحول', 'رابط إثبات', 'رابط التحول'])
    for company in companies:
        item = fiscal[company['symbol']]
        writer.writerow([company['symbol'], company['name'], item.get('yearEnd') or 'صندوق عقاري', item.get('previousYearEnd', ''), item.get('changeYear', ''), item.get('sourceUrl', ''), item.get('transitionSourceUrl', '')])
with (OUT / 'مراجعة-التقديري-والنهائي.csv').open('w', newline='', encoding='utf-8-sig') as handle:
    writer = csv.writer(handle)
    writer.writerow(['الرمز', 'الشركة', 'السنة المالية', 'الربع', 'أول إعلان نتائج', 'رابط أول إعلان', 'التاريخ السابق في السجل', 'رابط التاريخ السابق'])
    for item in updates['earlierEstimatedAnnouncements']:
        writer.writerow([item['symbol'], item['company'], item['year'], item['quarter'], item['date'], item['sourceUrl'], item['previousDate'], item['finalSourceUrl']])
internal = [item for item in company_summary if item['semiannual'] or item['transition'] or item['unresolved']]
leading = [item for item in company_summary if item['leading']]
estimated_companies = [item for item in company_summary if item['first_estimated']]
verification_totals = sum((item['verification'] for item in company_summary), collections.Counter())
counts = collections.Counter(row[6] for row in coverage)
def esc(value): return html.escape(str(value), quote=True)
def ltr(value): return '\u2066' + str(value) + '\u2069'
def period(key): return f'الربع {ltr(key[1])} من {ltr(key[0])}'
def rows_for(items, kind):
    lines = []
    for item in items:
        found = [row for row in coverage if row[0] == item['symbol'] and ((kind == 'internal' and row[6] in {'لم يُعثر على إعلان ربعي مستقل؛ إفصاح نصف سنوي', 'تغيير السنة المالية؛ يحتاج مطابقة يدوية لتسمية الربع', 'لم يُعثر على تاريخ موثق'}) or (kind == 'leading' and row[6] == 'قبل أول نتيجة متاحة في المصادر'))]
        quarters = '\u2067' + '، '.join(ltr(f'{row[4]} {row[3]}') for row in found) + '\u2069'
        reasons = '، '.join(sorted({row[6] for row in found}))
        lines.append(f'<tr><td>{esc(item["symbol"])}</td><td>{esc(item["company"])}</td><td>{esc(quarters)}</td><td>{esc(reasons if kind == "internal" else period(item["first"]))}</td></tr>')
    return '\n'.join(lines)
page = f'''<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>تدقيق تواريخ إعلانات الأرباح</title><style>
:root{{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#10293b;background:#f3f7fa}}body{{max-width:1120px;margin:auto;padding:24px}}h1,h2{{color:#07364b}}.hero{{background:#07364b;color:#fff;border-radius:24px;padding:26px}}.hero h1{{color:#fff;margin:0 0 10px}}.hero p{{margin:0;line-height:1.8}}.cards{{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:18px 0}}.card{{background:white;border:1px solid #dbe7ec;border-radius:16px;padding:16px}}.card b{{display:block;font-size:26px;color:#087c84}}.card span{{font-size:14px}}section{{background:white;border:1px solid #dbe7ec;border-radius:18px;padding:20px;margin:18px 0}}p,li{{line-height:1.8}}.scroll{{overflow:auto}}table{{width:100%;border-collapse:collapse;min-width:650px}}th,td{{padding:9px 11px;text-align:right;border-bottom:1px solid #e3ebef;vertical-align:top}}th{{background:#eaf2f5}}tr:hover{{background:#f8fbfc}}a{{color:#006e78}}.tag{{font-size:12px;color:#4c6570}}
</style><body><div class="hero"><h1>تدقيق تواريخ إعلانات الأرباح</h1><p>من بداية {ltr('2021')} حتى آخر ربع معلن لكل شركة، وفق البيانات المتاحة حتى {ltr(updates['asOf'])}. يحتفظ المشروع بتواريخ الملف المرفق، ويضيف فقط تواريخ إعلان النتائج التي لها مصدر محدد.</p></div>
<div class="cards"><div class="card"><b>{len(company_summary)}</b><span>شركة تشغيلية شملها التدقيق</span></div><div class="card"><b>{counts['إعلان موثق']}</b><span>تاريخًا أُضيف مع رابط</span></div><div class="card"><b>{len(updates['earlierEstimatedAnnouncements'])}</b><span>تاريخًا صُحح إلى أول إعلان نتائج</span></div><div class="card"><b>{verification_totals['مطابق لعنوان إعلان مؤرخ']}</b><span>تاريخًا أصليًا طابق إعلانًا مؤرخًا</span></div><div class="card"><b>{verification_totals['عنوان الإعلان لا يطابق تسمية السنة والربع؛ راجع الفترة الانتقالية']}</b><span>تسمية سنة أو ربع تحتاج مراجعة</span></div><div class="card"><b>{verification_totals['لم يُعثر على إعلان مطابق في الأرشيف المفحوص']}</b><span>تاريخًا لم نجد له إعلانًا مطابقًا</span></div></div>
<section><h2>ما الذي يعنيه النقص؟</h2><p>التاريخ الرئيسي هو أول إعلان لنتائج الربع: الإعلان التقديري إذا سبق القوائم التفصيلية. عُثر على أول إعلان نتائج أسبق في {len(updates["earlierEstimatedAnnouncements"])} ربعًا، واعتمد التاريخ الأول مع إبقاء التاريخ السابق في التدقيق. بقيت {counts['لم يُعثر على إعلان ربعي مستقل؛ إفصاح نصف سنوي']} خانة في شركات يظهر لها نمط إفصاح نصف سنوي دون إعلان ربعي مستقل في الأرشيف الذي فُحص، و{counts['تغيير السنة المالية؛ يحتاج مطابقة يدوية لتسمية الربع']} خانات مرتبطة بتغيير السنة المالية. أما {counts['قبل أول نتيجة متاحة في المصادر']} خانة فهي تسبق أول نتيجة متاحة للشركة في المصادر؛ لا يعني ذلك بالضرورة أنها كانت مدرجة أو مُلزمة بالإعلان في تلك السنوات.</p><p>تبيّن أن {len(bank_corrections)} تاريخًا افتراضيًا للبنوك في الموقع يختلف عن الملف المرفق؛ طُوبق تاريخ الملف مع إعلان منشور وأصبح الافتراضي الصحيح في النسخة الجديدة. تُحفظ أي قيمة مختلفة أدخلها الزائر. طُوبقت تواريخ الملف الأصلي مع أرشيف عناوين إفصاحات الشركات؛ الحالات التي لم نجد لها إعلانًا مطابقًا أو ظهر فيها تعارض تسمية محددة بوضوح في ملف التدقيق ولا تعد مؤكدة. استُبعدت {sum(c['sector'] == 'الصناديق العقارية المتداولة' for c in companies)} صناديق عقارية متداولة لأن إيقاع إفصاحها ومقاييسها المالية يختلفان عن الشركات التشغيلية.</p><p><a href="سجل-تدقيق-الأرباع-من-2021.csv">تنزيل سجل كل ربع ومصدره</a> · <a href="ملخص-تغطية-الشركات.csv">تنزيل ملخص الشركات</a> · <a href="تصنيف-السنوات-المالية.csv">تنزيل تصنيف السنة المالية</a> · <a href="مراجعة-التقديري-والنهائي.csv">تنزيل مقارنة الإعلانين</a></p></section>
<section><h2>شركات كان أول إعلان نتائجها أسبق</h2><div class="scroll"><table><thead><tr><th>الرمز</th><th>الشركة</th><th>عدد الأرباع المصححة</th></tr></thead><tbody>{''.join(f'<tr><td>{esc(item["symbol"])}</td><td>{esc(item["company"])}</td><td>{item["first_estimated"]}</td></tr>' for item in estimated_companies)}</tbody></table></div></section>
<section><h2>حدود التحقق</h2><p>هناك {verification_totals['عنوان الإعلان لا يطابق تسمية السنة والربع؛ راجع الفترة الانتقالية']} تاريخًا يتطلب مراجعة تسمية السنة أو الربع في فترات تغيير السنة المالية، و{verification_totals['لم يُعثر على إعلان مطابق في الأرشيف المفحوص']} تاريخًا لم نجد له إعلانًا مطابقًا في الأرشيف المفحوص. تبقى هذه القيم ظاهرة في السجل مع حالة التحقق، ولا تُقدّم بوصفها مؤكدة. انتقلت سينومي ريتيل وسينومي سنترز وسدافكو والوطنية للتعليم بين نهايات سنوات مالية مختلفة؛ راجع نهاية الفترة الفعلية لكل إفصاح قبل المقارنة.</p></section>
<section><h2>الشركات ذات الفجوات داخل سجلها</h2><div class="scroll"><table><thead><tr><th>الرمز</th><th>الشركة</th><th>الأرباع</th><th>التفسير</th></tr></thead><tbody>{rows_for(internal,'internal')}</tbody></table></div></section>
<section><h2>شركات تسبق بداية سجلها سنة 2021</h2><p>الصفوف أدناه تحصر الفترات قبل أول ربع عُثر له على تاريخ. يلزم تحقق منفصل من تاريخ الإدراج أو إلزام الإفصاح قبل عدها إعلانات ناقصة.</p><div class="scroll"><table><thead><tr><th>الرمز</th><th>الشركة</th><th>الأرباع قبل أول نتيجة</th><th>أول ربع متاح</th></tr></thead><tbody>{rows_for(leading,'leading')}</tbody></table></div></section>
<p class="tag">منهجية: طُوبق رمز الشركة، ونهاية الفترة، ورقم الربع والسنة المالية، وتاريخ النشر. لم تُنقل الإعلانات التصحيحية أو التقديرية كأرباع عادية إلا عندما وُثقت صفتها صراحة. إعداد: {esc(updates['asOf'])}.</p></body></html>'''
(OUT / 'تقرير-فجوات-إعلانات-الأرباح.html').write_text(page, encoding='utf-8')
print(json.dumps({'companies':len(company_summary),'internalCompanies':len(internal),'leadingCompanies':len(leading),'counts':counts,'rows':len(coverage)},ensure_ascii=False,indent=2))
