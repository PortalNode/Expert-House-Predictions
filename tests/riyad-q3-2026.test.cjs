const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const html=fs.readFileSync(require.resolve('../index.html'),'utf8');
const source=fs.readFileSync(require.resolve('../assets/riyad-capital-q3-2026.js'),'utf8');
const companies=JSON.parse(html.match(/const COMPANIES\s*=\s*(\[[^\n]+\]);/)[1]);
const names=new Set(companies.map(company=>company.name));
const context={S:{extra:{}},EXPERTS:['الرياض المالية','الأهلي المالية'],canonicalCompany:name=>name};
vm.createContext(context);
const snippet=(start,end)=>html.slice(html.indexOf(start),html.indexOf(end));
vm.runInContext(source+'\nglobalThis.forecasts=RIYAD_Q3_2026_FORECASTS;',context);
vm.runInContext(snippet('function seedPublishedRiyadForecasts(', 'function applyPrevOverrides('),context);
vm.runInContext(snippet('function ensureRow(', 'function recalcAvg('),context);
vm.runInContext(snippet('function numOrNull(', 'function fmt('),context);

test('the report lists 41 unique site companies, with a source page and valid net-income value',()=>{
  assert.equal(context.forecasts.length,41);
  assert.equal(new Set(context.forecasts.map(entry=>entry.name)).size,41);
  assert.deepEqual([...context.forecasts.reduce((count,entry)=>(count.set(entry.page,(count.get(entry.page)||0)+1),count),new Map()).values()],[8,9,8,5,6,5]);
  for(const entry of context.forecasts){
    assert.ok(names.has(entry.name),entry.name);
    assert.ok(entry.reportName);
    assert.ok(Number.isFinite(entry.value));
  }
  assert.equal(context.forecasts.find(entry=>entry.name==='سابك').value,-673);
  assert.equal(context.forecasts.find(entry=>entry.name==='طيران ناس').value,-21.7);
  assert.equal(context.forecasts.find(entry=>entry.name==='أسمنت الرياض').value,21);
});

test('published Riyad forecasts seed Q3 2026 once without replacing a visitor’s existing value',()=>{
  context.S.extra={'2026_q3':[{name:'الراجحي',forecasts:{'الرياض المالية':7000,'الأهلي المالية':6800},actual:null,prev:null}]};
  context.seedPublishedRiyadForecasts();
  const rows=context.S.extra['2026_q3'];
  assert.equal(rows.length,41);
  assert.equal(rows.find(row=>row.name==='الراجحي').forecasts['الرياض المالية'],7000);
  assert.equal(rows.find(row=>row.name==='سابك').forecasts['الرياض المالية'],-673);
  assert.equal(rows.find(row=>row.name==='أسمنت الرياض').forecasts['الرياض المالية'],21);
  assert.equal(rows.find(row=>row.name==='أسمنت الرياض').name,'أسمنت الرياض');
  context.seedPublishedRiyadForecasts();
  assert.equal(context.S.extra['2026_q3'].length,41);
  context.S.extra['2026_q3'].splice(0,1);
  context.seedPublishedRiyadForecasts();
  assert.equal(context.S.extra['2026_q3'].length,40);
});
