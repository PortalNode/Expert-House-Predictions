"""Match published financial-result notices to fiscal quarters conservatively."""

import collections
import calendar
import datetime as dt
import json
import pathlib
import re

from dateutil import parser as dateparser


ROOT = pathlib.Path(__file__).resolve().parents[1]
HISTORY = json.loads((ROOT / "assets" / "announcement-history.js").read_text().split(" = ", 1)[1].rstrip(" ;\n"))
SOURCE = {company["symbol"]: company for company in HISTORY["forecasts"]}
ARCHIVE = ROOT / "work" / "announcement-archive"
EVIDENCE = ROOT / "data" / "issuer-results-evidence.json"
_EVIDENCE_CACHE = None
MONTHS = r"Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?"
DATE_PATTERNS = [
    re.compile(r"(?<!\d)(20\d{2}\s*[-/]\s*\d{1,2}\s*[-/]\s*\d{1,2})(?!\d)"),
    re.compile(r"(?<!\d)(\d{1,2}\s*[-/]\s*\d{1,2}\s*[-/]\s*20\d{2})(?!\d)"),
    re.compile(rf"(?<!\w)(\d{{1,2}}(?:st|nd|rd|th)?\s+\b(?:{MONTHS})\b\.?\s+20\d{{2}})(?!\w)", re.I),
    re.compile(rf"(?<!\w)((?:{MONTHS})\b\.?\s+\d{{1,2}},?\s+20\d{{2}})(?!\w)", re.I),
]
EXCLUDE = re.compile(r"correction|corrective|addendum|regarding|inability|unable|intention|conference|expected announcement|delay|postpone|update on|latest development|supplementary", re.I)


def period_end(title):
    if not re.search(r"financial results?|financial statements?", title, re.I) or EXCLUDE.search(title):
        return None
    candidates = []
    for pattern in DATE_PATTERNS:
        for match in pattern.finditer(title):
            value = match.group(1)
            try:
                normalized = re.sub(r"\s*[-/]\s*", "-", value)
                normalized = re.sub(r"(\d)(st|nd|rd|th)\b", r"\1", normalized, flags=re.I)
                parsed = dateparser.parse(normalized, dayfirst=bool(re.match(r"\d{1,2}[-/ ]", normalized)))
                if 2020 <= parsed.year <= 2027:
                    candidates.append((match.start(), parsed.date()))
            except (ValueError, OverflowError):
                pass
    if not candidates:
        return None
    anchor = re.search(r"(?:period|year)[^,;.]{0,35}?\b(?:end(?:ing|ed)?)(?:\s+on)?\b", title, re.I)
    if anchor:
        after = [candidate for candidate in candidates if anchor.end() <= candidate[0] <= anchor.end() + 75]
        if after:
            return min(after)[1]
    return min(candidates)[1]


def entries_for(symbol):
    global _EVIDENCE_CACHE
    if EVIDENCE.exists():
        if _EVIDENCE_CACHE is None:
            _EVIDENCE_CACHE = json.loads(EVIDENCE.read_text())
        return _EVIDENCE_CACHE.get(symbol, [])
    path = ARCHIVE / f"{symbol}.json"
    if not path.exists():
        return []
    entries = json.loads(path.read_text())["entries"]
    result = []
    for entry in entries:
        end = period_end(entry["title"])
        if end and end <= dt.date.fromisoformat(entry["published"][:10]) and end.day == calendar.monthrange(end.year, end.month)[1]:
            result.append({**entry, "periodEnd": end.isoformat(), "month": end.month})
    return result


def infer_fiscal_end(company, entries):
    by_date = collections.defaultdict(list)
    for entry in entries:
        by_date[entry["published"][:10]].append(entry)
    end_months = []
    for record in company["history"]:
        for entry in by_date[record["date"]]:
            q = int(record["quarter"][1])
            fiscal_end = (entry["month"] + 3 * (4 - q) - 1) % 12 + 1
            end_months.append(fiscal_end)
    if not end_months:
        return None, 0
    month, matches = collections.Counter(end_months).most_common(1)[0]
    return month, matches / len(end_months)


def fiscal_key(period_end, fiscal_end_month):
    date = dt.date.fromisoformat(period_end)
    distance = (fiscal_end_month - date.month) % 12
    if distance not in (0, 3, 6, 9):
        return None
    quarter = 4 - distance // 3
    fiscal_year = date.year + (date.month > fiscal_end_month)
    return f"{fiscal_year}|Q{quarter}"


def quarter_hint(title):
    # The disclosure heading describes elapsed months in the company's fiscal year.
    # Take the largest value when a report mentions both standalone and cumulative periods.
    months_to_quarter = {"three": 1, "six": 2, "nine": 3, "twelve": 4}
    matches = [months_to_quarter[word.lower()] for word in re.findall(
        r"\b(three|six|nine|twelve)[-\s]*months?\b", title, re.I)]
    matches += [{3: 1, 6: 2, 9: 3, 12: 4}[int(number)] for number in re.findall(
        r"\b(3|6|9|12)\s*months?\b", title, re.I)]
    if matches:
        return max(matches)
    if re.search(r"\bannual\b|\byear ended\b|\byear ending\b|\bfull year\b", title, re.I):
        return 4
    return None


def direct_fiscal_key(entry):
    quarter = quarter_hint(entry["title"])
    if not quarter:
        return None
    end = dt.date.fromisoformat(entry["periodEnd"])
    fiscal_end = (end.month + 3 * (4 - quarter) - 1) % 12 + 1
    fiscal_year = end.year + (end.month > fiscal_end)
    return f"{fiscal_year}|Q{quarter}"


def main():
    additions = []
    discrepancies = []
    parsed = []
    weak = []
    direct_matches = 0
    direct_mismatches = []
    for symbol, company in SOURCE.items():
        entries = entries_for(symbol)
        fiscal_end, confidence = infer_fiscal_end(company, entries)
        if fiscal_end is None:
            weak.append((symbol, company["company"], fiscal_end, round(confidence, 2), len(entries)))
        existing = {f"{r['year']}|{r['quarter']}": r for r in company["history"]}
        candidates = collections.defaultdict(list)
        for entry in entries:
            key = direct_fiscal_key(entry)
            if not key and fiscal_end is not None and confidence >= .8:
                key = fiscal_key(entry["periodEnd"], fiscal_end)
            if key:
                candidates[key].append(entry)
                parsed.append((symbol, key, entry["published"][:10], entry["title"]))
                if entry["published"][:10] in {r["date"] for r in company["history"]}:
                    if key in existing and existing[key]["date"] == entry["published"][:10]:
                        direct_matches += 1
                    else:
                        direct_mismatches.append((symbol, key, entry["published"][:10], entry["title"]))
        for key, notices in candidates.items():
            if key.endswith("Q4") and any(re.search(r"annual|year ended|year ending", e["title"], re.I) for e in notices):
                notices = [e for e in notices if re.search(r"annual|year ended|year ending", e["title"], re.I)]
            notices.sort(key=lambda e: e["published"])
            chosen = notices[0]
            date = chosen["published"][:10]
            year, quarter = key.split("|")
            if int(year) < 2021 or int(year) > 2026:
                continue
            record = {"symbol": symbol, "company": company["company"], "year": int(year), "quarter": quarter, "date": date, "periodEnd": chosen["periodEnd"], "url": chosen["url"], "title": chosen["title"], "fiscalEndMonth": fiscal_end, "mappingConfidence": confidence}
            if key not in existing:
                additions.append(record)
            elif existing[key]["date"] != date:
                discrepancies.append({**record, "oldDate": existing[key]["date"]})
    result = {"additions": additions, "discrepancies": discrepancies, "weakMapping": weak, "parsedCount": len(parsed), "directMatches": direct_matches, "directMismatches": direct_mismatches}
    (ROOT / "work" / "reconciled-announcements.json").write_text(json.dumps(result, ensure_ascii=False, indent=2))
    print("companies",len(SOURCE),"parsed",len(parsed),"additions",len(additions),"discrepancies",len(discrepancies),"weak",len(weak),"directMatches",direct_matches,"directMismatches",len(direct_mismatches))
    print("adds by year",dict(sorted(collections.Counter(a["year"] for a in additions).items())))
    print("weak",weak[:35])
    print("discrepancies",discrepancies[:20])


if __name__ == "__main__":
    main()
