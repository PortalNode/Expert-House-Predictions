# Validation — integration baseline, 2026-10-12

Base repository: `PortalNode/Expert-House-Predictions`, commit `63bafb5` (remote HEAD fetched for this integration).

- 22 Node behavior tests passed, including all 9 pre-existing tests.
- TypeScript 5.9.3 strict/no-emit check passed.
- Actual isolated Chrome run passed with external requests blocked: eight SNB forecasts; eight user-supplied result rows; saved values after reload; fiscal Q3 June announcement; full source-company coverage; file import of the original calendar's JSON backup; undo without losing earlier forecasts; quota failure without changing committed financial state; zero and new research-house persistence.
- At a 390px viewport, document width is 390px. Mobile calendar and review use cards; desktop calendar paginates twenty companies.
- No page JavaScript errors were observed in that browser run.
- Source HTML extraction: 233 companies, 3,825 historical records, source snapshot 2026-08-11. Original source hash is stored in `assets/announcement-history.js`. Combined initial date count is 3,851 after preserving the old app's dates. Conflicting old dates remain intact.
- Original 2025 financial data and 41 published Riyad Capital Q3 2026 forecasts remain available.

Not claimed: live validation of external stock-price/remote AI services, independent verification of supplied financial numbers or historical dates, or deployment to GitHub Pages. The financial examples are selectable examples and are not seeded into users' saved data.

## Approved interface update — 2026-10-13

- 34 Node behavior tests and strict TypeScript checking pass.
- Existing import, migration, date coverage, quota failure, undo, zero/loss and custom-house browser tests pass.
- Added isolated browser coverage for creating an empty house, reload persistence, Arabic-normalized duplicate rejection, alias-based input, rename and archive, source-preserving backup restoration, registry-only backup restoration, all three persistent palettes, company navigation, and removed stock routes/requests.
- All three palettes checked at a 390px mobile viewport with no document overflow in results, houses, or announcements. Tables keep their own intentional horizontal scroll.
- No JavaScript page errors or price-fetch requests observed.
- Date evidence and financial seed data were not altered by this UI update. Earlier historical audit limitations remain described in README. Remote AI providers were not exercised.
