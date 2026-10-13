/** Public import seam. Pure parsing and merging; no DOM, network, or storage dependencies. */
export type Quarter = "q1" | "q2" | "q3" | "q4";
export type Kind = "forecast" | "result" | "date";
export type Company = { symbol: string; name: string; sector?: string };
export type Options = {
  kind: Kind;
  year: number;
  quarter: Quarter;
  expert?: string;
  currency?: "SAR" | "USD";
  dateOrder?: "ymd" | "dmy" | "mdy";
  source?: string;
};
export type ImportRow = {
  company: string;
  symbol: string;
  kind: Kind;
  year: number;
  quarter: Quarter;
  expert: string;
  value: number | null;
  previous: number | null;
  date: string | null;
  currency: "SAR" | "USD";
  source: string;
  raw: string;
  errors: string[];
  warnings: string[];
  selected: boolean;
  provenance?: Record<string, any>;
};
export type State = {
  forecasts: Record<string, any>;
  announcements: Record<string, Record<string, string>>;
  provenance?: Record<string, any>;
};
const digits = (v: string) =>
  String(v)
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "");
const normalize = (v: string) =>
  digits(v)
    .normalize("NFKD")
    .replace(/[\u064b-\u065f\u0670ـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .toLowerCase();
const clean = (v: string) =>
  digits(v)
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[*_`]/g, "")
    .replace(/&nbsp;|&#xA0;|&#160;/gi, " ")
    .replace(/&#x20;/gi, " ")
    .replace(/[\u00a0\u2007\u202f]/g, " ")
    .trim();
const unsafe = (v: string) =>
  ["__proto__", "prototype", "constructor"].includes(v);
export function parseAmount(input: string): number | null {
  const s = clean(String(input ?? ""))
    .replace(/٬/g, ",")
    .replace(/٫/g, ".")
    .replace(/[−–]/g, "-")
    .replace(/^[🔴🟢⚪️\s]+/u, "")
    .trim();
  if (!s || /[%٪]/.test(s) || /^[-—]+$/.test(s)) return null;
  const m = s.match(
    /^(?:(خسار[ةه]|خسائر|ربح|أرباح|صافي الربح)\s*[:：]?\s*)?(\(\s*[+-]?\s*(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?\s*\)|[+-]?\s*(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)(?:\s*(مليار|بالمليار|مليون|بالمليون))?(?:\s*(?:ريال(?: سعودي)?|دولار(?: أمريكي)?|SAR|USD))?\s*$/i,
  );
  if (!m) return null;
  let n = Number(m[2].replace(/[,()\s]/g, ""));
  if (!Number.isFinite(n)) return null;
  if (m[2].includes("(") || m[1]?.startsWith("خس")) n = -Math.abs(n);
  return n * (m[3]?.includes("مليار") ? 1000 : 1);
}
export function parseDate(
  input: string,
  order?: Options["dateOrder"],
): string | null {
  const m = clean(input).match(/^(\d{1,4})[\/.\-](\d{1,2})[\/.\-](\d{1,4})$/);
  if (!m) return null;
  let y: number, mo: number, d: number;
  if (m[1].length === 4) {
    y = +m[1];
    mo = +m[2];
    d = +m[3];
  } else {
    y = +m[3];
    if (order === "dmy" || +m[1] > 12) {
      d = +m[1];
      mo = +m[2];
    } else if (order === "mdy" || +m[2] > 12) {
      mo = +m[1];
      d = +m[2];
    } else return null;
  }
  if (y < 2000 || y > 2200) return null;
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y &&
    date.getUTCMonth() === mo - 1 &&
    date.getUTCDate() === d
    ? date.toISOString().slice(0, 10)
    : null;
}
function cells(line: string): string[] {
  if (line.includes("\t")) return line.split("\t").map(clean);
  if (line.includes("|"))
    return line
      .replace(/^\s*\||\|\s*$/g, "")
      .split("|")
      .map(clean);
  // CSV including quoted thousands separators.
  if (
    line.includes(",") &&
    !/[:：]/.test(clean(line)) &&
    !/^[^,]*\s\(?[+-]?\d{1,3}(?:,\d{3})+(?:\.\d+)?\)?(?:\s|$)/.test(clean(line))
  ) {
    const out: string[] = [];
    let cell = "",
      quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (quoted && line[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = !quoted;
      } else if (ch === "," && !quoted) {
        out.push(clean(cell));
        cell = "";
      } else cell += ch;
    }
    out.push(clean(cell));
    if (out.length > 1) return out;
  }
  return line
    .split(/\s{2,}/)
    .map(clean)
    .filter(Boolean);
}
export function createEngine(config: {
  companies: Company[];
  aliases?: Record<string, string>;
  experts: string[];
}) {
  const byName = new Map<string, Company>();
  for (const c of config.companies) {
    byName.set(normalize(c.name), c);
    byName.set(c.symbol, c);
  }
  for (const [a, n] of Object.entries(config.aliases || {})) {
    const c = byName.get(normalize(n));
    if (c) byName.set(normalize(a), c);
  }
  const aliases = [...byName.keys()].sort((a, b) => b.length - a.length);
  function resolve(name: string): Company | null {
    return byName.get(normalize(name)) || null;
  }
  function hit(text: string): { company: Company; tail: string } | null {
    const s = clean(text)
      .replace(/^[\s🔹🔸•●📌-]+/u, "")
      .trim();
    const exact = resolve(s);
    if (exact) return { company: exact, tail: "" };
    const colon = s.match(/^(.+?)\s*[:：]\s*(.+)$/);
    if (colon) {
      const c = resolve(colon[1]);
      if (c) return { company: c, tail: colon[2] };
    }
    const norm = normalize(s);
    for (const a of aliases) {
      if (a.length < 3 || !norm.startsWith(a + " ")) continue;
      const parts = s.split(/\s+/);
      for (let i = 1; i < parts.length; i++) {
        if (
          normalize(parts.slice(0, i).join(" ")) === a &&
          /^\(?[+\-\d]|^خسار|^خسائر/.test(parts.slice(i).join(" "))
        )
          return { company: byName.get(a)!, tail: parts.slice(i).join(" ") };
      }
    }
    return null;
  }
  function preview(
    raw: string,
    options: Options,
  ): { rows: ImportRow[]; issues: string[] } {
    const rows: ImportRow[] = [];
    const issues: string[] = [];
    const expert =
      options.expert ||
      config.experts.find((e) => normalize(raw).includes(normalize(e))) ||
      "";
    const lines = digits(raw)
      .replace(/\r/g, "")
      .replace(/[🔹🔸]/gu, "\n")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    const tokens = lines.flatMap((line) =>
      cells(line)
        .filter(Boolean)
        .map((value) => ({ value, line })),
    );
    const firstDataLine = lines.findIndex((line) =>
      cells(line).some((c) => hit(c)),
    );
    const headerText = lines
      .slice(0, firstDataLine < 0 ? lines.length : firstDataLine)
      .join(" ");
    const headerBillion =
      /بالمليار|مليار ريال/.test(headerText) &&
      !/بالمليون|مليون ريال/.test(headerText);
    for (let i = 0; i < tokens.length; i++) {
      const found = hit(tokens[i].value);
      if (!found) continue;
      const tail = found.tail.split(/[🟢🔴⚪]/u)[0].trim();
      const candidates = tail ? [tail] : [];
      for (let j = i + 1; j < tokens.length; j++) {
        if (hit(tokens[j].value) || /^قطاع/.test(clean(tokens[j].value))) break;
        const candidate = tokens[j].value;
        if (
          /[\p{L}]/u.test(candidate) &&
          parseAmount(candidate) === null &&
          !/متوسط|توقعات|^[-: ]*$/.test(candidate)
        )
          break;
        candidates.push(candidate);
      }
      let value = candidates.map(parseAmount).find((v) => v !== null) ?? null;
      let previous: number | null = null,
        date: string | null = null;
      if (options.kind !== "forecast") {
        const rowCells = cells(tokens[i].line);
        const header =
          lines
            .map(cells)
            .find(
              (cs) =>
                cs.some((c) => /الشركة|الشركه/.test(c)) &&
                cs.some((c) => /تاريخ|20\d{2}/.test(c)),
            ) || [];
        const currentIndex = header.findIndex((c) =>
          c.includes(String(options.year)),
        );
        const previousIndex = header.findIndex((c) =>
          c.includes(String(options.year - 1)),
        );
        const hasCurrent = currentIndex >= 0 && rowCells.length > currentIndex;
        const vals = candidates
          .map(parseAmount)
          .filter((v): v is number => v !== null);
        value = hasCurrent
          ? parseAmount(rowCells[currentIndex])
          : vals.length > 1
            ? vals[1]
            : (vals[0] ?? null);
        previous =
          previousIndex >= 0
            ? parseAmount(rowCells[previousIndex] || "")
            : vals.length > 1
              ? vals[0]
              : null;
        const dateToken =
          rowCells.find((c) => /^\d{1,4}[/.\-]\d{1,2}[/.\-]\d{1,4}$/.test(c)) ||
          (i > 0 ? tokens[i - 1].value : "");
        date = parseDate(dateToken, options.dateOrder);
      }
      if (value === null && options.kind === "forecast") {
        issues.push("لا توجد قيمة واضحة للشركة " + found.company.name);
        continue;
      }
      if (headerBillion && value !== null && !/مليار/.test(candidates[0] || ""))
        value *= 1000;
      const amountToken =
        candidates.find((c) => parseAmount(c) !== null) || tail;
      const currency =
        options.currency ||
        (/دولار|USD/i.test(amountToken)
          ? "USD"
          : /ريال|SAR/i.test(amountToken)
            ? "SAR"
            : /أمريكانا|امريكانا/.test(found.company.name) &&
                /دولار|USD/i.test(headerText)
              ? "USD"
              : /دولار|USD/i.test(headerText) &&
                  !/باستثناء|استثناء/.test(headerText)
                ? "USD"
                : "SAR");
      rows.push({
        company: found.company.name,
        symbol: found.company.symbol,
        kind: options.kind,
        year: options.year,
        quarter: options.quarter,
        expert,
        value,
        previous,
        date,
        currency,
        source: options.source || "",
        raw: tokens[i].line,
        errors:
          options.kind === "forecast" && !expert
            ? ["اختر بيت الخبرة"]
            : options.kind !== "forecast" && !date
              ? ["تاريخ مفقود أو غير صالح؛ اختر ترتيب اليوم والشهر"]
              : options.kind === "result" && value === null
                ? ["قيمة الربح مفقودة"]
                : [],
        warnings:
          currency === "USD"
            ? ["القيمة بالدولار؛ يلزم تحديد سعر التحويل للحفظ"]
            : [],
        selected: options.kind === "forecast" ? !!expert : !!date,
      });
    }
    for (const line of lines) {
      const fields = cells(line);
      if (fields.some((c) => hit(c))) continue;
      const colon = clean(line).match(/^([^:]+):\s*(.*)$/);
      if (colon && parseAmount(colon[2]) !== null)
        issues.push("شركة غير معروفة: " + colon[1]);
      else if (
        fields.length > 1 &&
        fields.some((c) => parseAmount(c) !== null) &&
        fields.some((c) => /[\p{L}]/u.test(c)) &&
        !/الشركة|الربع|قطاع|توقعات/.test(line)
      )
        issues.push("صف غير مطابق: " + clean(line).slice(0, 100));
    }
    const periodMatches = [
      ...clean(raw).matchAll(
        /الربع\s+(الأول|الاول|الثاني|الثالث|الرابع)\s+(20\d{2})/g,
      ),
    ];
    const qs: Record<string, Quarter> = {
      الأول: "q1",
      الاول: "q1",
      الثاني: "q2",
      الثالث: "q3",
      الرابع: "q4",
    };
    if (
      periodMatches.length &&
      !periodMatches.some(
        (m) => +m[2] === options.year && qs[m[1]] === options.quarter,
      )
    ) {
      for (const row of rows) {
        row.errors.push("الفترة المختارة لا تطابق عنوان النص");
        row.selected = false;
      }
    }
    const grouped = new Map<string, ImportRow[]>();
    for (const row of rows) {
      const report = row.raw.match(
        /financial-reports\/company-report\/\d+\/(\d{4})\/(70|71|72|1)(?:\b|\/)/,
      );
      if (
        report &&
        (+report[1] !== row.year ||
          (
            { "70": "q1", "71": "q2", "72": "q3", "1": "q4" } as Record<
              string,
              string
            >
          )[report[2]] !== row.quarter)
      ) {
        row.errors.push("فترة رابط التقرير تختلف عن الفترة المختارة");
        row.selected = false;
      }
      const key = [
        row.symbol,
        row.kind,
        row.year,
        row.quarter,
        row.expert,
      ].join("|");
      grouped.set(key, [...(grouped.get(key) || []), row]);
    }
    for (const group of grouped.values())
      if (group.length > 1) {
        const signature = (r: ImportRow) =>
          JSON.stringify([r.value, r.previous, r.date, r.currency]);
        const same = group.every((r) => signature(r) === signature(group[0]));
        group.forEach((r, i) => {
          if (same && i) {
            r.selected = false;
            r.warnings.push("صف مكرر؛ تم استبعاده");
          } else if (!same) {
            r.errors.push("قيم متعارضة لنفس الشركة والفترة؛ اختر صفًا واحدًا");
            r.selected = false;
          }
        });
      }
    return { rows, issues };
  }
  function commit(
    rows: ImportRow[],
    state: State,
    opts: { policy?: "preserve" | "replace"; fx?: number } = {},
  ) {
    const errors: string[] = [];
    const selected = rows.filter((r) => r.selected);
    const seen = new Set<string>();
    for (const row of selected) {
      if (!resolve(row.company) || unsafe(row.company))
        errors.push("شركة غير معروفة: " + row.company);
      if (
        !Number.isInteger(row.year) ||
        row.year < 2000 ||
        row.year > 2200 ||
        !/^q[1-4]$/.test(row.quarter)
      )
        errors.push("فترة غير صالحة");
      if (
        row.kind === "forecast" &&
        (!row.expert?.trim() ||
          unsafe(row.expert) ||
          !/^[\p{L}\p{N} .&()_\-]+$/u.test(row.expert))
      )
        errors.push("بيت الخبرة مطلوب");
      if (!["forecast", "result", "date"].includes(row.kind))
        errors.push("نوع السجل غير صالح");
      if (
        (row.kind === "forecast" &&
          (row.value === null || !Number.isFinite(row.value))) ||
        (row.kind === "result" &&
          ((row.value === null && row.previous === null) ||
            (row.value !== null && !Number.isFinite(row.value))))
      )
        errors.push("قيمة غير صالحة: " + row.company);
      if (row.previous !== null && !Number.isFinite(row.previous))
        errors.push("قيمة مماثلة غير صالحة");
      if (
        (row.kind === "date" && !row.date) ||
        (row.date !== null && parseDate(row.date) !== row.date)
      )
        errors.push("تاريخ غير صالح: " + row.company);
      if (!["SAR", "USD"].includes(row.currency))
        errors.push("عملة غير مدعومة");
      if (
        row.currency === "USD" &&
        row.kind !== "date" &&
        (!Number.isFinite(opts.fx) || Number(opts.fx) <= 0)
      )
        errors.push("حدد سعر تحويل الدولار إلى الريال");
      const id = [
        resolve(row.company)?.symbol || row.company,
        row.year,
        row.quarter,
        row.kind,
        row.expert,
      ].join("|");
      if (seen.has(id))
        errors.push("اختر صفًا واحدًا لكل شركة وبيت خبرة وفترة");
      seen.add(id);
    }
    if (errors.length || !selected.length)
      return {
        state,
        errors: errors.length ? errors : ["اختر صفًا واحدًا على الأقل"],
        conflicts: 0,
        changed: 0,
        skipped: 0,
      };
    const next: State = JSON.parse(JSON.stringify(state));
    next.provenance ||= {};
    let conflicts = 0,
      changed = 0,
      skipped = 0;
    function set(
      target: Record<string, any>,
      key: string,
      value: any,
      provenanceKey: string,
      row: ImportRow,
    ) {
      if (value === null) return;
      if (target[key] === value) {
        skipped++;
        return;
      }
      if (target[key] != null) {
        conflicts++;
        if (opts.policy !== "replace") {
          skipped++;
          return;
        }
      }
      target[key] = value;
      changed++;
      next.provenance![provenanceKey] = row.provenance?.[provenanceKey] || {
        source: row.source,
        raw: row.raw,
        currency: row.currency,
        originalValue: row.value,
        originalPrevious: row.previous,
        fx: row.currency === "USD" ? opts.fx : 1,
        importedAt: new Date().toISOString(),
      };
    }
    for (const item of selected) {
      const resolved = resolve(item.company)!;
      const row = { ...item, company: resolved.name, symbol: resolved.symbol };
      const key = row.year + "_" + row.quarter;
      if (row.kind !== "forecast" && row.date) {
        next.announcements[row.company] ||= {};
        set(
          next.announcements[row.company],
          key,
          row.date,
          [row.symbol, key, "date"].join("|"),
          row,
        );
      }
      if (row.kind === "date") continue;
      next.forecasts[key] ||= [];
      let record = next.forecasts[key].find(
        (r: any) =>
          resolve(r.name)?.symbol === row.symbol || r.name === row.company,
      );
      if (!record) {
        record = { name: row.company, forecasts: {}, actual: null, prev: null };
        next.forecasts[key].push(record);
      }
      record.forecasts ||= {};
      const factor = row.currency === "USD" ? Number(opts.fx) : 1;
      if (row.kind === "forecast")
        set(
          record.forecasts,
          row.expert,
          row.value! * factor,
          [row.symbol, key, "forecast", row.expert].join("|"),
          row,
        );
      else {
        set(
          record,
          "actual",
          row.value === null ? null : row.value * factor,
          [row.symbol, key, "actual"].join("|"),
          row,
        );
        if (row.previous !== null)
          set(
            record,
            "prev",
            row.previous * factor,
            [row.symbol, key, "previous"].join("|"),
            row,
          );
      }
    }
    return { state: next, errors, conflicts, changed, skipped };
  }
  function previewBackup(payload: any): {
    rows: ImportRow[];
    issues: string[];
  } {
    const rows: ImportRow[] = [],
      issues: string[] = [];
    if (!payload || typeof payload !== "object")
      throw Error("صيغة النسخة غير مدعومة");
    const guard = (value: any) => {
      if (!value || typeof value !== "object") return;
      for (const [k, v] of Object.entries(value)) {
        if (unsafe(k)) throw Error("مفتاح غير آمن في النسخة");
        guard(v);
      }
    };
    guard(payload);
    function add(
      name: string,
      year: number,
      quarter: Quarter,
      kind: Kind,
      value: any,
      previous: any,
      date: any,
      expert = "",
    ) {
      const company = resolve(name);
      const errors: string[] = [];
      if (!company) errors.push("الشركة غير معروفة: " + name);
      if (!Number.isInteger(year) || !/^q[1-4]$/.test(quarter))
        errors.push("فترة غير صالحة");
      const amount = value == null ? null : parseAmount(String(value)),
        prev = previous == null ? null : parseAmount(String(previous));
      if (
        (value != null && amount === null) ||
        (previous != null && prev === null)
      )
        errors.push("قيمة غير صالحة");
      const parsedDate = date ? parseDate(String(date)) : null;
      if ((date && !parsedDate) || (kind === "date" && !parsedDate))
        errors.push("تاريخ غير صالح");
      rows.push({
        company: company?.name || name,
        symbol: company?.symbol || "",
        kind,
        year,
        quarter,
        expert,
        value: amount,
        previous: prev,
        date: parsedDate,
        currency: "SAR",
        source: "نسخة احتياطية",
        raw: JSON.stringify({
          name,
          year,
          quarter,
          kind,
          value,
          previous,
          date,
          expert,
        }),
        errors,
        warnings: [],
        selected: !errors.length,
      });
    }
    const records = Array.isArray(payload) ? payload : payload.records;
    if (Array.isArray(records)) {
      for (const r of records) {
        if (!r || typeof r !== "object") {
          issues.push("سجل غير صالح");
          continue;
        }
        add(
          String(r.symbol || r.company || ""),
          Number(r.year),
          String(r.quarter).toLowerCase() as Quarter,
          "date",
          null,
          null,
          r.date,
        );
      }
    } else {
      const forecastData =
        payload.forecasts ||
        payload.data ||
        (Object.keys(payload).some((k) => /^\d{4}_q[1-4]$/.test(k))
          ? payload
          : {});
      const announcements = payload.announcements || {};
      for (const [period, entries] of Object.entries(forecastData)) {
        if (period.startsWith("__")) continue;
        const match = period.match(/^(\d{4})_(q[1-4])$/);
        if (!match || !Array.isArray(entries))
          throw Error("فترة غير صالحة في النسخة: " + period);
        for (const r of entries) {
          if (!r || typeof r.name !== "string")
            throw Error("سجل شركة غير صالح");
          for (const [expert, value] of Object.entries(r.forecasts || {}))
            if (value != null)
              add(
                r.name,
                +match[1],
                match[2] as Quarter,
                "forecast",
                value,
                null,
                null,
                expert,
              );
          if (r.actual != null || r.prev != null)
            add(
              r.name,
              +match[1],
              match[2] as Quarter,
              "result",
              r.actual,
              r.prev,
              announcements[r.name]?.[period],
            );
        }
      }
      for (const [name, dates] of Object.entries(announcements)) {
        if (!dates || typeof dates !== "object" || Array.isArray(dates))
          throw Error("سجل مواعيد غير صالح");
        for (const [period, date] of Object.entries(dates)) {
          const m = period.match(/^(\d{4})_(q[1-4])$/);
          if (!m) throw Error("فترة إعلان غير صالحة");
          // Result rows above already carry the same date.
          if (
            !rows.some(
              (r) =>
                r.company === resolve(name)?.name &&
                r.year === +m[1] &&
                r.quarter === m[2] &&
                r.date === date,
            )
          )
            add(name, +m[1], m[2] as Quarter, "date", null, null, date);
        }
      }
    }
    if (!rows.length && !issues.length && ![payload.expertRegistry, payload.experts].some(value => Array.isArray(value) && value.length))
      throw Error("لا توجد بيانات قابلة للاستيراد");
    if (payload.provenance)
      for (const row of rows) {
        row.provenance = payload.provenance;
        const key = [
          row.symbol,
          row.year + "_" + row.quarter,
          row.kind === "forecast"
            ? "forecast"
            : row.kind === "date"
              ? "date"
              : "actual",
          ...(row.kind === "forecast" ? [row.expert] : []),
        ].join("|");
        row.source = payload.provenance[key]?.source || row.source;
      }
    return { rows, issues };
  }
  return { resolve, preview, commit, previewBackup };
}
/** Seed once at the adapter; existing visitor values always take precedence. */
export function seedHistory(
  source: any[],
  saved: Record<string, Record<string, string>>,
  resolve: (name: string) => Company | null,
) {
  const next: Record<string, Record<string, string>> = JSON.parse(
    JSON.stringify(saved),
  );
  for (const company of source) {
    const name =
      resolve(String(company.symbol))?.name || resolve(company.company)?.name;
    if (!name || unsafe(name)) continue;
    next[name] ||= {};
    for (const record of company.history) {
      const quarter = String(record.quarter).toLowerCase();
      if (
        !/^q[1-4]$/.test(quarter) ||
        !Number.isInteger(record.year) ||
        parseDate(record.date) !== record.date
      )
        continue;
      const key = record.year + "_" + quarter;
      if (next[name][key] == null) next[name][key] = record.date;
    }
  }
  return next;
}
/** Match the same fiscal quarter, shift dates by fiscal-year difference, use a robust median. */
export function projectDate(
  history: Record<string, string>,
  year: number,
  quarter: Quarter,
): any {
  const actual = history[year + "_" + quarter];
  if (actual && parseDate(actual))
    return {
      date: actual,
      confirmed: true,
      confidence: "confirmed",
      count: 1,
      rangeStart: actual,
      rangeEnd: actual,
      lag: 0,
    };
  const records = Object.entries(history)
    .filter(
      ([key, date]) =>
        key.endsWith("_" + quarter) &&
        +key.slice(0, 4) < year &&
        +key.slice(0, 4) >= year - 5 &&
        parseDate(date),
    )
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-3);
  if (!records.length) return null;
  const values = records
    .map(([key, date]) => {
      const d = new Date(date + "T12:00:00Z");
      d.setUTCFullYear(d.getUTCFullYear() + year - +key.slice(0, 4));
      return d.getTime();
    })
    .sort((a, b) => a - b);
  const median = (v: number[]) =>
    v.length % 2
      ? v[Math.floor(v.length / 2)]
      : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
  const center = median(values),
    spread = Math.max(
      records.length < 3 ? 14 : 3,
      Math.min(
        30,
        Math.ceil(
          median(
            values.map((v) => Math.abs(v - center)).sort((a, b) => a - b),
          ) / 86400000,
        ),
      ),
    );
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  return {
    date: iso(center),
    confirmed: false,
    confidence:
      records.length >= 3 ? "high" : records.length === 2 ? "medium" : "low",
    count: records.length,
    rangeStart: iso(center - spread * 86400000),
    rangeEnd: iso(center + spread * 86400000),
    lag: 0,
    method: "نفس الربع المالي في السنوات السابقة",
  };
}
