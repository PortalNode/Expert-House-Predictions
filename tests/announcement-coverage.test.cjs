const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { seedHistory } = require('../src/earnings-core.ts');

function load(file, property) {
  const context = {};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(require.resolve(file), 'utf8'), context);
  return context[property];
}

test('archived financial announcements complete missing historical quarters with a traceable source', () => {
  const imported = load('../assets/announcement-updates.js', 'ANNOUNCEMENT_UPDATES');
  const riyad = imported.records.find(r => r.symbol === '1010' && r.year === 2021 && r.quarter === 'Q1');
  const nama = imported.records.find(r => r.symbol === '2210' && r.year === 2021 && r.quarter === 'Q1');
  assert.equal(riyad.date, '2021-04-29');
  assert.equal(nama.date, '2021-05-02');
  assert.ok(riyad.sourceUrl.startsWith('https://'));
  assert.ok(nama.sourceUrl.startsWith('https://'));
});

test('newly published third-quarter results appear under their announced dates', () => {
  const imported = load('../assets/announcement-updates.js', 'ANNOUNCEMENT_UPDATES');
  const expected = new Map([
    ['2330', '2026-10-11'],
    ['4003', '2026-10-08'],
    ['4083', '2026-10-08'],
    ['4190', '2026-10-13'],
  ]);
  for (const [symbol, date] of expected) {
    const result = imported.records.find(r => r.symbol === symbol && r.year === 2026 && r.quarter === 'Q3');
    assert.equal(result?.date, date, `2026 Q3 announcement for ${symbol}`);
    assert.ok(result?.sourceUrl.startsWith('https://'));
  }
});

test('the fiscal-year grouping follows each issuer and records transitions', () => {
  const calendars = load('../assets/fiscal-calendars.js', 'FISCAL_CALENDARS');
  assert.equal(calendars['1304'].yearEnd, '09-30');
  assert.equal(calendars['1321'].yearEnd, '03-31');
  assert.equal(calendars['4291'].yearEnd, '07-31');
  assert.equal(calendars['4291'].previousYearEnd, '08-31');
  assert.equal(calendars['4240'].yearEnd, '12-31');
  assert.equal(calendars['4240'].previousYearEnd, '03-31');
  assert.equal(calendars['4321'].previousYearEnd, '03-31');
  assert.equal(calendars['2270'].previousYearEnd, '03-31');
  assert.equal(calendars['4147'].yearEnd, '03-31');
  assert.equal(calendars['4330'].cadence, 'fund');
  assert.ok(Object.keys(calendars).length >= 269);
});

test('the first estimated result is the displayed announcement date when a later detailed filing exists', () => {
  const imported = load('../assets/announcement-updates.js', 'ANNOUNCEMENT_UPDATES');
  const first = imported.earlierEstimatedAnnouncements.find(r => r.symbol === '2330' && r.year === 2026 && r.quarter === 'Q2');
  assert.equal(first.date, '2026-07-12');
  assert.equal(first.previousDate, '2026-07-21');
  assert.ok(first.sourceUrl.startsWith('https://'));
  assert.ok(first.finalSourceUrl.startsWith('https://'));
  for (const row of imported.earlierEstimatedAnnouncements) {
    assert.ok(row.date < row.previousDate, `estimated result must precede detailed filing: ${row.symbol} ${row.year} ${row.quarter}`);
    assert.equal(row.periodEnd.slice(0, 4) <= String(row.year), true);
  }
});

test('first preliminary twelve-month results take priority over later annual filings', () => {
  const imported = load('../assets/announcement-updates.js', 'ANNOUNCEMENT_UPDATES');
  const group = imported.earlierEstimatedAnnouncements.find(r => r.symbol === '2250' && r.year === 2025 && r.quarter === 'Q4');
  const othaim = imported.earlierEstimatedAnnouncements.find(r => r.symbol === '4001' && r.year === 2024 && r.quarter === 'Q4');
  assert.deepEqual([group?.date, group?.previousDate], ['2026-02-05', '2026-03-11']);
  assert.deepEqual([othaim?.date, othaim?.previousDate], ['2025-02-11', '2025-03-25']);
  assert.ok(group.sourceUrl.includes('mubasher.info'));
});

test('unresolved historical fiscal labels are flagged instead of presented as confirmed', () => {
  const issues = load('../assets/announcement-issues.js', 'ANNOUNCEMENT_ISSUES');
  const cenomi = issues.find(r => r.symbol === '4240' && r.year === 2021 && r.quarter === 'Q3');
  assert.equal(cenomi.date, '2022-02-07');
  assert.equal(cenomi.periodEnd, '2021-12-31');
  assert.ok(cenomi.sourceUrl.startsWith('https://'));
  assert.ok(!issues.some(r => r.symbol === '4240' && r.year === 2022 && r.quarter === 'Q1'));
  assert.ok(!issues.some(r => r.symbol === '7030' && r.year === 2023 && r.quarter === 'Q2'));
  assert.ok(!issues.some(r => r.symbol === '4180' && r.year === 2023 && r.quarter === 'Q2'));
  assert.ok(!issues.some(r => r.symbol === '4100' && r.year === 2022 && r.quarter === 'Q1'));
  assert.ok(issues.some(r => r.symbol === '2270' && r.year === 2023 && r.quarter === 'Q3'));
  assert.ok(issues.length > 100);
});

test('new dates appear in the calendar while a visitor date retains precedence', () => {
  const imported = load('../assets/announcement-updates.js', 'ANNOUNCEMENT_UPDATES');
  const grouped = [...new Set(imported.records.map(r => r.symbol))].map(symbol => ({
    symbol,
    company: imported.records.find(r => r.symbol === symbol).company,
    history: imported.records.filter(r => r.symbol === symbol),
  }));
  const resolver = name => ({ name: name === '1010' ? 'الرياض' : name === '2210' ? 'نماء للكيماويات' : name });
  const seeded = seedHistory(grouped, { الرياض: { '2021_q1': '2021-04-30' } }, resolver);
  assert.equal(seeded.الرياض['2021_q1'], '2021-04-30');
  assert.equal(seeded['نماء للكيماويات']['2021_q1'], '2021-05-02');
});

test('every added quarter has one published date and an inspectable source', () => {
  const imported = load('../assets/announcement-updates.js', 'ANNOUNCEMENT_UPDATES');
  const original = load('../assets/announcement-history.js', 'ANNOUNCEMENT_HISTORY');
  const oldKeys = new Set(original.forecasts.flatMap(c => c.history.map(r => `${c.symbol}|${r.year}|${r.quarter}`)));
  const seen = new Set();
  for (const row of imported.records) {
    const key = `${row.symbol}|${row.year}|${row.quarter}`;
    assert.ok(!seen.has(key), `duplicate addition: ${key}`);
    assert.ok(!oldKeys.has(key), `overwrote attached history: ${key}`);
    assert.ok(/^https:\/\//.test(row.sourceUrl), `missing source: ${key}`);
    assert.ok(row.periodEnd <= row.date && row.date <= imported.asOf, `invalid chronology: ${key}`);
    seen.add(key);
  }
  assert.ok(seen.size > 1000);
});

test('corrected bank defaults agree with dated issuer records in the attached history', () => {
  const imported = load('../assets/announcement-updates.js', 'ANNOUNCEMENT_UPDATES');
  const original = load('../assets/announcement-history.js', 'ANNOUNCEMENT_HISTORY');
  const originalBySymbol = new Map(original.forecasts.map(c => [c.symbol, c]));
  assert.equal(imported.verifiedBankCorrections.length, 50);
  for (const row of imported.verifiedBankCorrections) {
    const historic = originalBySymbol.get(row.symbol)?.history.find(r => r.year === row.year && r.quarter === row.quarter);
    assert.equal(historic?.date, row.date);
    assert.notEqual(row.replacesBuiltInBankDate, row.date);
    assert.ok(row.sourceUrl.startsWith('https://'));
  }
});
