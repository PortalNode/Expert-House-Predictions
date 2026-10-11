/* Navigation and input feedback. The original data and calculation functions remain authoritative. */
const sectionRoutes = {t0:'add-forecasts',t1:'results',t7:'stock-performance',t2:'research-houses',t3:'accuracy',t5:'company',t6:'announcements',t4:'data'};
let restoringNavigation = false;
function navigateSection(id) {
  const button = document.querySelector('.tabs .tab[data-tab="'+id+'"]');
  if (button) swTab(id, button);
}
function syncNavigation(id) {
  const select = document.getElementById('sectionSelect');
  if (select) select.value = id;
  const route = sectionRoutes[id];
  if (!restoringNavigation && route && location.hash !== '#'+route) history.pushState(null, '', '#'+route);
  window.scrollTo({top:0,behavior:'instant'});
}
function restoreSectionFromURL() {
  const id = Object.keys(sectionRoutes).find(key => sectionRoutes[key] === location.hash.slice(1)) || 't0';
  restoringNavigation=true;
  try {navigateSection(id);} finally {restoringNavigation=false;}
}
function setPasteError(message) {
  const error = document.getElementById('pasteError'), input = document.getElementById('aiTxt');
  error.textContent = message; error.hidden = !message;
  if (message) {input.setAttribute('aria-invalid','true');input.focus();}
  else input.removeAttribute('aria-invalid');
}
function updatePasteCount() {
  const value = document.getElementById('aiTxt').value.trim();
  const lines = value ? value.split(/\n/).filter(line => line.trim()).length : 0;
  document.getElementById('pasteCount').textContent = lines ? '\u2067'+ '\u2066'+lines+'\u2069'+' سطر\u2069' : '';
}
function insertForecastExample() {
  const input = document.getElementById('aiTxt');
  if (input.value.trim()) {showToast('فرّغ النص الحالي أولًا لإدراج المثال.');input.focus();return;}
  input.value = 'مثال توضيحي — بيانات تجريبية\nالراجحي المالية\nالشركة\tصافي الربح المتوقع (مليون ريال)\nمصرف الراجحي\t100\nالأهلي السعودي\t200';
  setPasteError('');updatePasteCount();input.focus();
}
function clearManualErrors() {
  const error = document.getElementById('manualError');
  if(error){error.hidden=true;error.textContent='';}
  document.querySelectorAll('#modalBg [aria-invalid]').forEach(el=>{el.removeAttribute('aria-invalid');el.removeAttribute('aria-errormessage');});
}
function manualFieldError(message, id) {
  const error=document.getElementById('manualError'), input=document.getElementById(id);
  error.textContent=message;error.hidden=false;
  input.setAttribute('aria-invalid','true');input.setAttribute('aria-errormessage','manualError');input.focus();
}
function invalidateForecastReview() {
  pendingForecasts=[];
  document.getElementById('aiRes').classList.remove('on');
  cancelAIRequest('clear');
}
function companyCountLabel(count) {
  if (count === 1) return 'شركة واحدة';
  if (count === 2) return 'شركتين';
  return count + (count <= 10 ? ' شركات' : ' شركة');
}
function renderExpertCoverage() {
  const year = document.getElementById('aiY').value;
  const quarter = document.getElementById('aiQ').value;
  const select = document.getElementById('aiExp');
  const coverage = document.getElementById('expertCoverage');
  if (!coverage || !select) return;
  const counts = countExpertForecastsForPeriod(
    EXPERTS,
    year === '2025' ? (D25[quarter] || []) : [],
    S.extra[year + '_' + quarter] || [],
    canonicalCompany,
    parseEntryNumber
  );
  const selected = select.value;
  for (const option of select.options) {
    if (!option.value) continue;
    const expert = EXPERTS.find(name => name === option.value || name === option.textContent);
    if (!expert) continue;
    option.value = expert;
    const count = counts.get(expert) || 0;
    option.textContent = expert + (count ? ' — مضاف لـ ' + companyCountLabel(count) : ' — لم يُضف');
  }
  select.value = selected;
  coverage.replaceChildren();
  const summary = document.createElement('p');
  summary.className = 'expert-coverage-summary';
  if (selected) {
    const count = counts.get(selected) || 0;
    summary.textContent = count
      ? '✓ أُضيفت توقعات ' + selected + ' لـ ' + companyCountLabel(count) + ' في ' + QL[quarter] + ' ' + year + '.'
      : 'لم تُضف توقعات ' + selected + ' إلى ' + QL[quarter] + ' ' + year + ' بعد.';
    summary.classList.toggle('is-added', count > 0);
  } else {
    const saved = EXPERTS.filter(expert => counts.get(expert));
    summary.textContent = saved.length
      ? 'بيوت الخبرة التي لها توقعات مضافة في ' + QL[quarter] + ' ' + year + ' (' + saved.length + ' من ' + EXPERTS.length + '):'
      : 'لم تُضف توقعات لأي بيت خبرة في ' + QL[quarter] + ' ' + year + ' بعد.';
  }
  coverage.append(summary);
  const saved = EXPERTS.filter(expert => counts.get(expert));
  if (!selected && saved.length) {
    const list = document.createElement('div');
    list.className = 'expert-coverage-list';
    for (const expert of saved) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'expert-coverage-chip';
      button.textContent = '✓ ' + expert + ' · ' + companyCountLabel(counts.get(expert));
      button.setAttribute('aria-label', expert + ': توقعات مضافة لـ ' + companyCountLabel(counts.get(expert)) + '، اختر بيت الخبرة');
      button.addEventListener('click', () => {
        select.value = expert;
        select.dispatchEvent(new Event('change', {bubbles:true}));
        select.focus();
      });
      list.append(button);
    }
    coverage.append(list);
  }
}
document.getElementById('aiTxt').addEventListener('input',()=>{setPasteError('');updatePasteCount();invalidateForecastReview();});
['aiY','aiQ','aiExp'].forEach(id=>document.getElementById(id).addEventListener('change',()=>{invalidateForecastReview();renderExpertCoverage();}));
document.getElementById('modalBg').addEventListener('input',clearManualErrors);
document.getElementById('modalBg').addEventListener('keydown',event=>{
  if(event.key==='Enter' && event.target.matches('input')){event.preventDefault();submitModal();}
});
document.querySelectorAll('.tabs .tab').forEach(button=>{
  button.id='nav-'+button.dataset.tab;
  document.getElementById(button.dataset.tab).setAttribute('aria-labelledby',button.id);
});
// Focus the review only once per result render, so editing a row never loses focus.
new MutationObserver(()=>{
  const result=document.getElementById('aiRes');
  if(result.classList.contains('on')) result.focus({preventScroll:false});
}).observe(document.getElementById('aiCont'),{childList:true});
window.addEventListener('popstate',restoreSectionFromURL);
if(Object.values(sectionRoutes).includes(location.hash.slice(1))) restoreSectionFromURL();
updatePasteCount();
renderExpertCoverage();
