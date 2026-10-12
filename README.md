# رَصد الأرباح — تحسين الواجهة

واجهة فاتحة بلمسات خضراء، مع دعم المظهر الداكن والشاشات الصغيرة.

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

تم التحقق في المتصفح من الإدخال والمراجعة والحفظ والإضافة اليدوية وتحديث مؤشر بيت الخبرة بعد الحفظ وتغيير الفترة، ومن التنقل بين الأقسام الثمانية وعدم تجاوز عرض الجوال، والرجوع والتقدم والمظهر الداكن.

المشروع الأصلي صفحة ثابتة بلغة جافاسكربت، دون عملية بناء أو تثبيت حزم جديدة. لم يُختبر التحليل المتقدم بمفتاح خارجي.

## Unified earnings and announcement workspace

The static app now includes the attached 233-company announcement history, a shared import/review workflow, manual entry, CSV/TSV/text/HTML input, legacy JSON backup migration, explicit currency conversion, conflict handling, undo, and a responsive calendar linked to financial results.

Open `index.html`, or serve the repository with any static server. No server-side database is required. Data remains in the current browser origin; use **إدارة البيانات** to export it before moving between a local preview and GitHub Pages.

See [integration notes](docs/integration.md) for migration and [validation](docs/validation.md) for tested behavior. Build with `npm run build`, verify with `npm test`, and typecheck with `npm run typecheck` when TypeScript is installed.
