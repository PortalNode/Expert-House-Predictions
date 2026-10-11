const {test} = require('node:test');
const assert = require('node:assert/strict');
const {countExpertForecastsForPeriod} = require('../assets/expert-coverage.js');
const {parseEntryNumber} = require('../assets/entry-number.js');

test('counts saved companies for each house without counting the same company twice', () => {
  const experts = ['الراجحي المالية', 'الأهلي المالية'];
  const base = [{name:'مصرف الراجحي', forecasts:{'الراجحي المالية':100}}];
  const edited = [
    {name:'الراجحي', forecasts:{'الراجحي المالية':125,'الأهلي المالية':0}},
    {name:'الأهلي', forecasts:{'الراجحي المالية':null,'الأهلي المالية':200}},
    {name:'بنك الرياض', forecasts:{'الراجحي المالية':'','الأهلي المالية':null}}
  ];
  const canonical = name => name === 'مصرف الراجحي' ? 'الراجحي' : name;
  const counts = countExpertForecastsForPeriod(experts, base, edited, canonical, parseEntryNumber);
  assert.equal(counts.get('الراجحي المالية'), 1);
  assert.equal(counts.get('الأهلي المالية'), 2);
});

test('has no saved forecasts for an empty quarter', () => {
  const counts = countExpertForecastsForPeriod(['الراجحي المالية'], [], [], name => name, parseEntryNumber);
  assert.equal(counts.get('الراجحي المالية'), 0);
});
