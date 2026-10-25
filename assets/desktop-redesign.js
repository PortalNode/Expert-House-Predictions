/* Desktop navigation and the independent reported-results page. */
(function () {
  const $ = id => document.getElementById(id);
  const labels = {t7:'النتائج المعلنة',t1:'الشركات ذات التوقعات',t6:'مواعيد الإعلانات',t2:'بيوت الخبرة',t3:'دقة التوقعات',t5:'ملف الشركة',t0:'إضافة بيانات',t4:'الإعدادات والنسخ'};
  const safe = value => esc(String(value ?? ''));
  const bidi = value => '\u2067\u2066'+String(value)+'\u2069\u2069';

  function syncSidebar(id) {
    $('desktopSectionName').textContent = labels[id] || labels.t7;
    document.querySelectorAll('[data-side-section]').forEach(button => {
      const active = button.dataset.sideSection === id;
      button.classList.toggle('is-active', active);
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
  }
  const previousSync = syncNavigation;
  syncNavigation = function (id) { previousSync(id); syncSidebar(id); };
  document.querySelectorAll('[data-side-section]').forEach(button => button.addEventListener('click', () => navigateSection(button.dataset.sideSection)));
  syncSidebar(S.tab);

  $('desktopCompanySearch').addEventListener('keydown', event => {
    if (event.key !== 'Enter') return;
    const query = normalizeArabicLookup(event.currentTarget.value.trim());
    if (!query) return;
    const company = COMPANIES.find(item => normalizeArabicLookup(item.name).includes(query) || item.symbol.includes(query));
    if (!company) { showToast('لم أجد شركة مطابقة في فهرس الشركات.'); return; }
    navigateSection('t5');
    $('t5co').value = company.name;
    $('t5yr').value = S.yr;
    $('t5qr').value = S.qr;
    renderCompanyView();
  });

  function reportedRows() {
    const seen = new Set(), result = [];
    for (const row of getData()) {
      if (typeof row.actual !== 'number' || !Number.isFinite(row.actual)) continue;
      const key = canonicalCompany(row.name) || row.name;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(row);
    }
    return result;
  }
  function countCard(label, value, hint) {
    return '<div class="sc"><div class="sc-l">'+label+'</div><div class="sc-v">'+safe(bidi(value))+'</div><div class="sc-s">'+hint+'</div></div>';
  }
  function growth(row) {
    return row.prev == null || row.prev === 0 ? null : (row.actual-row.prev)/Math.abs(row.prev);
  }
  const oldStats = renderStats;
  renderStats = function () {
    oldStats();
    const forecasted = getData().filter(hasNumericForecast);
    const actual = reportedRows();
    const withForecast = forecasted.filter(row => row.actual != null);
    $('sRow').innerHTML = countCard('شركات ذات توقعات',forecasted.length,'توقع رقمي واحد على الأقل')+
      countCard('لم تسجل نتيجتها',forecasted.length-withForecast.length,'ضمن الشركات المتوقعة')+
      countCard('أعلنت ولها توقعات',withForecast.length,'تظهر نتيجتها مع التوقعات')+
      countCard('مقارنة مكتملة',withForecast.filter(row => row.avg != null && row.avg !== 0 && row.prev != null && row.prev !== 0).length,'فعلي ومماثل وتوقعات');
    $('reportedStats').innerHTML = countCard('شركات معلنة',actual.length,'لها نتيجة فعلية مسجلة')+
      countCard('لها ربع مماثل',actual.filter(row => row.prev != null).length,'للمقارنة السنوية')+
      countCard('ارتفعت',actual.filter(row => growth(row) > 0).length,'عن الربع المماثل')+
      countCard('انخفضت',actual.filter(row => growth(row) < 0).length,'عن الربع المماثل');
  };

  function savedAnnouncement(row) {
    const prediction = predictionForCompany(row.name, Number(S.yr), S.qr);
    return prediction?.confirmed ? prediction.date : '';
  }
  function updateSectorChoices(rows) {
    const select = $('resultOnlySector'), current = select.value;
    const sectors = [...new Set(rows.map(row => getCompanySector(row.name)).filter(Boolean))].sort((a,b) => a.localeCompare(b,'ar'));
    select.replaceChildren(new Option('كل القطاعات',''), ...sectors.map(sector => new Option(sector,sector)));
    if (sectors.includes(current)) select.value = current;
  }
  function renderReportedResults() {
    const all = reportedRows();
    updateSectorChoices(all);
    const query = normalizeArabicLookup($('resultOnlySearch').value.trim()), sector = $('resultOnlySector').value;
    let rows = all.filter(row => (!query || normalizeArabicLookup(row.name).includes(query) || String(getCompanySymbol(row.name) || '').includes(query)) && (!sector || getCompanySector(row.name) === sector));
    const sort = $('resultOnlySort').value;
    rows.sort((a,b) => {
      if (sort.startsWith('growth:')) {
        const first=growth(a), second=growth(b);
        if (first == null) return second == null ? 0 : 1;
        if (second == null) return -1;
        return sort === 'growth:desc' ? second-first : first-second;
      }
      return sort === 'actual' ? b.actual-a.actual : sort === 'date' ? savedAnnouncement(b).localeCompare(savedAnnouncement(a)) : a.name.localeCompare(b.name,'ar');
    });
    $('resultOnlyCount').textContent = 'المعروض '+rows.length+' من '+all.length+' شركة';
    $('resultOnlyRows').innerHTML = rows.map(row => {
      const symbol = getCompanySymbol(row.name), sectorName = getCompanySector(row.name);
      const change = growth(row);
      const growthHTML = change == null ? '—' : '<span class="badge '+(change >= 0 ? 'bp' : 'bn')+'">'+safe(bidi((change >= 0 ? '+' : '')+(change*100).toFixed(1)+'%'))+'</span>';
      const edit = S.yr === '2025' ? '' : '<button type="button" class="act-edit-btn result-only-edit-act" data-name="'+encodeURIComponent(row.name)+'" data-yr="'+safe(S.yr)+'" data-qr="'+safe(S.qr)+'" data-val="'+safe(row.actual)+'" title="تعديل النتيجة الفعلية">✏</button>';
      return '<tr><td><button type="button" class="company-open" data-company-open="'+safe(row.name)+'">'+safe(row.name)+'</button><span class="result-meta">'+safe(bidi(symbol || ''))+'</span></td><td>'+safe(sectorName || '—')+'</td><td class="result-value">'+safe(bidi(fmt(row.actual)))+' '+edit+'</td><td>'+safe(bidi(fmt(row.prev)))+'</td><td>'+growthHTML+'</td><td>'+safe(bidi(savedAnnouncement(row) || '—'))+'</td><td><button type="button" class="inline-action" data-company-open="'+safe(row.name)+'">ملف الشركة ←</button></td></tr>';
    }).join('') || '<tr><td colspan="7" class="nr">لا توجد نتائج فعلية تطابق الفترة أو المرشحات الحالية.</td></tr>';
  }
  function updateTableScrollHint() {
    const scroll = document.querySelector('.results-scroll');
    $('tableScrollHint').classList.toggle('has-overflow',scroll.clientWidth > 0 && scroll.scrollWidth > scroll.clientWidth + 2);
  }
  $('tableScrollForward').addEventListener('click',() => document.querySelector('.results-scroll').scrollBy({left:-320,behavior:'smooth'}));
  $('tableScrollBack').addEventListener('click',() => document.querySelector('.results-scroll').scrollBy({left:320,behavior:'smooth'}));
  window.addEventListener('resize',updateTableScrollHint);
  const oldTable = renderTable;
  renderTable = function () { oldTable(); renderReportedResults(); requestAnimationFrame(updateTableScrollHint); };
  $('resultOnlySearch').addEventListener('input',renderReportedResults);
  $('resultOnlySector').addEventListener('change',renderReportedResults);
  $('resultOnlySort').addEventListener('change',renderReportedResults);
  $('resultOnlyClear').addEventListener('click',() => { $('resultOnlySearch').value=''; $('resultOnlySector').value=''; $('resultOnlySort').value='name'; renderReportedResults(); });
  $('resultOnlyRows').addEventListener('click',event => {
    const edit = event.target.closest('.result-only-edit-act');
    if (edit) showInlineEditAct(edit);
  });
  renderStats(); renderTable();
})();
