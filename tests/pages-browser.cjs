const {chromium} = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');

(async () => {
  const browser = await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  const url = 'file://' + path.resolve('index.html');
  const errors = [];
  const open = async suffix => {
    const page = await browser.newPage({viewport:{width:390,height:844}});
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://**/*', route => route.abort());
    await page.goto(url + (suffix || ''));
    return page;
  };
  try {
    const page = await open();
    assert.equal(await page.evaluate(() => S.tab), 't7');
    assert.equal(await page.locator('#resultOnlyRows tr').count(), 35);
    assert.match(await page.locator('#resultOnlyRows tr').filter({hasText:'اليمامة للحديد'}).innerText(), /\+304\.0%/);
    await page.click('[data-tab="t1"]');
    assert.equal(new URL(page.url()).hash, '#forecasts');
    assert.equal(await page.locator('#tbody tr').count(), 114);
    assert.equal(await page.locator('#tbody tr').filter({hasText:'اليمامة للحديد'}).count(), 0);
    assert.match(await page.locator('#thead').innerText(), /الفعلي\/توقع/);
    await page.click('[data-tab="t7"]');
    assert.equal(new URL(page.url()).hash, '#results');
    await page.close();

    const legacy = await open('#reported-results');
    assert.equal(new URL(legacy.url()).hash, '#results');
    await legacy.selectOption('#ySel','2025');
    await legacy.selectOption('#qSel','q3');
    assert.equal(await legacy.locator('#resultOnlyRows tr').count(), 78);
    await legacy.locator('#resultOnlyRows tr').filter({hasText:'لوبريف'}).locator('[data-company-open]').first().click();
    await legacy.getByRole('button',{name:'تحميل البطاقة'}).click();
    assert.equal(await legacy.locator('#ctResults').getAttribute('class').then(value => value.includes('ct-on')), true);
    assert.equal(await legacy.locator('#ctForecast').isDisabled(), true);
    assert.match(await legacy.locator('#ctNote').innerText(), /الربع المماثل/);
    await legacy.locator('#fmtGrid .fmt-card').filter({hasText:'مربع HD'}).click();
    await legacy.getByRole('button',{name:'معاينة',exact:true}).click();
    await legacy.locator('#prevModalInner img').waitFor();
    assert.equal(await legacy.locator('#prevModalInner img').evaluate(img => img.naturalWidth),1080);
    await legacy.close();

    const saved = await browser.newPage();
    saved.on('pageerror', error => errors.push(error.message));
    await saved.route('https://**/*', route => route.abort());
    await saved.addInitScript(() => localStorage.setItem('finUnifiedV1', JSON.stringify({
      version:5, seedVersion:4,
      forecasts:{'2026_q3':[{name:'سابك',prev:999,actual:123,forecasts:{'الرياض المالية':777}}]},
      announcements:{'سابك':{'2026_q3':'2026-10-01'}}, provenance:{}
    })));
    await saved.goto(url);
    assert.deepEqual(await saved.evaluate(() => {
      const row = getData().find(item => item.name === 'سابك');
      return [row.prev,row.actual,row.forecasts['الرياض المالية'],S.announcements['سابك']['2026_q3'],getData().filter(hasNumericForecast).length,JSON.parse(localStorage.getItem('finUnifiedV1')).seedVersion];
    }),[999,123,777,'2026-10-01',114,5]);
    await saved.close();

    const imported = await open();
    await imported.click('#globalAdd');
    await imported.click('[data-kind="result"]');
    await imported.click('[data-method="manual"]');
    await imported.fill('#uYear','2027');
    await imported.selectOption('#uQuarter','q1');
    await imported.fill('#uCompany','اليمامة للحديد');
    await imported.fill('#uValue','62.09');
    await imported.fill('#uPrevious','15.37');
    await imported.fill('#uDate','2027-04-20');
    await imported.click('#uPreview');
    assert.equal(await imported.locator('#uReview [data-review]').count(),1);
    await imported.click('#uCommit');
    assert.equal(await imported.evaluate(() => getData().find(row => row.name === 'اليمامة للحديد').actual),62.09);
    await imported.click('#uViewResults');
    assert.equal(await imported.locator('#resultOnlyRows tr').count(),1);
    await imported.click('[data-tab="t1"]');
    assert.equal(await imported.locator('#tbody [data-company-open]').count(),0);
    await imported.close();
    assert.deepEqual(errors,[]);
    console.log('Passed: published counts, unified results, forecasts, cards without forecasts, saved-data migration, and results import without forecasts.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
