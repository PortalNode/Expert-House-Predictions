// Only run on a trusted local export. Evaluates the data-construction prefix in an isolated VM.
const fs = require("node:fs");
const vm = require("node:vm");
const crypto = require("node:crypto");
const source = fs.readFileSync(process.argv[2], "utf8");
const start = source.indexOf("const announcementData =");
const end = source.indexOf("const { meta, forecasts, sectorSummaries }");
if (start < 0 || end < start) throw Error("Unrecognized announcement export");
const data = vm.runInNewContext(
  source.slice(start, end) + ";JSON.stringify(announcementData)",
  Object.create(null),
  { timeout: 2000 },
);
const parsed = JSON.parse(data);
const result = {
  sourceFile: "مواعيد إعلانات الشركات السعودية.html",
  sha256: crypto.createHash("sha256").update(source).digest("hex"),
  ...parsed,
};
fs.writeFileSync(
  "assets/announcement-history.js",
  "/* Imported historical data; dates are supplied by the attached project, not independently verified. */\nglobalThis.ANNOUNCEMENT_HISTORY = " +
    JSON.stringify(result) +
    ";\n",
);
console.log(
  JSON.stringify({
    companies: parsed.forecasts.length,
    records: parsed.forecasts.reduce((n, c) => n + c.history.length, 0),
    meta: parsed.meta,
    first: parsed.forecasts[0].company,
    last: parsed.forecasts.at(-1).company,
  }),
);
