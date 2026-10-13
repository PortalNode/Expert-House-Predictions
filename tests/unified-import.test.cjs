const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createEngine } = require("../src/earnings-core.ts");
const companies = [
  ["2010", "سابك"],
  ["2250", "المجموعة السعودية"],
  ["2290", "ينساب"],
  ["2330", "المتقدمة"],
  ["2060", "التصنيع"],
  ["2310", "سبكيم العالمية"],
  ["2020", "سابك للمغذيات الزراعية"],
  ["2350", "كيان السعودية"],
  ["2170", "اللجين"],
  ["2381", "الحفر العربية"],
  ["2382", "أديس"],
  ["2223", "لوبريف"],
  ["1322", "أماك"],
  ["2084", "مياهنا"],
  ["4003", "إكسترا"],
  ["4083", "تسهيل"],
  ["2280", "المراعي"],
  ["1304", "اليمامة للحديد"],
  ["4291", "الوطنية للتعليم"],
  ["4292", "عطاء"],
  ["7211", "عزم"],
  ["6015", "أمريكانا"],
].map(([symbol, name]) => ({ symbol, name, sector: "قطاع" }));
const engine = createEngine({
  companies,
  aliases: {
    سبكيم: "سبكيم العالمية",
    كيان: "كيان السعودية",
    "أديس القابضة": "أديس",
  },
  experts: ["الأهلي المالية", "الرياض المالية"],
});
const options = {
  kind: "forecast",
  year: 2026,
  quarter: "q3",
  expert: "الأهلي المالية",
};
const social =
  "📊 توقعات الأهلي المالية لأرباح الربع الثالث 2026 صافي الأرباح المتوقعة بالمليون ريال، ونسبة التغير السنوي. باستثناء أمريكانا، أرقامها بالمليون دولار حسب التقرير. 🧪 البتروكيماويات 🔹 سابك: خسارة 414 ⚪️ -- 🔹 المجموعة السعودية: خسارة 83.7 ⚪️ -- 🔹 ينساب: 211 🟢 +184% 🔹 المتقدمة: خسارة 33.2 ⚪️ -- 🔹 التصنيع: خسارة 172 ⚪️ -- 🔹 سبكيم: خسارة 277 ⚪️ -- 🔹 سابك للمغذيات الزراعية: 241 🔴 -81.5% 🔹 كيان: خسارة 786 ⚪️ --";
test("social post preserves all eight net forecasts, signs, house, and currency", () => {
  const result = engine.preview(social, options);
  assert.deepEqual(
    result.rows.map((r) => r.value),
    [-414, -83.7, 211, -33.2, -172, -277, 241, -786],
  );
  assert.ok(
    result.rows.every(
      (r) =>
        r.currency === "SAR" &&
        r.expert === "الأهلي المالية" &&
        !r.errors.length,
    ),
  );
});
module.exports = { engine, options, social };
test("fragmented markdown tables ignore analyst-link IDs and growth percentages", () => {
  const fragment =
    "**الشركة**\n| |\n| - |\n**الربع الثالث 2026 (المتوقع)**\n**التغير سنوياً**\n**متوسط**\n**توقعات المحللين**\n**قطاع البتروكيماويات**\n" +
    [
      ["اللجين", "52", "+217.2 %"],
      ["سبكيم", "(229)", "--"],
      ["كيان", "(644)", "--"],
      ["الحفر العربية", "20", "--"],
      ["أديس القابضة", "75", "(65.0 %)"],
      ["لوبريف", "437", "+56.7 %"],
      ["أماك", "67", "(17.7 %)"],
      ["مياهنا", "3", "(34.2 %)"],
    ]
      .map(([name, value, growth]) =>
        [
          name,
          value,
          growth,
          "[متوسط التوقعات](https://www.argaam.com/ar/analystestimates/analystrecomendationsestimate/3/4434/4)",
        ]
          .map((x) => "| |\n| - |\n**" + x + "**")
          .join("\n"),
      )
      .join("\n");
  assert.deepEqual(
    engine.preview(fragment, options).rows.map((r) => r.value),
    [52, -229, -644, 20, 75, 437, 67, 3],
  );
});
test("result import links actual, comparable and date for each fiscal period, without forecasts", () => {
  const raw =
    "| تاريخ | الشركة | الربع الثالث 2025 | الربع الثالث 2026 | التغير (%) | تطور الأرباح |\n|--:|--|--:|--:|--:|--|\n| 2026/10/11 | [المتقدمة](https://www.argaam.com/ar/company/companyoverview/marketid/3/companyid/1007) | 71.81 | 4.00 | (94.43 %) | [تطور الأرباح](https://www.argaam.com/ar/financial-reports/company-report/1007/2026/72) |\n| 2026/06/10 | الوطنية للتعليم | 57.03 | 67.60 | 18.54 % |";
  const rows = engine.preview(raw, { ...options, kind: "result" }).rows;
  assert.equal(rows.length, 2);
  assert.deepEqual(
    rows.map((r) => [
      r.company,
      r.value,
      r.previous,
      r.date,
      r.year,
      r.quarter,
    ]),
    [
      ["المتقدمة", 4, 71.81, "2026-10-11", 2026, "q3"],
      ["الوطنية للتعليم", 67.6, 57.03, "2026-06-10", 2026, "q3"],
    ],
  );
});
test("ambiguous dates, mismatching periods and duplicate conflicts require correction", () => {
  const r = engine.preview("الشركة\tالربع الثاني 2026\nسابك\t414", {
    ...options,
  });
  assert.ok(r.rows[0].errors.length);
  const d = engine.preview("الوطنية للتعليم\t06/10/2026", {
    ...options,
    kind: "date",
  });
  assert.ok(d.rows[0].errors.length);
  const duplicates = engine.preview("سابك: 10\nسابك: 20", options);
  assert.ok(duplicates.rows.every((r) => r.errors.length));
});
test("separate lines never borrow a value from another unknown company", () => {
  const r = engine.preview("سابك\nشركة غير معروفة\n100", options);
  assert.equal(r.rows.length, 0);
  assert.ok(r.issues.length);
});
test("commit preserves existing values, merges new houses and results, and reports conflicts", () => {
  const state = {
    forecasts: {
      "2026_q3": [
        {
          name: "سابك",
          forecasts: { "الأهلي المالية": -99, "الرياض المالية": -673 },
          actual: null,
          prev: null,
        },
      ],
    },
    announcements: {},
  };
  const rows = engine.preview("سابك: خسارة 414\nينساب: 211", options).rows;
  const result = engine.commit(rows, state, { policy: "preserve" });
  assert.equal(result.errors.length, 0);
  assert.equal(
    result.state.forecasts["2026_q3"][0].forecasts["الأهلي المالية"],
    -99,
  );
  assert.equal(
    result.state.forecasts["2026_q3"][0].forecasts["الرياض المالية"],
    -673,
  );
  assert.equal(
    result.state.forecasts["2026_q3"][1].forecasts["الأهلي المالية"],
    211,
  );
  assert.equal(result.conflicts, 1);
  assert.equal(state.forecasts["2026_q3"].length, 1, "input remains untouched");
  const replace = engine.commit(rows, state, { policy: "replace" });
  assert.equal(
    replace.state.forecasts["2026_q3"][0].forecasts["الأهلي المالية"],
    -414,
  );
});
test("USD requires explicit conversion and retains source currency; one invalid row blocks all writes", () => {
  const rows = engine.preview("أمريكانا: 10 مليون دولار", options).rows;
  const state = { forecasts: {}, announcements: {} };
  assert.ok(engine.commit(rows, state, {}).errors.length);
  const saved = engine.commit(rows, state, { fx: 3.75 });
  assert.equal(
    saved.state.forecasts["2026_q3"][0].forecasts["الأهلي المالية"],
    37.5,
  );
  assert.equal(Object.values(saved.state.provenance)[0].currency, "USD");
  const bad = engine.commit(
    [...rows, { ...rows[0], company: "شركة مجهولة" }],
    state,
    { fx: 3.75 },
  );
  assert.ok(bad.errors.length);
  assert.deepEqual(bad.state, state);
});
test("announcement seed preserves visitor edits and fiscal-year labels for all supplied records", () => {
  const { seedHistory, projectDate } = require("../src/earnings-core.ts");
  const source = [
    {
      symbol: "4291",
      company: "الوطنية للتعليم",
      history: [
        { year: 2025, quarter: "Q3", date: "2025-06-09" },
        { year: 2024, quarter: "Q3", date: "2024-06-10" },
        { year: 2026, quarter: "Q3", date: "2026-06-10" },
      ],
    },
  ];
  const saved = { "الوطنية للتعليم": { "2026_q3": "2026-06-11" } };
  const result = seedHistory(source, saved, (name) => engine.resolve(name));
  assert.equal(result["الوطنية للتعليم"]["2026_q3"], "2026-06-11");
  assert.equal(result["الوطنية للتعليم"]["2024_q3"], "2024-06-10");
  const pred = projectDate(result["الوطنية للتعليم"], 2027, "q3");
  assert.ok(
    pred.date.startsWith("2027-06"),
    "fiscal Q3 must not move to October",
  );
  assert.equal(pred.count, 3);
  assert.equal(
    projectDate(result["الوطنية للتعليم"], 2026, "q3").confirmed,
    true,
  );
});
test("legacy backups from both apps are reviewable and keep all research houses", () => {
  const mawid = engine.previewBackup({
    records: [
      { symbol: "4291", year: 2026, quarter: "Q3", date: "2026-06-10" },
    ],
  });
  assert.equal(mawid.rows.length, 1);
  assert.equal(mawid.rows[0].company, "الوطنية للتعليم");
  const legacy = engine.previewBackup({
    version: 4,
    forecasts: {
      "2026_q3": [
        {
          name: "سابك",
          forecasts: { "الأهلي المالية": -414, "الرياض المالية": -673 },
          actual: 4,
          prev: 71.81,
        },
      ],
    },
    announcements: { سابك: { "2026_q3": "2026-10-11" } },
  });
  const saved = engine.commit(
    legacy.rows,
    { forecasts: {}, announcements: {} },
    {},
  );
  assert.equal(saved.errors.length, 0);
  assert.equal(saved.state.forecasts["2026_q3"][0].actual, 4);
  assert.equal(
    saved.state.forecasts["2026_q3"][0].forecasts["الرياض المالية"],
    -673,
  );
  assert.equal(saved.state.announcements["سابك"]["2026_q3"], "2026-10-11");
  assert.throws(() =>
    engine.previewBackup(JSON.parse('{"forecasts":{"__proto__":[]}}')),
  );
});
test("explicit column positions survive blank cells; header units and unknown companies are surfaced", () => {
  const rows = engine.preview(
    "تاريخ\tالشركة\tالربع الثالث 2025\tالربع الثالث 2026\tالتغير\n2026/10/11\tالمتقدمة\t\t4\t--",
    { ...options, kind: "result" },
  ).rows;
  assert.equal(rows[0].value, 4);
  assert.equal(rows[0].previous, null);
  const bn = engine.preview(
    "توقعات الأهلي المالية بالمليار ريال\nسابك\t2.5",
    options,
  );
  assert.equal(bn.rows[0].value, 2500);
  const unknown = engine.preview("سابك: 10\nشركة غير معروفة: 20", options);
  assert.equal(unknown.rows.length, 1);
  assert.ok(unknown.issues.length);
});
test("backup restores provenance and rejects unsafe research-house markup", () => {
  const rows = engine.preview("سابك: 10", options).rows;
  const saved = engine.commit(
    rows,
    { forecasts: {}, announcements: {} },
    {},
  ).state;
  const backup = { version: 5, ...saved };
  const again = engine.commit(
    engine.previewBackup(backup).rows,
    { forecasts: {}, announcements: {} },
    {},
  );
  assert.equal(Object.values(again.state.provenance)[0].raw, "سابك: 10");
  const attack = engine.commit(
    [{ ...rows[0], expert: "<img src=x onerror=alert(1)>" }],
    { forecasts: {}, announcements: {} },
    {},
  );
  assert.ok(attack.errors.length);
});
test("row-level dollar and billion units cannot change a neighboring company", () => {
  const rows = engine.preview(
    "سابك: 2 مليار ريال\nأمريكانا: 10 مليون دولار\nينساب: 211",
    options,
  ).rows;
  assert.deepEqual(
    rows.map((r) => [r.value, r.currency]),
    [
      [2000, "SAR"],
      [10, "USD"],
      [211, "SAR"],
    ],
  );
});
test("thousands separators in prose are amounts, and symbol edits resolve to one canonical company", () => {
  const rows = engine.preview("سابك: 1,234.56\nينساب 2,345.67", options).rows;
  assert.deepEqual(
    rows.map((r) => r.value),
    [1234.56, 2345.67],
  );
  const duplicated = engine.commit(
    [rows[0], { ...rows[0], company: "2010", symbol: "wrong" }],
    { forecasts: {}, announcements: {} },
    {},
  );
  assert.ok(duplicated.errors.length);
});
