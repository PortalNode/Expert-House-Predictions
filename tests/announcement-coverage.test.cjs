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
