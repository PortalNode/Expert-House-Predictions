/* Browser adapter for the unified TypeScript import and calendar module. */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const h = (value) => esc(String(value ?? ""));
  const rtl = (value) =>
    "\u2067" +
    String(value).replace(
      /[+-]?[A-Za-z0-9][A-Za-z0-9.,:/_%+\- ]*/g,
      (s) => "\u2066" + s.trimEnd() + "\u2069" + (s.endsWith(" ") ? " " : ""),
    ) +
    "\u2069";
  const SEED = globalThis.ANNOUNCEMENT_HISTORY;
  const UPDATES = globalThis.ANNOUNCEMENT_UPDATES || {
    records: [], verifiedBankCorrections: [], earlierEstimatedAnnouncements: [], asOf: "",
  };
  const FISCAL = globalThis.FISCAL_CALENDARS || {};
  const ISSUE_ROWS = globalThis.ANNOUNCEMENT_ISSUES || [];
  const ISSUES = new Map(
    ISSUE_ROWS.map((r) => [[r.symbol, r.year, r.quarter, r.date].join("|"), r]),
  );
  const DEFAULT_EXPERTS = [...EXPERTS];
  const BASE_FORECASTS = structuredClone(D25);
  const PUBLISHED = globalThis.RASD_PUBLISHED_DATA;
  let expertRegistry = ResearchHouses.createRegistry(DEFAULT_EXPERTS);
  const KEY = "finUnifiedV1";
  const UNDO = "finUnifiedUndoV1";
  const aliases = { ...CO_ALIASES };
  for (const item of SEED.forecasts) {
    let company = COMPANIES.find((c) => c.symbol === item.symbol);
    if (!company) {
      company = {
        name: item.company,
        symbol: item.symbol,
        sector: item.sector,
      };
      COMPANIES.push(company);
    }
    aliases[item.company] = company.name;
    CO_ALIASES[item.company] = company.name;
    NAME_TO_SYM[company.name] = company.symbol;
    NAME_TO_SEC[company.name] = company.sector;
  }
  aliases["أديس القابضة"] =
    COMPANIES.find((c) => c.symbol === "2382")?.name || "أديس";
  aliases["سابك للمغذيات"] = "سابك للمغذيات الزراعية";
  let engine = EarningsCore.createEngine({
    companies: COMPANIES,
    aliases,
    experts: EXPERTS,
  });
  let provenance = {},
    seedVersion = 0,
    pending = [],
    backupPayload = null,
    reviewPeriod = "",
    mode = "forecast",
    method = "paste";
  let storageError = "";
  let calendarPage = 0;
  const calendarPageSize = 20;
  const current = () => {
    const forecasts = { ...S.extra };
    for (const [quarter, base] of Object.entries(D25)) {
      const key = "2025_" + quarter;
      const rows = new Map(
        base.map((r) => [
          canonicalCompany(r.name),
          { ...r, forecasts: { ...r.forecasts } },
        ]),
      );
      for (const r of S.extra[key] || []) {
        const name = canonicalCompany(r.name),
          old = rows.get(name);
        rows.set(
          name,
          old
            ? {
                ...old,
                ...r,
                actual: r.actual ?? old.actual,
                prev: r.prev ?? old.prev,
                forecasts: {
                  ...old.forecasts,
                  ...Object.fromEntries(
                    Object.entries(r.forecasts || {}).filter(
                      ([, v]) => v != null,
                    ),
                  ),
                },
              }
            : r,
        );
      }
      forecasts[key] = [...rows.values()];
    }
    return { forecasts, announcements: S.announcements, provenance, expertRegistry };
  };
  const snapshot = (state) => ({
    version: 5,
    exported: new Date().toISOString(),
    seedVersion,
    experts: EXPERTS,
    ...state,
  });
  const originalSaveLS = saveLS,
    originalSaveDates = saveAnnouncementLS;
  function registryFor(state) {
    const discovered = Object.values(state.forecasts || {}).filter(Array.isArray).flatMap(rows => rows.flatMap(row => Object.keys(row.forecasts || {})));
    return ResearchHouses.createRegistry(DEFAULT_EXPERTS, state.expertRegistry || expertRegistry, [...(state.experts || []), ...discovered]);
  }
  function installState(state) {
    expertRegistry = registryFor(state);
    state = ResearchHouses.applyRegistry(state, expertRegistry);
    EXPERTS.splice(0, EXPERTS.length, ...expertRegistry.map(house => house.name));
    const base = ResearchHouses.applyRegistry({forecasts: BASE_FORECASTS}, expertRegistry).forecasts;
    for (const key of Object.keys(D25)) D25[key] = base[key];
    S.extra = state.forecasts;
    S.announcements = state.announcements;
    provenance = state.provenance || {};
    engine = EarningsCore.createEngine({companies: COMPANIES, aliases, experts: EXPERTS});
    recalculateAllStoredRows();
    if (globalThis.refreshHouseControls) refreshHouseControls();
  }
  function persist(state, undo = false) {
    state = {...ResearchHouses.applyRegistry(state, registryFor(state)), expertRegistry: registryFor(state)};
    const envelope = snapshot(state);
    if (undo) localStorage.setItem(UNDO, JSON.stringify(snapshot(current())));
    localStorage.setItem(KEY, JSON.stringify(envelope)); // One authoritative write; never report success on failure.
    installState(state);
    originalSaveLS();
    originalSaveDates();
    $("uUndo") && ($("uUndo").hidden = !localStorage.getItem(UNDO));
  }
  function mergePublished(state) {
    if (!PUBLISHED || PUBLISHED.version !== 1) return state;
    const forecasts = {...state.forecasts};
    for (const [period, publishedRows] of Object.entries(PUBLISHED.forecasts)) {
      const rows = new Map((Array.isArray(forecasts[period]) ? forecasts[period] : []).map(row => [canonicalCompany(row.name), row]));
      for (const publishedRow of publishedRows) {
        const name = canonicalCompany(publishedRow.name);
        const saved = rows.get(name);
        if (!saved) {
          rows.set(name, {...publishedRow, name, forecasts:{...publishedRow.forecasts}});
          continue;
        }
        const availableForecasts = {...publishedRow.forecasts};
        for (const [house, value] of Object.entries(saved.forecasts || {})) {
          if (value != null) availableForecasts[house] = value;
        }
        rows.set(name, {
          ...saved,
          name,
          prev: saved.prev ?? publishedRow.prev,
          actual: saved.actual ?? publishedRow.actual,
          forecasts: availableForecasts,
        });
      }
      forecasts[period] = [...rows.values()];
    }
    const announcements = {...state.announcements};
    for (const [company, dates] of Object.entries(PUBLISHED.announcements)) {
      const name = canonicalCompany(company);
      announcements[name] = {...dates, ...(announcements[name] || {})};
    }
    return {...state, forecasts, announcements};
  }
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      if (saved.version !== 5 || !saved.forecasts || !saved.announcements)
        throw Error("نسخة التخزين غير صالحة");
      installState(saved);
      seedVersion = saved.seedVersion || 0;
    }
    if (seedVersion < 4) {
      if (seedVersion < 1)
        S.announcements = EarningsCore.seedHistory(
          SEED.forecasts,
          S.announcements,
          (n) => engine.resolve(n),
        );
      const grouped = new Map();
      for (const record of [
        ...UPDATES.records,
        ...(UPDATES.verifiedBankCorrections || []),
      ]) {
        if (!record.replacesBuiltInBankDate) {
          if (!grouped.has(record.symbol))
            grouped.set(record.symbol, {
              symbol: record.symbol,
              company: record.company,
              history: [],
            });
          grouped.get(record.symbol).history.push(record);
        }
        const name = engine.resolve(record.symbol)?.name;
        const key = record.year + "_" + record.quarter.toLowerCase();
        const builtInBankDate = BANK_ANNOUNCEMENT_SEED[name]?.[key];
        if (
          builtInBankDate &&
          S.announcements[name]?.[key] === builtInBankDate &&
          !provenance[record.symbol + "|" + key + "|date"]
        )
          S.announcements[name][key] = record.date;
      }
      S.announcements = EarningsCore.seedHistory(
        [...grouped.values()],
        S.announcements,
        (n) => engine.resolve(n),
      );
      for (const record of UPDATES.earlierEstimatedAnnouncements || []) {
        const name = engine.resolve(record.symbol)?.name;
        const key = record.year + "_" + record.quarter.toLowerCase();
        if (
          name &&
          S.announcements[name]?.[key] === record.previousDate &&
          !provenance[record.symbol + "|" + key + "|date"]
        )
          S.announcements[name][key] = record.date;
      }
      seedVersion = 4;
      persist(current());
    }
    if (seedVersion < 5 && PUBLISHED?.version === 1) {
      const merged = mergePublished(current());
      seedVersion = 5;
      persist(merged);
    }
  } catch (error) {
    storageError = "تعذر تحميل أو حفظ مساحة العمل: " + error.message;
  }
  saveLS = function () {
    recalculateAllStoredRows();
    try {
      persist(current());
      localStorage.removeItem(UNDO);
      $("uUndo") && ($("uUndo").hidden = true);
    } catch (e) {
      showToast("تعذر الحفظ الدائم؛ صدّر نسخة احتياطية. " + e.message);
    }
  };
  saveAnnouncementLS = function () {
    try {
      persist(current());
      localStorage.removeItem(UNDO);
      $("uUndo") && ($("uUndo").hidden = true);
    } catch (e) {
      showToast("تعذر حفظ المواعيد على هذا المتصفح. " + e.message);
    }
  };
  predictionForCompany = function (name, year, qr) {
    const company = engine.resolve(name);
    const history = S.announcements[canonicalCompany(name)] || {};
    const clean = Object.fromEntries(
      Object.entries(history).filter(([key, date]) => {
        const [y, q] = key.split("_");
        return !ISSUES.has([company?.symbol, Number(y), q.toUpperCase(), date].join("|"));
      }),
    );
    const key = year + "_" + String(qr).toLowerCase();
    const issue = ISSUES.get(
      [company?.symbol, Number(year), String(qr).toUpperCase(), history[key]].join("|"),
    );
    if (issue)
      return {
        date: issue.date, confirmed: false, issue,
        rangeStart: issue.date, rangeEnd: issue.date,
        count: 0, confidence: "low",
      };
    return EarningsCore.projectDate(clean, Number(year), qr);
  };

  const inputHero = document.querySelector("#t0 .input-hero");
  inputHero.querySelector(".hero-kicker").textContent =
    "رَصد • مساحة عمل موحدة";
  inputHero.querySelector("h1").textContent = "من المعلومة إلى الصورة الكاملة";
  inputHero.querySelector(".hero-copy").textContent =
    "توقعات بيوت الخبرة، النتائج الفعلية، ومواعيد الإعلانات. أدخلها مرة واحدة لتظهر معًا في ملف الشركة.";
  inputHero.querySelector(".hero-steps").innerHTML =
    '<span class="hero-step"><b>1</b> أضف المحتوى</span><span class="hero-step"><b>2</b> راجع المطابقة</span><span class="hero-step"><b>3</b> احفظ واربط البيانات</span>';
  const workspace = document.createElement("section");
  workspace.className = "u-workspace";
  workspace.id = "unifiedWorkspace";
  workspace.innerHTML = `
   <div class="u-entry-head"><div><span class="u-eyebrow">مركز الإدخال</span><h2>ماذا تريد أن تضيف؟</h2></div><button class="btn bo" id="uUndo" hidden>تراجع عن آخر استيراد</button></div>
   <div class="u-mode" role="group" aria-label="نوع البيانات"><button class="active" data-kind="forecast">توقعات بيوت الخبرة<small>صافي الربح المتوقع</small></button><button data-kind="result">نتائج وإعلانات<small>الفعلي والمماثل والتاريخ</small></button><button data-kind="date">مواعيد فقط<small>إعلانات فعلية منشورة</small></button></div>
   <div class="u-config">
    <label>السنة المالية<input id="uYear" type="number" min="2000" max="2200" value="${S.yr}"></label>
    <label>الربع<select id="uQuarter">${Object.entries(QL)
      .map(
        ([q, l]) =>
          `<option value="${q}" ${q === S.qr ? "selected" : ""}>${l}</option>`,
      )
      .join("")}</select></label>
    <label id="uExpertLabel">بيت الخبرة<input id="uExpert" list="uExperts" placeholder="يُستنتج من النص أو اختره"><datalist id="uExperts">${EXPERTS.map((e) => `<option value="${h(e)}">`).join("")}</datalist></label>
    <label>العملة<select id="uCurrency"><option value="">من النص؛ الريال عند عدم ذكرها</option><option value="SAR">ريال سعودي</option><option value="USD">دولار أمريكي</option></select></label>
   </div>
   <div class="u-method" role="group" aria-label="طريقة الإدخال"><button class="active" data-method="paste">لصق نص أو جدول</button><button data-method="manual">إدخال يدوي</button><button data-method="file">رفع ملف</button></div>
   <div id="uPastePanel">
    <label for="uText" class="field-label">المحتوى المنسوخ</label><textarea id="uText" class="ai-ta" placeholder="الصق الجدول من أرقام، أو نص توقعات بيت الخبرة، أو خلايا من إكسل…" spellcheck="false"></textarea>
    <div class="u-text-foot"><span>يدعم الخسائر، الأقواس، الأرقام العربية، والجداول المتفرقة.</span><select id="uExample" aria-label="تجربة مثال"><option value="">جرّب أحد الأمثلة…</option><option value="social">نص الأهلي المالية</option><option value="fragment">خلايا توقعات متفرقة</option><option value="results">نتائج وتواريخ الشركات</option></select></div>
   </div>
   <div id="uManualPanel" hidden class="u-config">
    <label>الشركة<input id="uCompany" list="annCompanies" placeholder="اسم الشركة أو رمز تداول"></label>
    <label class="u-value-field">صافي الربح بالمليون<input id="uValue" inputmode="decimal" placeholder="مثال: -33.2"></label>
    <label id="uPreviousLabel">ربح الربع المماثل بالمليون<input id="uPrevious" inputmode="decimal" placeholder="اختياري"></label>
    <label id="uDateLabel">تاريخ الإعلان الفعلي<input id="uDate" type="date"></label>
   </div>
   <div id="uFilePanel" hidden><label id="uDropZone" class="u-drop" for="uFile"><strong>اختر ملفًا أو اسحبه هنا</strong><span>نص، جدول CSV / TSV، صفحة HTML، أو نسخة JSON من أيٍّ من المشروعين</span><input id="uFile" type="file" accept=".txt,.csv,.tsv,.md,.html,.htm,.json"></label><p id="uFileName" class="u-muted" role="status"></p></div>
   <details class="u-settings"><summary>المصدر وطريقة قراءة التاريخ</summary><div class="u-config"><label>المصدر أو رابط التقرير<input id="uSource" placeholder="اختياري؛ يُحفظ مع البيانات"></label><label>تواريخ اليوم والشهر المتشابهة<select id="uDateOrder"><option value="ymd">تلقائي؛ اسألني عند الالتباس</option><option value="dmy">يوم / شهر / سنة</option><option value="mdy">شهر / يوم / سنة</option></select></label></div><p>الفترة هي الربع المالي كما ورد في التقرير، وقد يسبق تاريخ الإعلان الربع الميلادي لدى بعض الشركات.</p></details>
   <div class="u-actions"><p>البيانات تُحلّل محليًا على جهازك، وتُحفظ بعد المراجعة.</p><button class="btn bo" id="uClear">مسح الإدخال</button><button class="btn bg" id="uPreview">تحليل ومعاينة</button></div>
   <div id="uError" class="u-error" role="alert" hidden></div>
   <section id="uReview" class="u-review" tabindex="-1" aria-label="مراجعة الاستيراد" hidden></section>
  `;
  inputHero.after(workspace);
  const legacy = document.querySelector("#t0 .entry-layout");
  const advanced = document.createElement("details");
  advanced.className = "u-advanced";
  advanced.innerHTML =
    "<summary>أدوات الإدخال المتقدمة والمساعدة بالذكاء الاصطناعي</summary>";
  legacy.before(advanced);
  advanced.append(legacy);
  for (const el of document.querySelectorAll(
    '[data-tab="t0"],#sectionSelect option[value="t0"]',
  ))
    el.textContent = "إضافة البيانات";
  $("uUndo").hidden = !localStorage.getItem(UNDO);

  function error(message = "") {
    $("uError").hidden = !message;
    $("uError").textContent = rtl(message);
  }
  function invalidate() {
    pending = [];
    backupPayload = null;
    $("uReview").hidden = true;
    error();
  }
  function selectMode(kind) {
    mode = kind;
    workspace.querySelectorAll("[data-kind]").forEach((b) => {
      b.classList.toggle("active", b.dataset.kind === kind);
      b.setAttribute("aria-pressed", String(b.dataset.kind === kind));
    });
    $("uExpertLabel").hidden = kind !== "forecast";
    $("uDateLabel").hidden = kind === "forecast";
    $("uPreviousLabel").hidden = kind !== "result";
    workspace
      .querySelectorAll(".u-value-field")
      .forEach((el) => (el.hidden = kind === "date"));
    invalidate();
  }
  function selectMethod(value) {
    method = value;
    workspace
      .querySelectorAll("[data-method]")
      .forEach((b) => b.classList.toggle("active", b.dataset.method === value));
    for (const [m, id] of [
      ["paste", "uPastePanel"],
      ["manual", "uManualPanel"],
      ["file", "uFilePanel"],
    ])
      $(id).hidden = m !== value;
    invalidate();
  }
  function options() {
    return {
      kind: mode,
      year: Number($("uYear").value),
      quarter: $("uQuarter").value,
      expert: $("uExpert").value.trim(),
      currency: $("uCurrency").value || undefined,
      dateOrder: $("uDateOrder").value,
      source: $("uSource").value.trim(),
    };
  }
  function htmlText(value) {
    const doc = new DOMParser().parseFromString(value, "text/html");
    doc
      .querySelectorAll("script,style,iframe,object")
      .forEach((n) => n.remove());
    const tables = [...doc.querySelectorAll("table")];
    if (tables.length)
      return tables
        .map((t) =>
          [...t.rows]
            .map((r) =>
              [...r.cells]
                .map((c) => {
                  const clone = c.cloneNode(true);
                  clone.querySelectorAll("a").forEach((a) => {
                    const url = a.getAttribute("href") || "";
                    a.replaceWith(
                      /^https?:\/\//i.test(url)
                        ? "[" + a.textContent + "](" + url + ")"
                        : a.textContent,
                    );
                  });
                  return clone.textContent.trim();
                })
                .join("\t"),
            )
            .join("\n"),
        )
        .join("\n");
    return doc.body.textContent || "";
  }
  $("uText").addEventListener("paste", (e) => {
    const html = e.clipboardData?.getData("text/html");
    if (html && /<table/i.test(html)) {
      e.preventDefault();
      $("uText").setRangeText(
        htmlText(html),
        $("uText").selectionStart,
        $("uText").selectionEnd,
        "end",
      );
      invalidate();
    }
  });
  workspace
    .querySelectorAll("[data-kind]")
    .forEach((b) => (b.onclick = () => selectMode(b.dataset.kind)));
  workspace
    .querySelectorAll("[data-method]")
    .forEach((b) => (b.onclick = () => selectMethod(b.dataset.method)));
  for (const id of [
    "uText",
    "uYear",
    "uQuarter",
    "uExpert",
    "uCurrency",
    "uSource",
    "uDateOrder",
    "uCompany",
    "uValue",
    "uPrevious",
    "uDate",
  ])
    $(id).addEventListener("input", invalidate);
  function showPreview(result) {
    pending = result.rows;
    reviewPeriod = $("uYear").value + "_" + $("uQuarter").value;
    const review = $("uReview");
    review.hidden = false;
    const usable = pending.filter((r) => !r.errors.length).length;
    const usd = pending.some((r) => r.currency === "USD" && r.kind !== "date");
    const existing = current();
    const status = (r) => {
      const key = r.year + "_" + r.quarter;
      const row = (existing.forecasts[key] || []).find(
        (x) => engine.resolve(x.name)?.symbol === r.symbol,
      );
      const old =
        r.kind === "forecast"
          ? row?.forecasts?.[r.expert]
          : r.kind === "date"
            ? existing.announcements[r.company]?.[key]
            : row?.actual;
      return old != null ? "موجود: " + old : "جديد";
    };
    review.innerHTML = `<div class="u-review-head"><div><span class="u-eyebrow">معاينة قبل الحفظ</span><h3>${h(rtl(pending.length + " سجل • " + usable + " جاهز للمراجعة"))}</h3><p>راجع الشركة والفترة والمبالغ. الصفوف ذات الملاحظات تحتاج انتباهك.</p></div><button class="btn bo" id="uCancel">إلغاء</button></div>
    ${backupPayload?.expertRegistry?.length ? `<p class="u-info">ستُستعاد أيضًا بيوت الخبرة وأسماؤها البديلة وحالة الأرشفة من النسخة الاحتياطية.</p>` : ""}
    ${result.issues.length ? '<div class="u-warning">' + result.issues.map((s) => h(rtl(s))).join("<br>") + "</div>" : ""}
    ${
      (pending.length || backupPayload?.expertRegistry?.length || backupPayload?.experts?.length)
        ? `<div class="u-review-settings"><label>التعامل مع البيانات الموجودة<select id="uPolicy"><option value="preserve">الاحتفاظ بالموجود وإضافة الناقص</option><option value="replace">استبدال القيم الموجودة بالصفوف المحددة</option></select></label>${usd ? '<label>ريال لكل دولار — أدخله صراحةً<input id="uFx" type="number" min="0.0001" step="0.0001" placeholder="سعر التحويل الذي تعتمد عليه"></label>' : ""}<label class="u-check"><input id="uSelectAll" type="checkbox"> تحديد الصفوف السليمة</label></div>
    <div class="u-table-scroll"><table class="u-table u-edit-table"><thead><tr><th>حفظ</th><th>الشركة</th><th>الفترة</th><th>النوع / المصدر</th><th>القيمة بالمليون</th><th>المماثل</th><th>تاريخ الإعلان</th><th>المراجعة</th></tr></thead><tbody>${pending
      .map(
        (r, i) =>
          `<tr data-review="${i}"><td><input data-field="selected" type="checkbox" ${r.selected ? "checked" : ""} aria-label="حفظ ${h(r.company)}"></td><td><input data-field="company" list="annCompanies" value="${h(r.company)}" aria-label="الشركة"><small>${h(r.symbol)}</small></td><td><input data-field="year" type="number" value="${r.year}" aria-label="السنة"><select data-field="quarter" aria-label="الربع">${Object.entries(
            QL,
          )
            .map(
              ([q, l]) =>
                `<option value="${q}" ${q === r.quarter ? "selected" : ""}>${l}</option>`,
            )
            .join(
              "",
            )}</select></td><td>${r.kind === "forecast" ? `<input data-field="expert" list="uExperts" value="${h(r.expert)}" aria-label="بيت الخبرة">` : r.kind === "date" ? "موعد إعلان" : "نتيجة فعلية"}</td><td>${r.kind === "date" ? "—" : `<input data-field="value" inputmode="decimal" value="${r.value === null ? "" : h("\u2066" + r.value + "\u2069")}" aria-label="صافي الربح"><small>${r.currency === "USD" ? "مليون دولار" : "مليون ريال"}</small>`}</td><td>${r.kind === "result" ? `<input data-field="previous" inputmode="decimal" value="${r.previous === null ? "" : h("\u2066" + r.previous + "\u2069")}" aria-label="الربع المماثل">` : "—"}</td><td>${r.kind !== "forecast" ? `<input data-field="date" type="date" value="${r.date || ""}" aria-label="تاريخ الإعلان">` : "—"}</td><td><span class="u-status ${r.errors.length ? "warn" : ""}">${h(rtl(status(r)))}</span><small class="u-row-notes">${h(rtl([...r.errors, ...r.warnings].join(" • ") || "مطابقة الشركة والفترة"))}</small></td></tr>`,
      )
      .join(
        "",
      )}</tbody></table></div><div class="u-save-bar"><span id="uSelectionCount"></span><button class="btn bg" id="uCommit">حفظ الصفوف المحددة</button></div>`
        : '<p class="u-empty">لم يُستخرج أي سجل. تحقق من الأسماء، وأضف عنوان الجدول أو استخدم الإدخال اليدوي.</p>'
    }`;
    labelCells(review);
    $("uCancel").onclick = invalidate;
    if (pending.length || backupPayload?.expertRegistry?.length || backupPayload?.experts?.length) {
      $("uSelectAll").onchange = (e) => {
        review
          .querySelectorAll('[data-field="selected"]')
          .forEach(
            (el, i) =>
              (el.checked = e.target.checked && !pending[i].errors.length),
          );
        updateSelected();
      };
      review.addEventListener("change", updateSelected);
      $("uCommit").onclick = commitReview;
      updateSelected();
    }
    review.focus();
  }
  function labelCells(root) {
    for (const table of root.querySelectorAll(".u-table")) {
      const headings = [...table.querySelectorAll("thead th")].map(
        (el) => el.textContent,
      );
      for (const tr of table.querySelectorAll("tbody tr"))
        [...tr.children].forEach(
          (td, i) => (td.dataset.label = headings[i] || ""),
        );
    }
  }
  function updateSelected() {
    const n = $("uReview").querySelectorAll(
      '[data-field="selected"]:checked',
    ).length;
    if ($("uSelectionCount"))
      $("uSelectionCount").textContent = rtl(n + " سجل محدد");
  }
  function preview() {
    error();
    try {
      const opts = options();
      if (!Number.isInteger(opts.year) || opts.year < 2000 || opts.year > 2200)
        throw Error("أدخل سنة مالية صحيحة");
      if (method === "manual") {
        const c = engine.resolve($("uCompany").value);
        if (!c) throw Error("اختر شركة معروفة من القائمة");
        const value = EarningsCore.parseAmount($("uValue").value),
          previous = EarningsCore.parseAmount($("uPrevious").value);
        if (mode !== "date" && value === null)
          throw Error("أدخل صافي الربح؛ الخسارة تُكتب بالسالب");
        if (
          mode === "result" &&
          $("uPrevious").value.trim() &&
          previous === null
        )
          throw Error("قيمة الربع المماثل غير صالحة");
        if (mode === "forecast" && !opts.expert) throw Error("اختر بيت الخبرة");
        const date = mode === "forecast" ? null : $("uDate").value;
        if (mode !== "forecast" && !date)
          throw Error("أدخل تاريخ الإعلان الفعلي");
        showPreview({
          rows: [
            {
              ...opts,
              company: c.name,
              symbol: c.symbol,
              value,
              previous: mode === "result" ? previous : null,
              date,
              expert: opts.expert || "",
              currency: opts.currency || "SAR",
              raw: "إضافة يدوية",
              errors: [],
              warnings: [],
              selected: true,
            },
          ],
          issues: [],
        });
      } else if (backupPayload)
        showPreview(engine.previewBackup(backupPayload));
      else {
        const text = $("uText").value.trim();
        if (!text) throw Error("ألصق محتوى أو ارفع ملفًا أولًا");
        const named = opts.expert ? ResearchHouses.resolveHouse(expertRegistry, opts.expert) : expertRegistry.find(house => !house.archived && [house.name, house.shortName, ...house.aliases].filter(Boolean).some(name => normalizeArabicLookup(text).includes(normalizeArabicLookup(name))));
        if (named) opts.expert = named.name;
        showPreview(engine.preview(text, opts));
      }
    } catch (e) {
      error(e.message);
    }
  }
  function commitReview() {
    error();
    try {
      const selected = [];
      for (const tr of $("uReview").querySelectorAll("[data-review]")) {
        if (!tr.querySelector('[data-field="selected"]').checked) continue;
        const original = pending[Number(tr.dataset.review)],
          row = { ...original, selected: true };
        const read = (field) =>
          tr.querySelector('[data-field="' + field + '"]')?.value;
        row.company = read("company");
        row.symbol = engine.resolve(row.company)?.symbol || "";
        row.year = Number(read("year"));
        row.quarter = read("quarter");
        row.expert = read("expert") ?? row.expert;
        const house = ResearchHouses.resolveHouse(expertRegistry, row.expert);
        if (house?.archived && !backupPayload) throw Error("بيت الخبرة مؤرشف؛ أعد تفعيله قبل إضافة توقعات جديدة");
        if (house) row.expert = house.name;
        row.date = read("date") || null;
        if (row.kind !== "date") {
          row.value = EarningsCore.parseAmount(read("value"));
          if (read("value")?.trim() && row.value === null)
            throw Error("قيمة غير صالحة: " + row.company);
        }
        if (row.kind === "result") {
          row.previous = EarningsCore.parseAmount(read("previous"));
          if (read("previous")?.trim() && row.previous === null)
            throw Error("قيمة مماثلة غير صالحة: " + row.company);
        }
        // Explicitly selecting a flagged row acknowledges the displayed period warning; all fields still validate at commit.
        selected.push(row);
      }
      const metadataOnly = !pending.length && (backupPayload?.expertRegistry?.length || backupPayload?.experts?.length);
      const result = metadataOnly ? {state:current(), errors:[], changed:0, skipped:0} : engine.commit(selected, current(), {
        policy: $("uPolicy").value,
        fx: $("uFx") ? Number($("uFx").value) : undefined,
      });
      if (result.errors.length)
        throw Error([...new Set(result.errors)].join(" • "));
      const incomingRegistry = backupPayload?.expertRegistry || (backupPayload?.experts || []).map(name => ({name, aliases:[], shortName:"", archived:false}));
      const nextRegistry = incomingRegistry?.length ? ResearchHouses.mergeRegistry(expertRegistry, incomingRegistry) : expertRegistry;
      const registryChanged = JSON.stringify(nextRegistry) !== JSON.stringify(expertRegistry);
      if (!result.changed && !registryChanged) {
        error(
          "لا توجد قيم جديدة للحفظ؛ " +
            result.skipped +
            " قيمة متطابقة أو محفوظة. اختر الاستبدال إذا أردت تعديل الموجود.",
        );
        return;
      }
      persist({...result.state, expertRegistry:nextRegistry}, true);
      const first = selected[0];
      if (first) { S.yr = String(first.year); S.qr = first.quarter; }
      buildYearSelector();
      refresh();
      pending = [];
      backupPayload = null;
      const viewSection = selected.some(row => row.kind === 'result') ? 't7' : 't1';
      const viewLabel = viewSection === 't7' ? 'عرض النتائج المعلنة' : 'عرض التوقعات';
      $("uReview").innerHTML =
        `<div class="u-success"><span>✓</span><div><h3>تم الحفظ وربط البيانات</h3><p>${h(rtl(result.changed + " قيمة محفوظة • " + result.skipped + " قيمة أُبقيت كما هي"))}</p>${registryChanged ? "<p>تمت استعادة سجل بيوت الخبرة وأسمائها البديلة وحالة الأرشفة.</p>" : ""}<p>تجد القيم في الصفحات المناسبة، والمواعيد في سجل الإعلانات. يمكنك التراجع عن هذا الاستيراد.</p><button class="btn bo" id="uViewResults">${viewLabel}</button> <button class="btn bo" id="uViewCalendar">فتح المواعيد</button></div></div>`;
      $("uViewResults").onclick = () => navigateSection(viewSection);
      $("uViewCalendar").onclick = () => navigateSection("t6");
      showToast("تم حفظ البيانات على هذا المتصفح");
    } catch (e) {
      error("لم يتم حفظ الاستيراد: " + e.message);
    }
  }
  async function readFile(file) {
    if (!file) return;
    invalidate();
    try {
      if (file.size > 10 * 1024 * 1024)
        throw Error("الحد الأقصى للملف عشرة ميغابايت");
      const text = await file.text();
      $("uFileName").textContent = rtl(file.name);
      if (/\.json$/i.test(file.name)) {
        backupPayload = JSON.parse(text);
        showPreview(engine.previewBackup(backupPayload));
      } else {
        $("uText").value = /\.html?$/i.test(file.name) ? htmlText(text) : text;
        preview();
      }
    } catch (e) {
      error("تعذر قراءة الملف: " + e.message);
    }
  }
  $("uFile").onchange = (e) => readFile(e.target.files[0]);
  $("uDropZone").ondragover = (e) => {
    e.preventDefault();
    e.currentTarget.classList.add("drag");
  };
  $("uDropZone").ondragleave = (e) => e.currentTarget.classList.remove("drag");
  $("uDropZone").ondrop = (e) => {
    e.preventDefault();
    e.currentTarget.classList.remove("drag");
    readFile(e.dataTransfer.files[0]);
  };
  $("uPreview").onclick = preview;
  $("uClear").onclick = () => {
    invalidate();
    $("uText").value = "";
    $("uFile").value = "";
    $("uFileName").textContent = "";
  };
  $("uUndo").onclick = () => {
    try {
      const raw = localStorage.getItem(UNDO);
      if (!raw) return;
      const state = JSON.parse(raw);
      persist(state);
      localStorage.removeItem(UNDO);
      $("uUndo").hidden = true;
      invalidate();
      buildYearSelector();
      refresh();
      showToast("تم التراجع عن آخر استيراد");
    } catch (e) {
      error("تعذر التراجع: " + e.message);
    }
  };
  const examples = {
    social:
      "📊 توقعات الأهلي المالية لأرباح الربع الثالث 2026\nصافي الأرباح المتوقعة بالمليون ريال، ونسبة التغير السنوي. باستثناء أمريكانا، أرقامها بالمليون دولار حسب التقرير.\n🧪 البتروكيماويات 🔹 سابك: خسارة 414 ⚪️ -- 🔹 المجموعة السعودية: خسارة 83.7 ⚪️ -- 🔹 ينساب: 211 🟢 +184% 🔹 المتقدمة: خسارة 33.2 ⚪️ -- 🔹 التصنيع: خسارة 172 ⚪️ -- 🔹 سبكيم: خسارة 277 ⚪️ -- 🔹 سابك للمغذيات الزراعية: 241 🔴 -81.5% 🔹 كيان: خسارة 786 ⚪️ --",
    fragment:
      "**الشركة**\n**الربع الثالث 2026 (المتوقع)**\n**التغير سنوياً**\n**متوسط توقعات المحللين**\n" +
      [
        ["اللجين", "52", "+217.2 %"],
        ["سبكيم", "(229)", "--"],
        ["كيان", "(644)", "--"],
        ["الحفر العربية", "20", "--"],
        ["أديس القابضة", "75", "(65.0 %)"],
        ["لوبريف", "437", "+56.7 %"],
        ["أماك", "67", "(17.7 %)"],
        ["مياهنا", "3", "(34.2 %)"],
      ]
        .map(([n, v, p]) =>
          [
            n,
            v,
            p,
            "[متوسط التوقعات](https://www.argaam.com/ar/analystestimates/analystrecomendationsestimate/3/4434/4)",
          ]
            .map((s) => "| |\n| - |\n**" + s + "**")
            .join("\n"),
        )
        .join("\n"),
    results:
      "| تاريخ | الشركة | الربع الثالث 2025 | الربع الثالث 2026 | التغير (%) |\n|--:|--|--:|--:|--:|\n" +
      [
        ["2026/10/11", "المتقدمة", "71.81", "4.00", "(94.43 %)"],
        ["2026/10/08", "إكسترا", "142.75", "104.63", "(26.70 %)"],
        ["2026/10/08", "تسهيل", "81.55", "14.39", "(82.36 %)"],
        ["2026/10/04", "المراعي", "613.24", "617.79", "0.74 %"],
        ["2026/08/06", "اليمامة للحديد", "15.37", "62.09", "303.91 %"],
        ["2026/06/10", "الوطنية للتعليم", "57.03", "67.60", "18.54 %"],
        ["2026/05/18", "عطاء", "21.57", "29.28", "35.77 %"],
        ["2026/04/28", "عزم", "8.01", "10.95", "36.70 %"],
      ]
        .map((r) => "| " + r.join(" | ") + " |")
        .join("\n"),
  };
  $("uExample").onchange = (e) => {
    const key = e.target.value;
    if (!key) return;
    if ($("uText").value.trim() && !confirm("استبدال النص الحالي بالمثال؟")) {
      e.target.value = "";
      return;
    }
    selectMode(key === "results" ? "result" : "forecast");
    $("uYear").value = "2026";
    $("uQuarter").value = "q3";
    $("uExpert").value = key === "social" ? "الأهلي المالية" : "";
    $("uText").value = examples[key];
    $("uSource").value = "مثال أرسله المستخدم؛ غير متحقق منه خارجيًا";
    e.target.value = "";
  };
  selectMode("forecast");
  const originalOnCtrl = onCtrl;
  onCtrl = function () {
    originalOnCtrl();
    $("uYear").value = S.yr;
    $("uQuarter").value = S.qr;
    invalidate();
  };
  goToPaste = function () {
    navigateSection("t0");
    selectMode("forecast");
    selectMethod("paste");
    $("uYear").value = S.yr;
    $("uQuarter").value = S.qr;
    $("uText").focus();
  };
  goToArgaamResults = function () {
    navigateSection("t0");
    selectMode("result");
    selectMethod("paste");
    $("uYear").value = S.yr;
    $("uQuarter").value = S.qr;
    $("uText").focus();
  };
  importDB = function (file) {
    navigateSection("t0");
    selectMethod("file");
    readFile(file);
  };
  doCSV = function (file) {
    navigateSection("t0");
    selectMethod("file");
    readFile(file);
  };
  exportDB = function () {
    const blob = new Blob([JSON.stringify(snapshot(current()), null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download =
      "rasd-unified-" + new Date().toISOString().slice(0, 10) + ".json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast("تم تصدير التوقعات والمواعيد ومعلومات المصادر");
  };
  // The unified importer is the visible entry point for results and dates.
  $("argaamImportPanel").hidden = true;

  const calendar = document.createElement("section");
  calendar.id = "unifiedCalendar";
  calendar.className = "u-calendar";
  calendar.innerHTML = `<div class="u-calendar-head"><div><span class="u-eyebrow">روزنامة الأرباح</span><h2>تابع الإعلان في سياقه</h2><p id="uCalendarPeriod"></p></div><button class="btn bg" id="uAddAnnouncement">إضافة نتائج أو مواعيد</button></div><div class="u-calendar-stats" id="uCalendarStats"></div><div class="u-calendar-toolbar"><input id="uCalendarSearch" type="search" placeholder="ابحث بالشركة أو رمز تداول" aria-label="البحث في الروزنامة"><select id="uSector" aria-label="قطاع الشركة"><option value="">كل القطاعات</option>${[
    ...new Set(COMPANIES.map((c) => c.sector).filter(Boolean)),
  ]
    .sort()
    .map((s) => `<option>${h(s)}</option>`)
    .join(
      "",
    )}</select><select id="uFiscalEnd" aria-label="نهاية السنة المالية"><option value="">كل السنوات المالية</option><option value="12-31">تنتهي في ٣١ ديسمبر</option><option value="03-31">تنتهي في ٣١ مارس</option><option value="07-31">تنتهي في ٣١ يوليو</option><option value="08-31">تنتهي في ٣١ أغسطس</option><option value="09-30">تنتهي في ٣٠ سبتمبر</option><option value="06-30">تنتهي في ٣٠ يونيو</option><option value="fund">صناديق عقارية</option></select><select id="uStatus" aria-label="حالة الإعلان"><option value="all">جميع الحالات</option><option value="announced">أعلنت</option><option value="audit">بحاجة إلى تدقيق</option><option value="pending">لم تعلن</option><option value="soon">متوقعة خلال أسبوع</option><option value="overdue">تجاوزت النطاق المتوقع</option><option value="unknown">سجل غير كافٍ</option></select><select id="uCalendarSort" aria-label="ترتيب المواعيد"><option value="date">الأقرب موعدًا</option><option value="name">اسم الشركة</option><option value="coverage">الأكثر تغطية</option></select></div><div class="u-table-scroll"><table class="u-table u-calendar-table"><thead><tr><th>الشركة</th><th>موعد الإعلان</th><th>الحالة</th><th>متوسط التوقعات</th><th>الربح الفعلي</th><th>التغطية</th><th>السجل</th></tr></thead><tbody id="uCalendarBody"></tbody></table></div><div class="u-pagination"><button class="btn bo" id="uPagePrev">السابق</button><span id="uPageInfo"></span><button class="btn bo" id="uPageNext">التالي</button></div><p class="u-calendar-note" id="uCalendarNote"></p><details class="u-methodology"><summary>كيف تُحسب المواعيد؟</summary><p>الموعد المتوقع هو وسيط تواريخ نفس الربع المالي من آخر ثلاث سنوات متاحة، بعد نقلها إلى السنة المختارة. النطاق يعكس تشتت السجل؛ لا يمثل موعدًا مؤكدًا أو مهلة نظامية. درجة الثقة وصفية بحسب عدد السنوات وليست احتمالًا إحصائيًا.</p><p id="uSourceNote"></p></details>`;
  document.querySelector("#t6 .dash-hero").after(calendar);
  document.querySelector("#t6 .hero-copy").textContent =
    "سجل تاريخي موحّد، مواعيد مرجحة، وتوقعات الأرباح والنتائج في مكان واحد.";
  $("uSourceNote").textContent = rtl(
    "السجل الأساسي من الملف المرفق: " +
      SEED.meta.totalRecords +
      " إعلانًا لـ " +
      SEED.forecasts.length +
      " شركة، بآخر تحديث " +
      SEED.meta.generatedAt +
      ". أضيف " +
      UPDATES.records.length +
      " إعلانًا موثقًا بروابط مصادره حتى " +
      UPDATES.asOf +
      "، وطُوبق " +
      (UPDATES.verifiedBankCorrections || []).length +
      " تاريخًا من القيم البنكية المدمجة مع إعلانات منشورة. اعتُمد أول إعلان نتائج تقديري أو أولي بدل تاريخ لاحق في " +
      (UPDATES.earlierEstimatedAnnouncements || []).length +
      " ربعًا. هناك " + ISSUE_ROWS.length +
      " تاريخًا من الملف الأصلي يحتاج تحققًا إضافيًا أو مراجعة تسمية السنة والربع؛ لا يُعامل كإعلان مؤكد حتى تُحسم مطابقته.",
  );
  const fiscalEndFor = (symbol, year) => {
    const calendar = FISCAL[symbol];
    if (!calendar) return "";
    if (calendar.cadence === "fund") return "fund";
    return calendar.previousYearEnd && year < calendar.changeYear
      ? calendar.previousYearEnd
      : calendar.yearEnd;
  };
  const fiscalLabel = (symbol, year) => {
    const end = fiscalEndFor(symbol, year);
    if (end === "fund") return "صندوق عقاري • إفصاح غير ربعي";
    if (end === "هجري") return "سنة مالية هجرية";
    const calendar = FISCAL[symbol];
    const transition = calendar?.changeYear === year ? " • سنة انتقالية" : "";
    return end ? "نهاية السنة المالية " + end.slice(3) + "/" + end.slice(0, 2) + transition : "سنة مالية غير محددة";
  };
  const estimatedDates = new Set(
    [...UPDATES.records, ...(UPDATES.earlierEstimatedAnnouncements || [])]
      .filter((r) => /estimated|التقديرية/i.test(r.noticeTitle + " " + r.sourceLabel))
      .map((r) => [r.symbol, r.year, r.quarter, r.date].join("|")),
  );
  function today() {
    const p = Object.fromEntries(
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Riyadh",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      })
        .formatToParts(new Date())
        .map((x) => [x.type, x.value]),
    );
    return p.year + "-" + p.month + "-" + p.day;
  }
  function renderCalendar() {
    const year = Number($("annYear").value || S.yr),
      quarter = $("annQuarter").value || S.qr,
      key = year + "_" + quarter;
    const records =
      year === 2025
        ? [...(D25[quarter] || []), ...(S.extra[key] || [])]
        : S.extra[key] || [];
    const financial = new Map();
    for (const r of records) {
      const c = engine.resolve(r.name);
      if (!c) continue;
      const old = financial.get(c.symbol);
      const merged = old
        ? {
            ...old,
            ...r,
            forecasts: {
              ...old.forecasts,
              ...Object.fromEntries(
                Object.entries(r.forecasts || {}).filter(([, v]) => v != null),
              ),
            },
          }
        : { ...r, forecasts: { ...r.forecasts } };
      recalcAvg(merged);
      financial.set(c.symbol, merged);
    }
    const day = today();
    const week = new Date(day + "T12:00:00Z");
    week.setUTCDate(week.getUTCDate() + 7);
    const weekEnd = week.toISOString().slice(0, 10);
    let rows = COMPANIES.map((c) => {
      const name = canonicalCompany(c.name),
        p = predictionForCompany(name, year, quarter),
        f = financial.get(c.symbol);
      const count = Object.values(f?.forecasts || {}).filter(
        (v) => v != null,
      ).length;
      const isEstimated = p?.confirmed && estimatedDates.has(
        [c.symbol, year, quarter.toUpperCase(), p.date].join("|"),
      );
      return { c, name, p, f, count, isEstimated };
    });
    const all = rows.filter((x) => x.p || x.f),
      announced = rows.filter((x) => x.p?.confirmed),
      soon = rows.filter(
        (x) => !x.p?.confirmed && !x.p?.issue && x.p?.date >= day && x.p.date <= weekEnd,
      );
    $("uCalendarPeriod").textContent = rtl(
      QL[quarter] + " " + year + " • القيم المالية بمليون ريال",
    );
    $("uCalendarStats").innerHTML = [
      ["شركات لها سجل أو بيانات", all.length],
      ["إعلانات مسجلة", announced.length],
      ["متوقعة خلال أسبوع", soon.length],
      [
        "توقعات لم تتحقق بعد",
        rows.filter((x) => x.p && !x.p.confirmed && !x.p.issue && x.p.rangeEnd < day).length,
      ],
    ]
      .map(
        ([l, v]) => `<div><span>${l}</span><strong>${h(rtl(v))}</strong></div>`,
      )
      .join("");
    const query = normalizeArabicLookup($("uCalendarSearch").value),
      sector = $("uSector").value,
      fiscalEnd = $("uFiscalEnd").value,
      status = $("uStatus").value;
    rows = rows.filter(
      (x) =>
        (!query ||
          normalizeArabicLookup(x.name).includes(query) ||
          x.c.symbol.includes(query)) &&
        (!sector || x.c.sector === sector) &&
        (!fiscalEnd || fiscalEndFor(x.c.symbol, year) === fiscalEnd) &&
        (status === "all" ||
          (status === "announced" && x.p?.confirmed) ||
          (status === "audit" && x.p?.issue) ||
          (status === "pending" && !x.p?.confirmed && !x.p?.issue) ||
          (status === "unknown" && !x.p) ||
          (status === "soon" && soon.includes(x)) ||
          (status === "overdue" &&
            x.p &&
            !x.p.confirmed && !x.p.issue &&
            x.p.rangeEnd < day)),
    );
    const sort = $("uCalendarSort").value;
    rows.sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name, "ar")
        : sort === "coverage"
          ? b.count - a.count
          : Boolean(a.p?.confirmed) !== Boolean(b.p?.confirmed)
            ? a.p?.confirmed
              ? 1
              : -1
            : (a.p?.date || "9999").localeCompare(b.p?.date || "9999"),
    );
    const total = rows.length;
    calendarPage = Math.min(
      calendarPage,
      Math.max(0, Math.ceil(total / calendarPageSize) - 1),
    );
    const visible = rows.slice(
      calendarPage * calendarPageSize,
      (calendarPage + 1) * calendarPageSize,
    );
    $("uCalendarBody").innerHTML =
      visible
        .map((x) => {
          const label = x.p?.issue
            ? "يحتاج تدقيق"
            : x.p?.confirmed
            ? x.isEstimated ? "أعلنت تقديريًا" : "أعلنت"
            : !x.p
              ? "سجل غير كافٍ"
              : x.p.rangeEnd < day
                ? "تجاوزت النطاق المتوقع"
                : "موعد متوقع";
          return `<tr><td><button class="u-company-link" data-open="${h(x.name)}">${h(x.name)}</button><small>${h(rtl(x.c.symbol + " • " + (x.c.sector || "")))}</small><small class="u-fiscal">${h(rtl(fiscalLabel(x.c.symbol, year)))}</small></td><td><strong>${h(x.p ? rtl(formatFullDate(x.p.date)) : "—")}</strong><small>${x.p?.issue ? "تاريخ سابق يحتاج مطابقة المصدر" : x.p && !x.p.confirmed ? h(rtl(formatShortDate(x.p.rangeStart) + " — " + formatShortDate(x.p.rangeEnd))) : x.p ? "تاريخ إعلان مسجل" : "أضف سجلًا لنفس الربع"}</small></td><td><span class="u-status ${x.p?.confirmed ? "done" : x.p?.issue || x.p?.rangeEnd < day ? "warn" : ""}">${label}</span>${x.p?.issue ? `<small>${h(x.p.issue.status)}</small>` : x.p && !x.p.confirmed ? `<small>${h(rtl(x.p.count + " سنوات • " + { high: "ثقة مرتفعة", medium: "ثقة متوسطة", low: "ثقة أولية" }[x.p.confidence]))}</small>` : ""}</td><td class="u-number">${h(rtl(x.f?.avg == null ? "—" : fmt(x.f.avg)))}</td><td class="u-number">${h(rtl(x.f?.actual == null ? "—" : fmt(x.f.actual)))}</td><td>${h(rtl(x.count ? x.count + " بيوت خبرة" : "لا توجد توقعات"))}</td><td><button class="btn bo" data-open="${h(x.name)}">التفاصيل</button></td></tr>`;
        })
        .join("") ||
      '<tr><td colspan="7" class="u-empty">لا توجد شركات تطابق هذه التصفية.</td></tr>';
    labelCells(calendar);
    $("uPagePrev").disabled = calendarPage === 0;
    $("uPageNext").disabled = (calendarPage + 1) * calendarPageSize >= total;
    $("uPageInfo").textContent = rtl(
      "صفحة " +
        (calendarPage + 1) +
        " من " +
        Math.max(1, Math.ceil(total / calendarPageSize)),
    );
    $("uCalendarNote").textContent = rtl(
      "عرض " +
        rows.length +
        " شركة. الموعد المتوقع تقدير من السجل التاريخي، ويحل محله التاريخ الفعلي عند إضافته.",
    );
  }
  $("uCalendarBody").onclick = (e) => {
    const button = e.target.closest("[data-open]");
    if (button) openAnnouncementForCompany(button.dataset.open);
  };
  ["uCalendarSearch", "uSector", "uFiscalEnd", "uStatus", "uCalendarSort"].forEach((id) =>
    $(id).addEventListener("input", () => {
      calendarPage = 0;
      renderCalendar();
    }),
  );
  $("uPagePrev").onclick = () => {
    calendarPage--;
    renderCalendar();
  };
  $("uPageNext").onclick = () => {
    calendarPage++;
    renderCalendar();
  };
  $("uAddAnnouncement").onclick = goToArgaamResults;
  const oldRender = renderAnnouncementCalendar;
  renderAnnouncementCalendar = function () {
    oldRender();
    renderCalendar();
    renderFullHistory();
  };
  function renderFullHistory() {
    const company = engine.resolve($("annCompany").value);
    const existing = $("uFullHistory");
    if (existing) existing.remove();
    if (!company) return;
    const name = canonicalCompany(company.name),
      history = S.announcements[name] || {};
    const source = SEED.forecasts.find((c) => c.symbol === company.symbol);
    const imported = [
      ...UPDATES.records,
      ...(UPDATES.verifiedBankCorrections || []),
      ...(UPDATES.earlierEstimatedAnnouncements || []),
    ].filter((r) => r.symbol === company.symbol);
    const details = document.createElement("details");
    details.id = "uFullHistory";
    details.className = "u-methodology";
    const rows = Object.entries(history).sort(([a], [b]) => b.localeCompare(a));
    details.innerHTML = `<summary>${h(rtl("السجل الكامل ومصادره • " + rows.length + " إعلانًا"))}</summary><div class="u-table-scroll"><table class="u-table"><thead><tr><th>الفترة المالية</th><th>الإعلان</th><th>الوقت</th><th>المصدر</th></tr></thead><tbody>${rows
      .map(([key, date]) => {
        const [y, q] = key.split("_");
        const original = source?.history.find(
          (r) =>
            r.year === Number(y) &&
            r.quarter.toLowerCase() === q &&
            r.date === date,
        );
        const update = imported.find(
          (r) =>
            r.year === Number(y) &&
            r.quarter.toLowerCase() === q &&
            r.date === date,
        );
        const meta = provenance[company.symbol + "|" + key + "|date"];
        const issue = ISSUES.get(
          [company.symbol, Number(y), q.toUpperCase(), date].join("|"),
        );
        const sourceCell = issue
          ? `<span class="u-status warn">يحتاج تدقيق</span><small>${h(issue.status)}</small>${issue.sourceUrl ? `<a href="${h(issue.sourceUrl)}" target="_blank" rel="noopener noreferrer">الإفصاح الذي يحتاج مطابقة</a>` : ""}`
          : meta?.source
          ? h(meta.source)
          : update?.sourceUrl?.startsWith("https://")
            ? `<a href="${h(update.sourceUrl)}" target="_blank" rel="noopener noreferrer">${h(update.sourceLabel || "إعلان النتائج")}</a>`
            : original
              ? h("السجل المرفق • " + (original.verification || "سجل تاريخي"))
              : h("سجل المتصفح");
        return `<tr><td>${h(rtl((QL[q] || q) + " " + y))}</td><td>${h(rtl(formatFullDate(date)))}</td><td>${h(rtl(original?.time || "—"))}</td><td>${sourceCell}</td></tr>`;
      })
      .join("")}</tbody></table></div>`;
    $("annContent").append(details);
  }
  globalThis.HouseWorkspace = {
    list: () => structuredClone(expertRegistry),
    save: (id, input) => {
      const next = ResearchHouses.saveHouse(expertRegistry, id, input);
      const oldName = expertRegistry.find(house => house.id === id)?.name;
      persist({...current(), expertRegistry:next});
      if (S.exp === oldName) S.exp = input.name.trim();
      invalidate();
      refresh();
      return next.find(house => house.id === id) || next[next.length-1];
    },
    backup: () => snapshot(current()),
  };
  // Export functions remain accessible to the existing controls and shortcuts.
  $("uPreview").title = "لا تُحفظ أي قيمة قبل مراجعتها";
  initAnnouncementCompanies();
  buildYearSelector();
  refresh();
  renderCalendar();
  if (storageError) error(storageError);
})();
