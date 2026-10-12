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
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
