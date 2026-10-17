/* Desktop navigation and a genuine separation between reported results with and without forecasts. */
(function () {
  const $ = id => document.getElementById(id);
  const labels = {t1:'الشركات ذات التوقعات',t7:'النتائج المعلنة',t6:'مواعيد الإعلانات',t2:'بيوت الخبرة',t3:'دقة التوقعات',t5:'ملف الشركة',t0:'إضافة بيانات',t4:'الإعدادات والنسخ'};
  const safe = value => esc(String(value ?? ''));
  const bidi = value => '\u2067\u2066'+String(value)+'\u2069\u2069';
  window.rasdReportedGroup = 'with';

  function syncSidebar(id) {
    $('desktopSectionName').textContent = labels[id] || labels.t1;
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

  function groupedRows() {
    const seen = new Set(), result = [];
    for (const row of getData()) {
      if (row.actual == null) continue;
      const key = canonicalCompany(row.name) || row.name;
      if (seen.has(key)) continue;
      seen.add(key); result.push(row);
    }
    return result;
  }
  function countCard(label, value, hint) {
    return '<div class="sc"><div class="sc-l">'+label+'</div><div class="sc-v">'+safe(bidi(value))+'</div><div class="sc-s">'+hint+'</div></div>';
  }
  const oldStats = renderStats;
  renderStats = function () {
    oldStats();
    const all = getData(), forecasted = all.filter(hasNumericForecast), actual = groupedRows();
    const withForecast = actual.filter(hasNumericForecast), without = actual.filter(row => !hasNumericForecast(row));
    $('reportedWithCount').textContent = withForecast.length;
    $('reportedWithoutCount').textContent = without.length;
    if (S.tab === 't7') {
      const houses = new Set(withForecast.flatMap(row => Object.entries(row.forecasts || {}).filter(([,value]) => typeof value === 'number' && Number.isFinite(value)).map(([name]) => name)));
      $('sRow').innerHTML = countCard('نتائج مسجلة',actual.length,'في الفترة المختارة')+countCard('مع توقعات',withForecast.length,'قابلة للمقارنة')+countCard('بلا توقعات',without.length,'تظهر في مجموعة مستقلة')+countCard('بيوت مشاركة',houses.size,'في النتائج القابلة للمقارنة');
    } else if (S.tab === 't1') {
      $('sRow').innerHTML = countCard('شركات ذات توقعات',forecasted.length,'توقع رقمي واحد على الأقل')+countCard('لم تسجل نتيجتها',forecasted.filter(row => row.actual == null).length,'ضمن الشركات المتوقعة')+countCard('أعلنت ولها توقعات',withForecast.length,'قابلة للمقارنة')+countCard('أعلنت بلا توقعات',without.length,'في صفحة النتائج');
    }
  };

  function resultOnlyRows() { return groupedRows().filter(row => !hasNumericForecast(row)); }
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
  function renderResultOnly() {
    const all = resultOnlyRows();
    updateSectorChoices(all);
    const query = normalizeArabicLookup($('resultOnlySearch').value.trim()), sector = $('resultOnlySector').value;
    let rows = all.filter(row => (!query || normalizeArabicLookup(row.name).includes(query) || getCompanySymbol(row.name).includes(query)) && (!sector || getCompanySector(row.name) === sector));
    const sort = $('resultOnlySort').value;
    const growth = row => row.prev == null || row.prev === 0 ? null : (row.actual-row.prev)/Math.abs(row.prev);
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
      const growth = row.prev == null || row.prev === 0 ? null : (row.actual-row.prev)/Math.abs(row.prev)*100;
      const growthHTML = growth == null ? '—' : '<span class="badge '+(growth >= 0 ? 'bp' : 'bn')+'">'+safe(bidi((growth >= 0 ? '+' : '')+growth.toFixed(1)+'%'))+'</span>';
      const edit = S.yr === '2025' ? '' : '<button type="button" class="act-edit-btn result-only-edit-act" data-name="'+encodeURIComponent(row.name)+'" data-yr="'+safe(S.yr)+'" data-qr="'+safe(S.qr)+'" data-val="'+safe(row.actual)+'" title="تعديل النتيجة الفعلية">✏</button>';
      return '<tr><td><button type="button" class="company-open" data-company-open="'+safe(row.name)+'">'+safe(row.name)+'</button><span class="result-meta">'+safe(bidi(symbol))+'</span></td><td>'+safe(sectorName || '—')+'</td><td class="result-value">'+safe(bidi(fmt(row.actual)))+' '+edit+'</td><td>'+safe(bidi(fmt(row.prev)))+'</td><td>'+growthHTML+'</td><td>'+safe(bidi(savedAnnouncement(row) || '—'))+'</td><td><button type="button" class="inline-action" data-company-open="'+safe(row.name)+'">ملف الشركة ←</button></td></tr>';
    }).join('') || '<tr><td colspan="7" class="nr">لا توجد نتائج تطابق المرشحات الحالية.</td></tr>';
  }
  function syncReportedDisplay() {
    const without = S.tab === 't7' && window.rasdReportedGroup === 'without';
    $('resultsTableCard').hidden = without;
    $('resultOnlyPanel').hidden = !without;
    document.querySelectorAll('[data-reported-group]').forEach(button => {
      const active = button.dataset.reportedGroup === window.rasdReportedGroup;
      button.classList.toggle('is-active',active);
      button.setAttribute('aria-pressed',String(active));
    });
    if (without) renderResultOnly();
  }
  function updateTableScrollHint() {
    const scroll = document.querySelector('.results-scroll');
    $('tableScrollHint').classList.toggle('has-overflow',scroll.clientWidth > 0 && scroll.scrollWidth > scroll.clientWidth + 2);
  }
  $('tableScrollForward').addEventListener('click',() => document.querySelector('.results-scroll').scrollBy({left:-320,behavior:'smooth'}));
  $('tableScrollBack').addEventListener('click',() => document.querySelector('.results-scroll').scrollBy({left:320,behavior:'smooth'}));
  window.addEventListener('resize',updateTableScrollHint);
  const oldTable = renderTable;
  renderTable = function () { oldTable(); syncReportedDisplay(); requestAnimationFrame(updateTableScrollHint); };
  document.querySelectorAll('[data-reported-group]').forEach(button => button.addEventListener('click', () => {
    window.rasdReportedGroup = button.dataset.reportedGroup;
    renderStats(); renderTable();
  }));
  $('resultOnlySearch').addEventListener('input',renderResultOnly);
  $('resultOnlySector').addEventListener('change',renderResultOnly);
  $('resultOnlySort').addEventListener('change',renderResultOnly);
  $('resultOnlyClear').addEventListener('click',() => { $('resultOnlySearch').value=''; $('resultOnlySector').value=''; $('resultOnlySort').value='name'; renderResultOnly(); });
  $('resultOnlyRows').addEventListener('click',event => {
    const edit = event.target.closest('.result-only-edit-act');
    if (edit) showInlineEditAct(edit);
  });
  renderStats(); renderTable();
})();
