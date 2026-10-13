"""Export a quarter-by-quarter audit of the supplemental announcement archive."""
import collections
import csv
import datetime as dt
import html
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
source = {item['symbol']: item for item in original['forecasts']}
added = collections.defaultdict(list)
for item in updates['records']:
    added[item['symbol']].append(item)
bank_corrections = {(item['symbol'], item['year'], item['quarter']): item for item in updates['verifiedBankCorrections']}
AS_OF = dt.date.fromisoformat(updates['asOf'])
SEMIANNUAL = {'2288', '3092', '4021', '4144', '4145', '4146', '4148', '4323', '4324', '6016', '6017', '7211'}
TRANSITIONS = {'2270', '4100'}
HEADER = ['رمز الشركة', 'الشركة', 'القطاع', 'السنة المالية', 'الربع', 'الحالة', 'تاريخ الإعلان', 'نهاية الفترة', 'المصدر', 'رابط الإثبات', 'عنوان الإفصاح']
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
    assert periods, symbol
    first, last = min(periods), max(periods)
    counters = collections.Counter()
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
            coverage.append([
                symbol, company['name'], company['sector'], year, f'Q{quarter}', category,
                entry.get('date', ''), entry.get('periodEnd', ''),
                entry.get('sourceLabel', 'الملف المرفق • غير متحقق فرديًا') if entry else '',
                entry.get('sourceUrl', ''), entry.get('noticeTitle', ''),
            ])
    company_summary.append({
        'symbol': symbol, 'company': company['name'], 'sector': company['sector'],
        'first': first, 'last': last, 'original': counters['الملف المرفق'],
        'added': counters['إعلان موثق'], 'leading': counters['قبل أول نتيجة متاحة في المصادر'],
        'semiannual': counters['لم يُعثر على إعلان ربعي مستقل؛ إفصاح نصف سنوي'],
        'transition': counters['تغيير السنة المالية؛ يحتاج مطابقة يدوية لتسمية الربع'],
        'unresolved': counters['لم يُعثر على تاريخ موثق'],
    })
with (OUT / 'سجل-تدقيق-الأرباع-من-2021.csv').open('w', newline='', encoding='utf-8-sig') as handle:
    writer = csv.writer(handle)
    writer.writerow(HEADER)
    writer.writerows(coverage)
with (OUT / 'ملخص-تغطية-الشركات.csv').open('w', newline='', encoding='utf-8-sig') as handle:
    writer = csv.writer(handle)
    writer.writerow(['الرمز', 'الشركة', 'القطاع', 'أول ربع موثق', 'آخر ربع معلن', 'تواريخ الملف الأصلي', 'تواريخ أُضيفت', 'فترات قبل أول نتيجة متاحة', 'فترات نصف سنوية دون إعلان ربعي مستقل', 'فترات تغيير السنة المالية', 'فترات بلا تاريخ موثق'])
    for item in company_summary:
        writer.writerow([item['symbol'], item['company'], item['sector'], f"{item['first'][0]} Q{item['first'][1]}", f"{item['last'][0]} Q{item['last'][1]}", item['original'], item['added'], item['leading'], item['semiannual'], item['transition'], item['unresolved']])
internal = [item for item in company_summary if item['semiannual'] or item['transition'] or item['unresolved']]
leading = [item for item in company_summary if item['leading']]
counts = collections.Counter(row[5] for row in coverage)
def esc(value): return html.escape(str(value), quote=True)
def ltr(value): return '\u2066' + str(value) + '\u2069'
def period(key): return f'الربع {ltr(key[1])} من {ltr(key[0])}'
def rows_for(items, kind):
    lines = []
    for item in items:
        found = [row for row in coverage if row[0] == item['symbol'] and ((kind == 'internal' and row[5] in {'لم يُعثر على إعلان ربعي مستقل؛ إفصاح نصف سنوي', 'تغيير السنة المالية؛ يحتاج مطابقة يدوية لتسمية الربع', 'لم يُعثر على تاريخ موثق'}) or (kind == 'leading' and row[5] == 'قبل أول نتيجة متاحة في المصادر'))]
        quarters = '\u2067' + '، '.join(ltr(f'{row[4]} {row[3]}') for row in found) + '\u2069'
        reasons = '، '.join(sorted({row[5] for row in found}))
        lines.append(f'<tr><td>{esc(item["symbol"])}</td><td>{esc(item["company"])}</td><td>{esc(quarters)}</td><td>{esc(reasons if kind == "internal" else period(item["first"]))}</td></tr>')
    return '\n'.join(lines)
page = f'''<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>تدقيق تواريخ إعلانات الأرباح</title><style>
:root{{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#10293b;background:#f3f7fa}}body{{max-width:1120px;margin:auto;padding:24px}}h1,h2{{color:#07364b}}.hero{{background:#07364b;color:#fff;border-radius:24px;padding:26px}}.hero h1{{color:#fff;margin:0 0 10px}}.hero p{{margin:0;line-height:1.8}}.cards{{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:18px 0}}.card{{background:white;border:1px solid #dbe7ec;border-radius:16px;padding:16px}}.card b{{display:block;font-size:26px;color:#087c84}}.card span{{font-size:14px}}section{{background:white;border:1px solid #dbe7ec;border-radius:18px;padding:20px;margin:18px 0}}p,li{{line-height:1.8}}.scroll{{overflow:auto}}table{{width:100%;border-collapse:collapse;min-width:650px}}th,td{{padding:9px 11px;text-align:right;border-bottom:1px solid #e3ebef;vertical-align:top}}th{{background:#eaf2f5}}tr:hover{{background:#f8fbfc}}a{{color:#006e78}}.tag{{font-size:12px;color:#4c6570}}
</style><body><div class="hero"><h1>تدقيق تواريخ إعلانات الأرباح</h1><p>من بداية {ltr('2021')} حتى آخر ربع معلن لكل شركة، وفق البيانات المتاحة حتى {ltr(updates['asOf'])}. يحتفظ المشروع بتواريخ الملف المرفق، ويضيف فقط تواريخ إعلان النتائج التي لها مصدر محدد.</p></div>
<div class="cards"><div class="card"><b>{len(company_summary)}</b><span>شركة تشغيلية شملها التدقيق</span></div><div class="card"><b>{counts['إعلان موثق']}</b><span>تاريخًا أُضيف مع رابط</span></div><div class="card"><b>{counts['الملف المرفق']}</b><span>تاريخًا من الملف الأصلي منذ 2021</span></div><div class="card"><b>{len(internal)}</b><span>شركة بها فترات داخلية تحتاج تفسيرًا</span></div><div class="card"><b>{counts['قبل أول نتيجة متاحة في المصادر']}</b><span>ربعًا قبل أول نتيجة متاحة</span></div></div>
<section><h2>ما الذي يعنيه النقص؟</h2><p>الربع الفارغ ليس تاريخًا يمكن تقديره ثم اعتباره إعلانًا فعليًا. بقيت {counts['لم يُعثر على إعلان ربعي مستقل؛ إفصاح نصف سنوي']} خانة في شركات يظهر لها نمط إفصاح نصف سنوي دون إعلان ربعي مستقل في الأرشيف الذي فُحص، و{counts['تغيير السنة المالية؛ يحتاج مطابقة يدوية لتسمية الربع']} خانات مرتبطة بتغيير السنة المالية. أما {counts['قبل أول نتيجة متاحة في المصادر']} خانة فهي تسبق أول نتيجة متاحة للشركة في المصادر؛ لا يعني ذلك بالضرورة أنها كانت مدرجة أو مُلزمة بالإعلان في تلك السنوات. لم يبقَ فراغ داخلي غير مصنف: {counts['لم يُعثر على تاريخ موثق']}.</p><p>تبيّن أن {len(bank_corrections)} تاريخًا افتراضيًا للبنوك في الموقع يختلف عن الملف المرفق؛ طُوبق تاريخ الملف مع إعلان منشور وأصبح الافتراضي الصحيح في النسخة الجديدة. تُحفظ أي قيمة مختلفة أدخلها الزائر. الملف الأصلي لم تُراجع كل تواريخه فرديًا؛ الروابط المباشرة متاحة للإضافات الجديدة والتواريخ البنكية المطابقة في ملف التدقيق التفصيلي. استُبعدت {sum(c['sector'] == 'الصناديق العقارية المتداولة' for c in companies)} صناديق عقارية متداولة لأن إيقاع إفصاحها ومقاييسها المالية يختلفان عن الشركات التشغيلية.</p><p><a href="سجل-تدقيق-الأرباع-من-2021.csv">تنزيل سجل كل ربع ومصدره</a> · <a href="ملخص-تغطية-الشركات.csv">تنزيل ملخص الشركات</a></p></section>
<section><h2>الشركات ذات الفجوات داخل سجلها</h2><div class="scroll"><table><thead><tr><th>الرمز</th><th>الشركة</th><th>الأرباع</th><th>التفسير</th></tr></thead><tbody>{rows_for(internal,'internal')}</tbody></table></div></section>
<section><h2>شركات تسبق بداية سجلها سنة 2021</h2><p>الصفوف أدناه تحصر الفترات قبل أول ربع عُثر له على تاريخ. يلزم تحقق منفصل من تاريخ الإدراج أو إلزام الإفصاح قبل عدها إعلانات ناقصة.</p><div class="scroll"><table><thead><tr><th>الرمز</th><th>الشركة</th><th>الأرباع قبل أول نتيجة</th><th>أول ربع متاح</th></tr></thead><tbody>{rows_for(leading,'leading')}</tbody></table></div></section>
<p class="tag">منهجية: طُوبق رمز الشركة، ونهاية الفترة، ورقم الربع والسنة المالية، وتاريخ النشر. لم تُنقل الإعلانات التصحيحية أو التقديرية كأرباع عادية إلا عندما وُثقت صفتها صراحة. إعداد: {esc(updates['asOf'])}.</p></body></html>'''
(OUT / 'تقرير-فجوات-إعلانات-الأرباح.html').write_text(page, encoding='utf-8')
print(json.dumps({'companies':len(company_summary),'internalCompanies':len(internal),'leadingCompanies':len(leading),'counts':counts,'rows':len(coverage)},ensure_ascii=False,indent=2))
