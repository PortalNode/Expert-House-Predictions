# Unified earnings and announcements

Workflow: Matt Pocock codebase-design + TDD, vertical slices.
User approved test seams: pasted-text/file parsing, company-period persistence, and non-destructive migration.

Keep the static GitHub Pages app and its existing storage keys. Introduce a TypeScript domain module behind createEngine({companies, aliases, experts}) for preview, validated merge, and backup conversion. The browser and tests use the same interface. Currency is explicit; SAR is the comparison currency. USD needs an explicit conversion rate at import. Fiscal period comes from selected/report period, never from the announcement month. Unresolved names, periods, and amounts are visible and cannot silently save. Existing values win by default; replacement is deliberate. Source history remains separate from user changes; defaults are seeded once. No backend or extra runtime dependencies.

Historical source: attached announcement HTML, full original records, source hash, fiscal metadata retained. Do not interpret supplied historical dates or financial examples as independently verified research. Do not publish sample forecasts automatically.

## Browser behavior and migration

- `finUnifiedV1` is the authoritative atomic snapshot. Existing `fin25v5` and announcement storage keys are read by the old bootstrap and mirrored for compatibility after a successful save. The unified snapshot wins on reload.
- The attached history is seeded once, preserving any saved company-period date. No sample earnings/forecasts are automatically published or saved.
- The original `mawid-argaam-imports-v1` data in a separate file/origin is not accessible to this app. Export JSON from the original app and import it through the new file input. Its `{records:[...]}` format and the old forecasting app's version 4 backups are supported.
- Import preview allows field corrections and explicit selection of flagged rows. Unknown companies must be resolved to the company directory. Missing research houses must be selected or entered. Period mismatches and duplicate conflicts start unchecked. Commit independently revalidates all selected rows.
- Preserve-existing is the default merge strategy. Replace-existing is explicit. Successful imports retain original value, currency, conversion rate, text, and source. One-step undo lasts until the next non-import save; it cannot undo unrelated later edits.
- Backups export the combined state, including historical dates and built-in 2025 values. Restore is a merge preview, never an automatic destructive replacement.
- Date forecasts use the same fiscal quarter from up to three of the last five fiscal years. There is no calendar-quarter lag assumption, so education and other non-December year ends remain aligned. Confidence labels describe sample size, not calibrated probabilities. No statutory deadline is inferred.
- Calendar supports company/symbol search, sector/status filters, date/coverage sorting, twenty-row pages, responsive mobile cards, and full historical detail with retained source time/verification.

## Development

No new runtime dependencies. Node 22.18+ can run the TypeScript behavior tests and strip erasable types to the committed browser asset. `npm run build` must follow any edit to `src/earnings-core.ts`. `npm test` runs old and new tests. Optional `npm run typecheck` uses TypeScript 5.9.3. The strict compiler was run using an already-installed compiler during delivery; no system packages were installed.

Browser test: `npm run test:browser`, with an installed Playwright and Chrome. Set `PLAYWRIGHT_PATH` and `CHROME_PATH` if not in standard module/browser locations. It runs against a fresh isolated browser context, blocks external networking, and exercises saving, reloading, all eight example results, undo, legacy backup import, quota errors, zero values, custom houses, and mobile overflow. Screenshots are written under `work/browser-check/`.

## Verification scope

The user-provided financial figures are parser examples, not newly verified financial research. Historical records are copied from the supplied HTML with its source hash. Existing stock price fetching and optional remote AI services are unchanged and were not exercised against live external providers. Core import/calendar workflows were tested with external requests blocked.
