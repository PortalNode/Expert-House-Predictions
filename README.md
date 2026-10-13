# رَصد الأرباح — تحسين الواجهة

واجهة عربية موحدة للتوقعات والنتائج ومواعيد الإعلانات، مع ثلاثة مظاهر ودعم الشاشات الصغيرة.

## التشغيل

افتح الملف الرئيسي في المتصفح، أو شغّل خادمًا محليًا:

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

## التغييرات

- تبسيط الشريط العلوي وفصل فترة التقارير عن إجراءات الإدخال.
- قائمة تنقل واضحة على الجوال تشمل جميع الأقسام، مع دعم الرجوع والتقدم وروابط الأقسام.
- ترتيب نموذج التوقعات، وتقليل النصوص المكررة، وإضافة مثال اختياري واضح أنه تجريبي.
- إظهار بيوت الخبرة التي لها توقعات مضافة وعدد شركاتها بجانب اختيار بيت الخبرة، مع تحديث الحالة حسب السنة والربع وبعد الحفظ.
- رسائل خطأ بجانب الحقول، وتحسين التركيز بلوحة المفاتيح والانتقال إلى المراجعة.
- قبول الأرقام العربية والفواصل والخسائر بين قوسين في الإدخال اليدوي.
- منع حفظ القيم الفارغة كأصفار، وإبطال المراجعة القديمة عند تعديل النص أو فترة الإدخال.
- الحفاظ على مفاتيح التخزين المحلية ومنطق حساب الأرباح والمتوسطات.
- نشر توقعات الرياض المالية لصافي دخل 41 شركة في الربع الثالث 2026 من تقريرها الصادر في 11 أكتوبر 2026، بوحدة مليون ريال. تُسجّل الخسائر بقيم سالبة، وتُحفظ القيم التي أدخلها الزائر سابقًا عند دمج التوقعات المنشورة.

مصدر التوقعات: الرياض المالية، «نظرة عامة على سوق الأسهم السعودي — الربع الثالث 2026، الجزء 2 من 2»، الصفحات 1–6، عمود «صافي الدخل — الربع الثالث 2026». حُفظت أسماء الشركات كما تظهر في التقرير وأسماء الموقع المطابقة لها في `assets/riyad-capital-q3-2026.js` لتسهيل المراجعة.

## التحقق

```sh
node --test tests/input-validation.test.cjs
```

نجحت اختبارات عدّ الشركات دون تكرار، والقيم الفارغة والصفر والخسائر والأرقام العربية ومنع الحفظ الجزئي عند وجود حقل غير صالح.

تم التحقق في المتصفح من الإدخال والمراجعة والحفظ والإضافة اليدوية وتحديث مؤشر بيت الخبرة بعد الحفظ وتغيير الفترة، ومن التنقل بين الأقسام وعدم تجاوز عرض الجوال، والرجوع والتقدم والمظهر الداكن.

المشروع صفحة ثابتة مع وحدات أساسية بلغة TypeScript تُبنى إلى JavaScript. لم يُختبر التحليل المتقدم بمفتاح خارجي.

## Unified earnings and announcement workspace

The static app now includes the attached 233-company announcement history, a shared import/review workflow, manual entry, CSV/TSV/text/HTML input, legacy JSON backup migration, explicit currency conversion, conflict handling, undo, and a responsive calendar linked to financial results.

Open `index.html`, or serve the repository with any static server. No server-side database is required. Data remains in the current browser origin; use **إدارة البيانات** to export it before moving between a local preview and GitHub Pages.

See [integration notes](docs/integration.md) for migration and [validation](docs/validation.md) for tested behavior. Build with `npm run build`, verify with `npm test`, and typecheck with `npm run typecheck` when TypeScript is installed.

## Historical announcement coverage through 13 October 2026

`assets/announcement-updates.js` adds 1,079 source-linked financial-result announcement dates for fiscal 2021 onward, replaces 106 later filing dates with the first preliminary or estimated results disclosure for the same period, and resolves 50 conflicting built-in bank defaults. The first-result correction retains the previous date and available source link for review. On an existing browser, the migration changes a default only when its saved date still equals the old default and has no visitor provenance; visitor edits remain intact.

`assets/fiscal-calendars.js` groups all 269 listed companies and funds by their current fiscal-year end, with prior ends and transition years for Cenomi Retail, Cenomi Centers, SADAFCO, National Company for Learning & Education, and Makkah. The calendar filter uses the year selected by the visitor. The 19 listed real-estate funds form a separate group because this audit does not treat their financial reports as operating-company quarters. Current issuer calendars were derived from financial-result notice headings and cross-checked against [Saudi Exchange's fiscal-deadline list](https://www.saudiexchange.sa/wps/portal/saudiexchange/rules-guidance/capital-market-overview/Restrictions-Periods-and-Financials-Deadline?locale=ar); transition announcements are linked in `assets/fiscal-calendars.js`.

Run `python3 scripts/build-announcement-audit.py OUTPUT_DIR` to export the quarter-by-quarter CSV, company summary, fiscal-year classification, first-result comparison, and HTML gap report. The checked-in `data/issuer-results-evidence.json` contains dated issuer-result headings and links from the archived Saudi Exchange notices, mirrored by Mubasher, so the audit is reproducible without network access. Across 250 operating companies since 2021, 3,473 entries from the attached file matched an archived announcement heading and 1,222 entries have a specific source link in the supplemental or correction data. Another 105 original dates had no matching archived notice, and 11 matched a notice whose heading did not agree with the stored year/quarter label; these 116 are flagged in `assets/announcement-issues.js` and are not presented as confirmed announcements or used to project future dates. A heading mismatch can reflect a fiscal-year transition or a malformed notice, so it requires individual review before correction. The audit also records 56 half-year reporting cells, four fiscal-transition cells, and 650 cells before the first result found for the company. These are not filled with inferred dates.

## Interface and research houses — 13 October 2026

The results dashboard is the starting page. Four tabs link results, announcement dates, research houses, and forecast accuracy. The header provides **إضافة بيانات** and **الإعدادات**. Company names open their financial detail page. Stock-performance views, price columns, and remote price requests have been removed.

In **بيوت الخبرة**, choose **إضافة بيت خبرة** to save a name, optional short name, and alternative names even before entering forecasts. Select a house and choose **إدارة البيت المحدد** to rename or archive it. Renaming keeps historical forecasts and their sources. Archiving hides it from new-entry suggestions while retaining its historical contribution to averages; it can be reactivated. Duplicate names and aliases are rejected. JSON backups include this registry, including empty houses.

**الإعدادات** offers كحلي فاتح, زمردي هادئ, and ليلي احترافي. The selection persists in the current browser. Existing earnings and announcement-date data stay available.

Run `npm run check`, `npm run typecheck`, and `npm run test:browser`. The browser tests require Playwright and Chrome; set `PLAYWRIGHT_PATH` and `CHROME_PATH` if they are not at the defaults in the test scripts.
