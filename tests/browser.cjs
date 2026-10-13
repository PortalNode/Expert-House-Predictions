const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");
const path = require("node:path");
const assert = require("node:assert/strict");
(async () => {
  require("node:fs").mkdirSync("work/browser-check", { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.CHROME_PATH ||
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1080 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("https://**/*", (r) => r.abort());
  await page.goto("file://" + path.resolve("index.html"));
  await page.waitForSelector("#unifiedWorkspace");
  assert.equal(
    await page.evaluate(() => S.announcements["الرياض"]["2021_q1"]),
    "2021-04-29",
  );
  assert.equal(
    await page.evaluate(() => S.announcements["الرياض"]["2025_q3"]),
    "2025-10-20",
  );
  assert.deepEqual(await page.evaluate(() => [
    S.announcements["المتقدمة"]["2026_q2"],
    S.announcements["المتقدمة"]["2026_q3"],
    S.announcements["إكسترا"]["2025_q3"],
  ]), ["2026-07-12", "2026-10-11", "2025-10-07"]);
  assert.equal(
    await page.evaluate(() => predictionForCompany("سينومي ريتيل", 2021, "q3").confirmed),
    false,
  );
  console.log(
    "source gaps",
    await page.evaluate(() =>
      ANNOUNCEMENT_HISTORY.forecasts
        .filter(
          (c) =>
            !S.announcements[
              canonicalCompany(
                COMPANIES.find((x) => x.symbol === c.symbol)?.name,
              )
            ],
        )
        .map((c) => c.company),
    ),
  );
  console.log(
    "initial",
    await page.evaluate(() => ({
      companies: COMPANIES.length,
      dates: Object.values(S.announcements).reduce(
        (n, r) => n + Object.keys(r).length,
        0,
      ),
      errors: document.getElementById("uError").textContent,
    })),
  );
  await page.selectOption("#uExample", "social");
  await page.click("#uPreview");
  console.log(
    "social",
    await page
      .locator('#uReview [data-field="value"]')
      .evaluateAll((es) => es.map((e) => e.value)),
  );
  assert.equal(await page.locator("#uReview [data-review]").count(), 8);
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({
    path: "work/browser-check/desktop-import.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.click("#uCommit");
  assert.equal(await page.locator(".u-success").count(), 1);
  await page.reload();
  await page.waitForSelector("#unifiedWorkspace");
  assert.equal(
    await page.evaluate(
      () =>
        S.extra["2026_q3"].find((r) => r.name === "سابك").forecasts[
          "الأهلي المالية"
        ],
    ),
    -414,
  );
  await page.locator("#uClear").click();
  await page.selectOption("#uExample", "results");
  await page.click("#uPreview");
  console.log(
    "results",
    await page
      .locator('#uReview [data-field="value"]')
      .evaluateAll((es) => es.map((e) => e.value)),
  );
  assert.equal(await page.locator("#uReview [data-review]").count(), 8);
  await page.click("#uCommit");
  assert.equal(await page.locator(".u-success").count(), 1);
  await page.click("#uViewCalendar");
  await page.selectOption("#uFiscalEnd", "03-31");
  assert.equal(await page.locator("#uCalendarBody tr").count(), 5);
  assert.ok((await page.locator("#uCalendarBody").innerText()).includes("أنابيب الشرق"));
  await page.selectOption("#uFiscalEnd", "fund");
  assert.ok((await page.locator("#uCalendarBody").innerText()).includes("ريت"));
  await page.selectOption("#uFiscalEnd", "");
  await page.selectOption("#annYear", "2021");
  await page.selectOption("#annQuarter", "q3");
  await page.selectOption("#uStatus", "audit");
  await page.fill("#uCalendarSearch", "سينومي ريتيل");
  assert.ok((await page.locator("#uCalendarBody").innerText()).includes("يحتاج تدقيق"));
  await page.fill("#uCalendarSearch", "");
  await page.selectOption("#uStatus", "all");
  await page.selectOption("#annYear", "2026");
  await page.selectOption("#annQuarter", "q3");
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({
    path: "work/browser-check/desktop-calendar.png",
    fullPage: false,
    animations: "disabled",
  });
  await page.fill("#uCalendarSearch", "الوطنية للتعليم");
  assert.equal(await page.locator("#uCalendarBody tr").count(), 1);
  console.log("national", await page.locator("#uCalendarBody").innerText());
  await page.locator("#uCalendarBody [data-open]").first().click();
  await page.click("#uFullHistory summary");
  assert.ok(await page.locator("#uFullHistory a[href^='https://']").count() > 0);
  await page.screenshot({
    path: "work/browser-check/desktop-history.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });

  await page.selectOption("#sectionSelect", "t0");
  await page.evaluate(() =>
    document.getElementById("toast").classList.remove("on"),
  );
  await page.screenshot({
    path: "work/browser-check/mobile-import.png",
    fullPage: true,
    animations: "disabled",
  });
  console.log(
    "overflow",
    await page.evaluate(() => ({
      viewport: innerWidth,
      width: document.documentElement.scrollWidth,
    })),
  );

  // Undo only the latest results import, preserving the earlier forecast import.
  await page.click("#uUndo");
  assert.equal(
    await page.evaluate(
      () => S.extra["2026_q3"].find((r) => r.name === "المتقدمة").actual,
    ),
    null,
  );
  assert.equal(
    await page.evaluate(
      () =>
        S.extra["2026_q3"].find((r) => r.name === "سابك").forecasts[
          "الأهلي المالية"
        ],
    ),
    -414,
  );
  // A mawid backup is imported through the exact file UI.
  await page.click('[data-method="file"]');
  await page.setInputFiles("#uFile", {
    name: "mawid.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        records: [
          { symbol: "4291", year: 2027, quarter: "Q3", date: "2027-06-10" },
        ],
      }),
    ),
  });
  await page.waitForSelector("#uReview [data-review]");
  assert.equal(await page.locator("#uReview [data-review]").count(), 1);
  await page.click("#uCommit");
  assert.equal(
    await page.evaluate(() => S.announcements["الوطنية للتعليم"]["2027_q3"]),
    "2027-06-10",
  );
  // Actual storage failure must leave the financial state unchanged.
  await page.click('[data-kind="forecast"]');
  await page.click('[data-method="manual"]');
  await page.fill("#uCompany", "سابك");
  await page.fill("#uExpert", "بيت اختبار");
  await page.fill("#uValue", "0");
  await page.click("#uPreview");
  await page.evaluate(() => {
    window._setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === "finUnifiedV1")
        throw new DOMException("Quota exceeded", "QuotaExceededError");
      return window._setItem.call(this, k, v);
    };
  });
  await page.click("#uCommit");
  assert.ok((await page.locator("#uError").innerText()).includes("لم يتم حفظ"));
  assert.equal(
    await page.evaluate(
      () =>
        S.extra["2026_q3"].find((r) => r.name === "سابك").forecasts[
          "بيت اختبار"
        ],
    ),
    undefined,
  );
  await page.evaluate(() => (Storage.prototype.setItem = window._setItem));
  await page.click("#uCommit");
  assert.equal(await page.locator(".u-success").count(), 1);
  await page.reload();
  await page.waitForSelector("#unifiedWorkspace");
  assert.equal(
    await page.evaluate(
      () =>
        S.extra["2026_q3"].find((r) => r.name === "سابك").forecasts[
          "بيت اختبار"
        ],
    ),
    0,
  );
  console.log(
    "undo, mawid migration, quota, zero, custom house, reload: passed",
  );
  console.log("errors", errors);
  assert.deepEqual(errors, []);
  const migrated = await browser.newPage();
  await migrated.addInitScript(() => {
    localStorage.setItem("finUnifiedV1", JSON.stringify({
      version: 5,
      seedVersion: 1,
      forecasts: {},
      announcements: { "الرياض": { "2021_q1": "2021-04-30", "2025_q3": "2025-10-19" } },
      provenance: {},
    }));
  });
  await migrated.goto("file://" + path.resolve("index.html"));
  await migrated.waitForSelector("#unifiedWorkspace");
  assert.deepEqual(
    await migrated.evaluate(() => [
      S.announcements["الرياض"]["2021_q1"],
      S.announcements["الرياض"]["2025_q3"],
      S.announcements["نماء للكيماويات"]["2021_q1"],
    ]),
    ["2021-04-30", "2025-10-19", "2021-05-02"],
  );
  await migrated.close();
  const previousRelease = await browser.newPage();
  await previousRelease.addInitScript(() => {
    localStorage.setItem("finUnifiedV1", JSON.stringify({
      version: 5,
      seedVersion: 2,
      forecasts: {},
      announcements: {
        "المتقدمة": { "2026_q2": "2026-07-21" },
        "إكسترا": { "2026_q3": "2026-10-09" },
      },
      provenance: {},
    }));
  });
  await previousRelease.goto("file://" + path.resolve("index.html"));
  await previousRelease.waitForSelector("#unifiedWorkspace");
  assert.deepEqual(
    await previousRelease.evaluate(() => [
      S.announcements["المتقدمة"]["2026_q3"],
      S.announcements["المتقدمة"]["2026_q2"],
      S.announcements["إكسترا"]["2026_q3"],
      S.announcements["تسهيل"]["2026_q3"],
      JSON.parse(localStorage.getItem("finUnifiedV1")).seedVersion,
    ]),
    ["2026-10-11", "2026-07-12", "2026-10-09", "2026-10-08", 4],
  );
  await previousRelease.close();
  const previousPreliminary = await browser.newPage();
  await previousPreliminary.addInitScript(() => {
    localStorage.setItem("finUnifiedV1", JSON.stringify({
      version: 5, seedVersion: 3, forecasts: {},
      announcements: {
        "المجموعة السعودية": { "2025_q4": "2026-03-11" },
        "أسواق ع العثيم": { "2024_q4": "2025-03-26" },
      }, provenance: {},
    }));
  });
  await previousPreliminary.goto("file://" + path.resolve("index.html"));
  await previousPreliminary.waitForSelector("#unifiedWorkspace");
  assert.deepEqual(await previousPreliminary.evaluate(() => [
    S.announcements["المجموعة السعودية"]["2025_q4"],
    S.announcements["أسواق ع العثيم"]["2024_q4"],
    JSON.parse(localStorage.getItem("finUnifiedV1")).seedVersion,
  ]), ["2026-02-05", "2025-03-26", 4]);
  await previousPreliminary.close();
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
