# Performance Budgets

## Runtime Budgets

Desktop target (high-quality):
- P50 frame time: <= 16 ms
- P90 frame time: <= 22 ms
- P99 frame time: <= 33 ms
- Draw calls (inner system): <= 280
- Draw calls (galaxy view): <= 220
- Draw calls (universe view): <= 240

Mid-tier laptop target (medium quality):
- P50 frame time: <= 20 ms
- P90 frame time: <= 28 ms
- P99 frame time: <= 40 ms

Mobile target (ultraLow/low):
- P50 frame time: <= 24 ms
- P90 frame time: <= 36 ms
- P99 frame time: <= 50 ms

## Delivery Budgets

- Main JS (gzip): <= 220 KB
- Main CSS (gzip): <= 10 KB
- HTML shell (gzip): <= 4 KB

## CI Enforcement

- `npm run verify` must pass for merge.
- Lighthouse checks in CI must meet threshold warnings in `lighthouserc.json`.
- Visual snapshots must remain stable in Playwright.
