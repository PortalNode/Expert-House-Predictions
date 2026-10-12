# Validation — 2026-10-12

Base repository: `PortalNode/Expert-House-Predictions`, commit `63bafb5` (remote HEAD fetched for this integration).

- 22 Node behavior tests passed, including all 9 pre-existing tests.
- TypeScript 5.9.3 strict/no-emit check passed.
- Actual isolated Chrome run passed with external requests blocked: eight SNB forecasts; eight user-supplied result rows; saved values after reload; fiscal Q3 June announcement; full source-company coverage; file import of the original calendar's JSON backup; undo without losing earlier forecasts; quota failure without changing committed financial state; zero and new research-house persistence.
- At a 390px viewport, document width is 390px. Mobile calendar and review use cards; desktop calendar paginates twenty companies.
- No page JavaScript errors were observed in that browser run.
- Source HTML extraction: 233 companies, 3,825 historical records, source snapshot 2026-08-11. Original source hash is stored in `assets/announcement-history.js`. Combined initial date count is 3,851 after preserving the old app's dates. Conflicting old dates remain intact.
- Original 2025 financial data and 41 published Riyad Capital Q3 2026 forecasts remain available.

Not claimed: live validation of external stock-price/remote AI services, independent verification of supplied financial numbers or historical dates, or deployment to GitHub Pages. The financial examples are selectable examples and are not seeded into users' saved data.
