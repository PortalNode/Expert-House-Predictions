const {chromium}=require(process.env.PLAYWRIGHT_PATH || 'playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try {
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 const errors=[],priceRequests=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('request',r=>{if(/yahoo|corsproxy|allorigins|codetabs/.test(r.url()))priceRequests.push(r.url());});
 await page.route('https://**/*',r=>r.abort());
 await page.goto('file://'+path.resolve('index.html'));
 const separated=await browser.newPage({viewport:{width:390,height:844}});
 separated.on('pageerror',e=>errors.push(e.message));
 await separated.route('https://**/*',r=>r.abort());
 await separated.goto('file://'+path.resolve('index.html'));
 await separated.selectOption('#ySel','2025');
 await separated.selectOption('#qSel','q3');
 const screenshotNames=['المجموعة السعودية','لوبريف','ساسكو','مياهنا','إنتاج','المطاحن الأولى','الآمار','جاز','شري','العقارية','مسار','سماسكو'];
 const forecastNames=await separated.locator('#tbody [data-company-open]').evaluateAll(els=>els.map(el=>el.textContent));
 for(const name of screenshotNames)assert.ok(!forecastNames.includes(name),'result-only company in forecast page: '+name);
 await separated.click('[data-tab="t7"]');
 assert.equal(new URL(separated.url()).hash,'#reported-results');
 const announcedNames=await separated.locator('#tbody [data-company-open]').evaluateAll(els=>els.map(el=>el.textContent));
 for(const name of screenshotNames)assert.ok(announcedNames.includes(name),'missing announced result: '+name);
 assert.ok(await separated.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'announced page overflows on phone');
 fs.mkdirSync('work/browser-check',{recursive:true});
 await separated.screenshot({path:'work/browser-check/mobile-announced.png',fullPage:false,animations:'disabled'});
 assert.deepEqual(await separated.evaluate(()=>Q3_2025_SCREENSHOT_RESULTS.map(item=>getData().find(row=>row.name===item.name)?.actual)),[-62.35,666,8.9,3,-12,67,16,41,18,40,692,43]);
 assert.equal(await separated.evaluate(()=>getPriorActualMap('2026','q3')['مسار']),692);
 await separated.evaluate(()=>{S.extra['2025_q3']=[{name:'مسار',actual:700,forecasts:{},prev:null}];saveLS();});
 assert.equal(await separated.evaluate(()=>getPriorActualMap('2026','q3')['مسار']),700);
 await separated.reload();
 assert.equal(await separated.locator('#t7').getAttribute('aria-hidden'),'false');
 assert.equal(await separated.evaluate(()=>getPriorActualMap('2026','q3')['مسار']),700);
 assert.ok((await separated.evaluate(()=>getComputedStyle(document.body).fontFamily)).startsWith('"SF Arabic"'));
 await separated.close();
 assert.equal(await page.locator('#t1').getAttribute('aria-hidden'),'false');
 assert.equal(await page.locator('#t7').getAttribute('aria-hidden'),'true');
 assert.equal(await page.locator('.tabs .tab').count(),5);
 assert.equal(await page.locator('#thead th').count(),await page.locator('#tbody tr').first().locator('td').count());
 await page.click('[data-tab="t2"]');await page.click('#addHouse');
 await page.fill('#houseName','أفق الاختبار');await page.fill('#houseShort','أفق');await page.fill('#houseAliases','Afaq Test');await page.click('#saveHouse');
 await page.reload();
 assert.equal(await page.getByRole('button',{name:/أفق الاختبار لم يُضف/}).count(),1);
 await page.click('#addHouse');await page.fill('#houseName','افق الاختبار');await page.click('#saveHouse');
 assert.match(await page.locator('#houseError').innerText(),/موجود/);
 await page.click('#cancelHouse');
 await page.click('#globalAdd');await page.fill('#uExpert','Afaq Test');await page.click('[data-method="manual"]');await page.fill('#uCompany','سابك');await page.fill('#uValue','-12.5');
 await page.click('.u-settings summary');await page.fill('#uSource','تقرير اختباري');await page.click('#uPreview');await page.click('#uCommit');
 assert.equal(await page.locator('.u-success').count(),1);
 await page.click('[data-tab="t2"]');await page.getByRole('button',{name:/أفق الاختبار مضاف/}).click();await page.click('#editHouse');
 await page.fill('#houseName','أفق للأبحاث');await page.check('#houseArchived');await page.click('#saveHouse');
 await page.reload();await page.selectOption('#houseStatus','archived');
 await page.getByRole('button',{name:/أفق للأبحاث مضاف/}).click();
 assert.match(await page.locator('#expDet').innerText(),/-12.50/);
 await page.click('#globalAdd');
 assert.equal(await page.locator('#uExperts option[value="أفق للأبحاث"]').count(),0);
 await page.fill('#uText','سابك: 10');
 // Use the exact previous name to confirm archives cannot receive new imports via aliases.
 await page.fill('#uExpert','أفق الاختبار');await page.click('#uPreview');await page.click('#uCommit');
 assert.match(await page.locator('#uError').innerText(),/مؤرشف/);
 await page.click('#settingsButton');
 const downloading=page.waitForEvent('download');await page.getByRole('button',{name:'تصدير نسخة احتياطية',exact:true}).click();const download=await downloading;
 const backup=JSON.parse(fs.readFileSync(await download.path(),'utf8'));
 assert.equal(backup.expertRegistry.find(h=>h.name==='أفق للأبحاث').archived,true);
 assert.equal(backup.forecasts['2026_q3'].find(r=>r.name==='سابك').forecasts['أفق للأبحاث'],-12.5);
 assert.equal(backup.provenance['2010|2026_q3|forecast|أفق للأبحاث'].source,'تقرير اختباري');
 // Restore metadata and the same forecast into an independent browser context.
 const restored=await browser.newPage();await restored.route('https://**/*',r=>r.abort());
 restored.on('pageerror',e=>errors.push(e.message));await restored.goto('file://'+path.resolve('index.html'));await restored.click('#globalAdd');await restored.click('[data-method="file"]');
 const payload={...backup,forecasts:{'2026_q3':[backup.forecasts['2026_q3'].find(r=>r.name==='سابك')]},announcements:{}};
 await restored.setInputFiles('#uFile',{name:'roundtrip.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(payload))});await restored.click('#uCommit');
 assert.equal(await restored.locator('.u-success').count(),1);
 await restored.click('[data-tab="t2"]');await restored.selectOption('#houseStatus','archived');await restored.getByRole('button',{name:/أفق للأبحاث مضاف/}).click();assert.match(await restored.locator('#expDet').innerText(),/-12.50/);
 // A house-only backup still has an explicit save step, and survives reload.
 await restored.click('#globalAdd');await restored.click('[data-method="file"]');
 await restored.setInputFiles('#uFile',{name:'empty-house.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({expertRegistry:[{id:'empty-house',name:'بيت بلا توقعات',shortName:'',aliases:[],archived:false}],forecasts:{},announcements:{}}))});await restored.click('#uCommit');
 assert.equal(await restored.locator('.u-success').count(),1);await restored.reload();await restored.click('[data-tab="t2"]');assert.equal(await restored.getByRole('button',{name:/بيت بلا توقعات لم يُضف/}).count(),1);
 await restored.close();
 // Appearance and mobile behaviour in all approved palettes.
 fs.mkdirSync('work/browser-check',{recursive:true});
 for(const palette of ['navy','emerald','night']){
   await page.click('#settingsButton');await page.click('[data-palette-choice="'+palette+'"]');await page.reload();
   assert.equal(await page.locator('html').getAttribute('data-palette'),palette);
   await page.screenshot({path:'work/browser-check/theme-'+palette+'.png',fullPage:false,animations:"disabled"});
   await page.setViewportSize({width:390,height:844});
   for(const section of ['t1','t7','t2','t6']){
     await page.click('[data-tab="'+section+'"]');
     const widths=await page.evaluate(()=>({view:innerWidth,content:document.documentElement.scrollWidth}));
     assert.ok(widths.content<=widths.view,'overflow '+palette+' '+section+' '+JSON.stringify(widths));
   }
   await page.click('#settingsButton');await page.screenshot({path:'work/browser-check/mobile-theme-'+palette+'.png',fullPage:true,animations:"disabled"});
   await page.setViewportSize({width:1440,height:1000});
 }
 await page.click('[data-tab="t1"]');await page.getByRole('button',{name:'سابك',exact:true}).click();assert.equal(await page.locator('#t5').getAttribute('aria-hidden'),'false');
 await page.goto('file://'+path.resolve('index.html')+'#stock-performance');assert.equal(await page.locator('#t1').getAttribute('aria-hidden'),'false');
 assert.deepEqual(priceRequests,[]);assert.deepEqual(errors,[]);
 console.log('Passed: empty house persistence, duplicates, forecast rename/archive, source-preserving backup restore, metadata-only restore, three themes, mobile, company navigation, no price requests.');
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
