/* Product navigation, research-house management and persistent appearance. */
(function () {
  const $ = id => document.getElementById(id);
  const safe = value => esc(String(value ?? ''));
  const bidi = value => '\u2067' + String(value).replace(/[A-Za-z0-9][A-Za-z0-9.,:/_%+\-]*/g, s => '\u2066'+s+'\u2069') + '\u2069';
  const themes = [
    ['navy','كحلي فاتح','وضوح يومي بألوان كحلية وزرقاء'],
    ['emerald','زمردي هادئ','أبيض دافئ ولمسات خضراء'],
    ['night','ليلي احترافي','فحمي كحلي وتباين مريح'],
  ];
  const settings = document.createElement('section');
  settings.className = 'settings-appearance';
  settings.innerHTML = `<div class="page-heading"><div><span class="eyebrow">مساحة عملك</span><h1>الإعدادات والمظهر</h1><p>اختر المظهر المناسب، واحتفظ بنسخة من بياناتك.</p></div><button class="btn bo" data-return-results>العودة للنتائج</button></div><div class="appearance-panel"><h2>مظهر الواجهة</h2><p>يُحفظ اختيارك تلقائيًا على هذا المتصفح.</p><div class="palette-grid">${themes.map(([id,name,description]) => `<button class="palette-card" data-palette-choice="${id}" aria-pressed="false"><span class="palette-preview palette-${id}" aria-hidden="true"><i></i><span><b></b><b></b><b></b></span><em></em><em></em></span><strong>${name}</strong><small>${description}</small><span class="palette-check" aria-hidden="true">✓</span></button>`).join('')}</div><p id="appearanceFeedback" role="status"></p></div><h2 class="section-heading">البيانات والنسخ الاحتياطي</h2>`;
  $('t4').prepend(settings);
  $('t4').setAttribute('aria-label','الإعدادات والمظهر');
  function chooseTheme(value, persist=true) {
    const palette = themes.some(t=>t[0]===value) ? value : 'navy';
    document.documentElement.dataset.palette = palette;
    document.documentElement.dataset.theme = palette === 'night' ? 'dark' : 'light';
    document.querySelector('meta[name="theme-color"]').content = {navy:'#f3f6fb',emerald:'#f4f8f5',night:'#101827'}[palette];
    document.querySelectorAll('[data-palette-choice]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.paletteChoice===palette)));
    if (persist) {
      try {localStorage.setItem('rasdPaletteV1',palette);$('appearanceFeedback').textContent='تم حفظ المظهر';}
      catch { $('appearanceFeedback').textContent='تعذر حفظ المظهر؛ سيطبق خلال هذه الجلسة.'; }
    }
  }
  let initial='navy';
  try {initial=localStorage.getItem('rasdPaletteV1') || (localStorage.getItem('themeV2')==='dark'?'night':'navy');} catch {}
  chooseTheme(initial,false);
  settings.querySelectorAll('[data-palette-choice]').forEach(b=>b.onclick=()=>chooseTheme(b.dataset.paletteChoice));
  document.querySelectorAll('[data-return-results]').forEach(b=>b.onclick=()=>navigateSection('t1'));

  const intro = document.createElement('section');
  intro.className='page-heading house-heading';
  intro.innerHTML=`<div><span class="eyebrow">مصادر التوقعات</span><h1>بيوت الخبرة</h1><p>أضف البيوت الجديدة، وتابع تغطيتها وتوقعاتها في الفترة المختارة.</p></div><div class="heading-actions"><button class="btn bo" id="editHouse" disabled>إدارة البيت المحدد</button><button class="btn bg" id="addHouse">＋ إضافة بيت خبرة</button></div>`;
  $('t2').prepend(intro);
  const search = document.createElement('div');
  search.className='house-filters';
  search.innerHTML='<input class="sb" id="houseSearch" type="search" placeholder="ابحث عن بيت خبرة…" aria-label="البحث في بيوت الخبرة"><select class="fsel" id="houseStatus" aria-label="حالة بيوت الخبرة"><option value="active">البيوت النشطة</option><option value="all">جميع البيوت</option><option value="archived">البيوت المؤرشفة</option></select>';
  $('expList').before(search);
  const dialog = document.createElement('dialog');
  dialog.id='houseDialog';dialog.className='house-dialog';dialog.setAttribute('aria-labelledby','houseDialogTitle');
  dialog.innerHTML=`<form id="houseForm"><div class="dialog-heading"><div><span class="eyebrow">إدارة مصادر التوقعات</span><h2 id="houseDialogTitle">إضافة بيت خبرة</h2></div><button type="button" class="icon-button" id="closeHouse" aria-label="إغلاق">×</button></div><p class="dialog-intro">سيظهر البيت في قوائم الإدخال فور حفظه، ويمكنك إضافة توقعاته لاحقًا.</p><label>اسم بيت الخبرة <span class="required">*</span><input id="houseName" required maxlength="100" autocomplete="off" placeholder="مثل: أفق المالية"></label><label>الاسم المختصر <span class="optional">اختياري</span><input id="houseShort" maxlength="100" autocomplete="off" placeholder="مثل: أفق"></label><label>أسماء بديلة <span class="optional">اختياري</span><textarea id="houseAliases" rows="2" placeholder="اسم في كل سطر، بالعربية أو الإنجليزية"></textarea><small>تساعد على التعرف على البيت عند لصق التقارير.</small></label><label class="archive-field" id="archiveField"><input id="houseArchived" type="checkbox"><span>أرشفة بيت الخبرة<small>يُخفى من الإضافة الجديدة وتبقى توقعاته السابقة ضمن السجل والحسابات.</small></span></label><p id="houseError" class="field-error" role="alert" hidden></p><div class="dialog-actions"><button class="btn bg" type="submit" id="saveHouse">حفظ بيت الخبرة</button><button class="btn bo" type="button" id="cancelHouse">إلغاء</button></div></form>`;
  document.body.append(dialog);
  let editingId=null, returnFocus=null;
  function openHouse(id=null) {
    const house=HouseWorkspace.list().find(h=>h.id===id);
    editingId=house?.id || null;returnFocus=document.activeElement;
    $('houseForm').reset();$('houseError').hidden=true;
    $('houseDialogTitle').textContent=house?'إدارة بيت الخبرة':'إضافة بيت خبرة';
    $('houseName').value=house?.name || '';$('houseShort').value=house?.shortName || '';
    $('houseAliases').value=house?.aliases.join('\n') || '';$('houseArchived').checked=house?.archived || false;
    $('archiveField').hidden=!house;
    dialog.showModal();$('houseName').focus();
  }
  const closeHouse=()=>dialog.close();
  dialog.addEventListener('close',()=>returnFocus?.isConnected && returnFocus.focus());
  $('closeHouse').onclick=closeHouse;$('cancelHouse').onclick=closeHouse;
  $('addHouse').onclick=()=>openHouse();
  $('editHouse').onclick=()=>openHouse(HouseWorkspace.list().find(h=>h.name===S.exp)?.id);
  $('houseForm').onsubmit=event=>{
    event.preventDefault();
    try {
      const saved=HouseWorkspace.save(editingId,{name:$('houseName').value,shortName:$('houseShort').value,aliases:$('houseAliases').value.split(/[\n،,]+/).filter(Boolean),archived:$('houseArchived').checked});
      refreshHouseControls();
      if (S.tab==='t0') $('uExpert').value=saved.name;
      if (S.tab==='t2') {S.exp=saved.name;renderExpList();selExp(saved.name);}
      closeHouse();showToast('تم حفظ بيت الخبرة');
    } catch(error) { $('houseError').textContent=error.message;$('houseError').hidden=false; }
  };
  const addInline=document.createElement('button');
  addInline.id='addHouseInline';addInline.type='button';addInline.className='inline-action';addInline.textContent='＋ إضافة بيت خبرة';addInline.onclick=()=>openHouse();
  $('uExpertLabel').append(addInline);
  window.refreshHouseControls=function () {
    const houses=HouseWorkspace.list();
    const active=houses.filter(h=>!h.archived);
    $('uExperts').innerHTML=active.map(h=>`<option value="${safe(h.name)}">`).join('');
    for (const id of ['aiExp','mEx']) {
      const select=$(id);if(!select)continue;
      const old=ResearchHouses.resolveHouse(houses,select.value)?.name || select.value;
      select.innerHTML=(id==='aiExp'?'<option value="">اكتشاف من النص تلقائيًا</option>':'<option value="">— اختر بيت الخبرة —</option>')+active.map(h=>`<option value="${safe(h.name)}">${safe(h.name)}</option>`).join('');
      if(active.some(h=>h.name===old))select.value=old;
    }
    const previous=ResearchHouses.resolveHouse(houses,$('uExpert').value);if(previous)$('uExpert').value=previous.name;
    if(S.tab==='t2')renderExpList();
  };
  const originalList=renderExpList;
  renderExpList=function () {
    originalList();
    const query=normalizeArabicLookup($('houseSearch').value),status=$('houseStatus').value;
    const houses=HouseWorkspace.list();let count=0;
    $('expList').querySelectorAll('.exp-entry').forEach(button=>{
      const name=button.querySelector('.en').textContent,house=houses.find(h=>h.name===name);
      const matching=!query||normalizeArabicLookup([name,house?.shortName,...(house?.aliases || [])].join(' ')).includes(query);
      const shown=matching&&(status==='all'||(status==='archived'?house?.archived:!house?.archived));
      button.hidden=!shown;if(shown)count++;
      if(house?.archived){const tag=document.createElement('small');tag.className='archived-tag';tag.textContent='مؤرشف';button.append(tag);}
    });
    $('houseEmpty')?.remove();
    if(!count){const empty=document.createElement('p');empty.id='houseEmpty';empty.className='u-empty';empty.textContent='لا توجد بيوت خبرة مطابقة.';$('expList').append(empty);}
    $('editHouse').disabled=!houses.some(h=>h.name===S.exp);
  };
  const originalSel=selExp;
  selExp=function (name) {originalSel(name);$('editHouse').disabled=false;};
  $('houseSearch').oninput=renderExpList;$('houseStatus').onchange=renderExpList;
  const oldOpenModal=openModal;
  openModal=function(){oldOpenModal();refreshHouseControls();};
  refreshHouseControls();

  const originalTable=renderTable;
  const filterSummary=document.createElement('div');filterSummary.id='activeResultFilters';filterSummary.className='active-filters';
  document.querySelector('.quick-filter-bar').after(filterSummary);
  renderTable=function(){
    originalTable();
    const names=[$('srch').value.trim(),$('sectorFilter').value,$('expertFilter').value].filter(Boolean);
    const quick=document.querySelector('.qf-btn[class*="on-"]');if(quick && quick.id!=='qfAll')names.push(quick.textContent);
    filterSummary.innerHTML=names.length?`<span>التصفية الحالية:</span>${names.map(n=>`<span class="filter-chip">${safe(bidi(n))}</span>`).join('')}<button class="inline-action" id="clearResultFilters">مسح الكل</button>`:'';
    if($('clearResultFilters'))$('clearResultFilters').onclick=()=>{['srch','sectorFilter','expertFilter'].forEach(id=>$(id).value='');setQF('all');};
  };
  document.addEventListener('click',event=>{
    const company=event.target.closest('[data-company-open]');
    if(company){navigateSection('t5');$('t5co').value=company.dataset.companyOpen;$('t5yr').value=S.yr;$('t5qr').value=S.qr;renderCompanyView();}
  });
  ['t0','t5'].forEach(id=>{
    const back=document.createElement('button');back.className='back-link';back.textContent='→ العودة للتوقعات والنتائج';back.onclick=()=>navigateSection('t1');$(id).prepend(back);
  });
  const heading=document.querySelector('#t0 .hero-title');if(heading)heading.textContent='أضف بياناتك في خطوات واضحة';
  const resetCalendar=document.createElement('button');resetCalendar.className='btn bo';resetCalendar.textContent='مسح التصفية';resetCalendar.id='clearCalendarFilters';
  resetCalendar.onclick=()=>{['uCalendarSearch','uSector','uFiscalEnd'].forEach(id=>$(id).value='');$('uStatus').value='all';$('uCalendarSort').value='date';$('uCalendarSearch').dispatchEvent(new Event('input'));};
  document.querySelector('.u-calendar-toolbar').append(resetCalendar);
  restoreSectionFromURL();
  renderTable();
})();
