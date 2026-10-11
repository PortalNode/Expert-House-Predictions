// Accept complete numeric entries, including Arabic digits; never coerce an empty field to zero.
function parseEntryNumber(value) {
  let text = String(value ?? '').trim()
    .replace(/[٠-٩]/g, digit => '٠١٢٣٤٥٦٧٨٩'.indexOf(digit))
    .replace(/[۰-۹]/g, digit => '۰۱۲۳۴۵۶۷۸۹'.indexOf(digit))
    .replace(/٬/g, ',').replace(/٫/g, '.').replace(/−/g, '-');
  const parenthesized = /^\(.*\)$/.test(text);
  if (parenthesized) text = text.slice(1, -1).trim();
  if (!/^[+-]?(?:(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d*)?|\.\d+)$/.test(text)) return null;
  const number = Number(text.replace(/,/g, ''));
  return Number.isFinite(number) ? (parenthesized ? -Math.abs(number) : number) : null;
}
if (typeof module !== 'undefined') module.exports = { parseEntryNumber };
