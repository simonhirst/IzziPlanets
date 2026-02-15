# IzziPlanets Deep Improvement Report

Date: 2026-02-14
Project root: `c:\GIT\IzziPlanets`
Reviewer: Codex (automated + research-backed audit)

## 1) What Makes A Great Planet-Viewer Web App

A high quality planet-viewing web application should score well across all of these dimensions:

1. Scientific trust
- Clearly states data source, accuracy limits, and update time.
- Offers at least one high-fidelity mode (ephemeris-based) and one fast educational mode.
- Uses consistent units and discloses scale distortions.

2. Interaction quality
- Smooth camera and navigation on desktop and mobile.
- Fast targeting (search, jump-to body, context-aware labels).
- Keyboard and assistive technology support.

3. Visual clarity
- Strong visual hierarchy (where am I, what am I looking at, what changed).
- Motion that informs, not distracts.
- Readable UI under bright and low-vision conditions.

4. Performance and reliability
- Stable frame pacing under different device classes.
- Predictable memory usage and recovery from WebGL context loss.
- Measured budgets (draw calls, points/triangles, interaction latency, CWV).

5. Delivery and maintainability
- Versioned and pinned dependencies.
- Repeatable build pipeline, CI gates, and production monitoring.
- Modular code that can be extended safely.

## 2) What Makes A Poor Planet-Viewer App

1. No provenance
- Users cannot tell if positions are educational approximations or physically accurate values.

2. Heavy visuals with no adaptive strategy
- Large transparent point clouds, expensive blur stacks, and no staged loading.

3. Mouse-only UX
- Keyboard, reduced-motion, zoom, and focus support are missing or weak.

4. No operational discipline
- No test gates, no performance budgets, no production telemetry.

5. Monolithic implementation
- Single large script slows iteration and makes regressions likely.

## 3) Current Project Snapshot (Evidence)

### 3.1 Strengths

1. Strong baseline rendering architecture already present
- Dynamic resolution controller: `main.js:2120`.
- Quality tier system by device capabilities: `main.js:53` to `main.js:98`.
- Telemetry panel and benchmark mode already implemented: `main.js:41`, `main.js:1558`, `main.js:1665`.

2. Useful scene management primitives already in code
- Visibility gating for galaxy/universe scales: `main.js:1977`.
- Planet LOD with far impostors: `main.js:671` to `main.js:718`.

3. Good UI concept density
- Planet nav, scale bar, context label, diagnostics panel already exist in `index.html` and `main.js`.

### 3.2 Main Risk Areas

1. Dependency/runtime age and delivery model
- Legacy global scripts from CDN: `index.html:109` to `index.html:110`.
- Current npm latest observed locally on 2026-02-14: `three@0.182.0` (from `npm view three version`).
- CDN validation from this machine confirms ESM path behavior at `0.182.0`:
  - 404: `/build/three.min.js`
  - 404: `/examples/js/controls/OrbitControls.min.js`
  - 200: `/build/three.module.min.js`
  - 200: `/examples/jsm/controls/OrbitControls.js`

2. Scene complexity and overdraw risk
- Approximate point counts by quality profile based on current formulas in `main.js`:
  - `ultraLow`: ~37,044 points
  - `low`: ~86,436 points
  - `medium`: ~169,785 points
  - `high`: ~308,700 points
- Many large transparent/additive point systems and several elements with frustum culling disabled.

3. Accessibility blockers
- Viewport disables zoom: `index.html:5` (`user-scalable=no`, `maximum-scale=1.0`).
- Focus outline removed without robust replacement for all controls: `styles.css:710`.
- No reduced-motion media query handling found in current styles.

4. Delivery/ops gaps
- Deployment workflow exists, but no CI quality gates (lint, test, perf, accessibility): `.github/workflows/static.yml:1`.

## 4) Prioritized Improvement Backlog

Each item below has a unique ID and implementation-ready guidance.

## High Impact Items

### IZZI-H-001 - Migrate to ESM runtime and modern Three.js pinning
Impact: High
Category: Performance, Maintainability, Security
Primary files: `index.html:109`, `index.html:110`, `main.js`

Problem
- App currently depends on legacy non-module Three.js paths and global objects.

Implementation
1. Replace global script tags with one `<script type="module" src="./src/main.ts">` (or `main.js` if staying JS).
2. Install pinned dependency (`three@0.182.0` currently latest observed locally on 2026-02-14).
3. Import controls from `three/examples/jsm/controls/OrbitControls.js`.
4. Add a migration patch list for renderer/color-management API differences if needed.
5. Keep a short-lived compatibility branch until visual parity is verified.

Acceptance criteria
- App runs without global `THREE` on window.
- No CDN 404s from Three.js paths.
- Visual parity with current baseline in sun/galaxy/universe views.

---

### IZZI-H-002 - Add production build pipeline with hashed assets
Impact: High
Category: Delivery, Performance
Primary files: project root, `.github/workflows/static.yml:1`

Problem
- Static direct files are deployed without bundling/tree-shaking/hash-based cache strategy.

Implementation
1. Introduce Vite (or equivalent) for bundling.
2. Output content-hashed assets (`main.[hash].js`, `styles.[hash].css`).
3. Generate source maps for production error debugging.
4. Add build step to GitHub workflow before upload.
5. Add size budget checks in CI (raw, gzip, brotli).

Acceptance criteria
- Build artifact directory only includes hashed assets and static media.
- Deployment workflow fails when bundle/perf budgets regress.

---

### IZZI-H-003 - Replace remote Earth texture loading with local compressed texture pipeline
Impact: High
Category: Performance, Reliability
Primary files: `main.js:272`, `main.js:1203`, assets pipeline

Problem
- High-resolution textures load from `raw.githubusercontent.com` at runtime and are not GPU-compressed.

Implementation
1. Vendor textures into repository (or dedicated asset CDN under your control).
2. Convert planet textures to BasisU/KTX2 variants and keep fallback PNG/JPG.
3. Use `KTX2Loader` with transcoder setup for supported devices.
4. Load lower-resolution variants for `ultraLow`/`low` profiles.
5. Keep texture metadata manifest (`name`, `sizes`, `format`, `colorSpace`).

Acceptance criteria
- No runtime dependency on `raw.githubusercontent.com` for core textures.
- Material setup chooses compressed texture where supported.
- Startup time and memory improve on mid-range mobile.

---

### IZZI-H-004 - Progressive world bootstrapping by scale bands
Impact: High
Category: Performance, UX
Primary files: `main.js:588`, `main.js:940`, `main.js:1066`, `main.js:1977`

Problem
- Galaxy and universe geometry are created up front during init, even before user reaches those scales.

Implementation
1. Split initialization into phases:
- Phase A: solar-only essentials.
- Phase B: galaxy assets at first threshold crossing.
- Phase C: universe assets at second threshold crossing.
2. Add async state flags (`galaxyReady`, `universeReady`, `loadingState`).
3. Show subtle loading indicator when entering new scale band.
4. Cache generated geometry once created, do not recreate every crossing.

Acceptance criteria
- Initial load excludes galaxy/universe geometry creation.
- Entering each scale band triggers one-time incremental load.

---

### IZZI-H-005 - Reduce transparent point overdraw with GPU-efficient starfield strategy
Impact: High
Category: Performance, Visual quality
Primary files: `main.js:946`, `main.js:1070`, `main.js:1096`, `main.js:1139`

Problem
- Current scene uses very large additive transparent point clouds, which can bottleneck fill rate and blending.

Implementation
1. Introduce per-band density budgets by device tier and current camera distance.
2. Collapse similar point systems where possible to reduce draw calls/material state switches.
3. Move scale-fade math into custom shader uniforms instead of many JS opacity writes.
4. Prefer logarithmic density/importance sampling for distant fields.
5. Validate quality with screenshot diffs and user perception checks.

Acceptance criteria
- Lower average frame time at galaxy/universe zoom levels.
- No obvious visual regression in density impression.

---

### IZZI-H-006 - Rework culling strategy (do not globally disable frustum culling)
Impact: High
Category: Performance
Primary files: `main.js:335`, multiple call sites (`main.js:608`, `main.js:963`, `main.js:1091`, etc.)

Problem
- Frustum culling is disabled broadly across many objects, increasing unnecessary draw work.

Implementation
1. Keep frustum culling enabled by default.
2. Disable only for specific objects proven to pop incorrectly.
3. Set or compute reliable bounding volumes for large points geometry.
4. Add debug flag to visualize culling decisions.
5. Benchmark draw calls before/after by camera band.

Acceptance criteria
- Net draw-call reduction in off-axis views.
- No visible popping artifacts during camera motion.

---

### IZZI-H-007 - Accessibility baseline hardening (zoom, focus, keyboard)
Impact: High
Category: Accessibility, UX
Primary files: `index.html:5`, `styles.css:710`, `main.js:1836`

Problem
- Page currently blocks zoom and has limited focus visibility/keyboard parity.

Implementation
1. Remove `user-scalable=no` and `maximum-scale=1.0` from viewport.
2. Add robust `:focus-visible` styles to all interactive elements.
3. Add keyboard shortcuts and focus flows for:
- Planet selection
- Reset view
- Telemetry/menu toggles
4. Add skip-to-controls link for keyboard users.
5. Verify target sizes for touch controls.

Acceptance criteria
- Pinch zoom works on mobile.
- Keyboard-only user can complete core interactions.
- Focus state always visible.

---

### IZZI-H-008 - Add reduced-motion mode and animation policy
Impact: High
Category: Accessibility, Performance
Primary files: `styles.css` animations and transitions, `main.js` camera tween/autorotate

Problem
- Many persistent animations/transitions are active with no reduced-motion fallback.

Implementation
1. Add `@media (prefers-reduced-motion: reduce)` section.
2. Disable or shorten non-essential animations (brand pulses, panel reveals, long transitions).
3. In JS, default `controls.autoRotate = false` when reduced motion requested.
4. Add explicit user toggle that overrides system preference.

Acceptance criteria
- Reduced motion setting meaningfully lowers motion load.
- UI remains readable and usable.

---

### IZZI-H-009 - Introduce data provenance and high-accuracy ephemeris mode
Impact: High
Category: Domain fidelity, Trust
Primary files: `main.js:1278`, `main.js:1286`, UI additions

Problem
- Current live positioning is low-precision model based and not clearly disclosed to user.

Implementation
1. Add mode labels: `Educational (fast)` and `High Accuracy (JPL)`.
2. For high-accuracy mode, build a backend precompute pipeline (SPK/Horizons snapshots) and serve cached JSON by date range.
3. Add UI panel with:
- Data source
- Last updated timestamp
- Accuracy statement
4. Keep current analytic model as offline fallback.

Acceptance criteria
- User can see source and precision of current positions.
- High-accuracy mode differs from educational mode by documented model choice.

---

### IZZI-H-010 - Security hardening for third-party assets
Impact: High
Category: Security, Delivery
Primary files: `index.html:109`, `index.html:110`

Problem
- External scripts are loaded without SRI and with broad trust assumptions.

Implementation
1. Prefer self-hosting built assets after ESM migration.
2. If any external scripts remain, add `integrity` + `crossorigin` attributes.
3. Define CSP policy (meta baseline now, strict header if platform allows later).
4. Add dependency update checks and changelog review gate.

Acceptance criteria
- No unsigned third-party script in production path.
- CSP blocks obvious injection classes without breaking app.

---

### IZZI-H-011 - Add observability stack (CWV + render telemetry + error monitoring)
Impact: High
Category: Reliability, Performance
Primary files: `main.js:1709`, new telemetry module

Problem
- In-app telemetry exists, but there is no production RUM and no error monitoring loop.

Implementation
1. Add `web-vitals` capture for INP/LCP/CLS.
2. Send anonymized perf beacons with device tier + quality tier + camera band.
3. Add JS error and promise rejection logging with release/version tags.
4. Track WebGL errors/context loss count and fallback mode activation.

Acceptance criteria
- Dashboard shows percentile trends per release.
- Perf regressions can be tied to commit/version.

---

### IZZI-H-012 - Add CI quality gates (not just deployment)
Impact: High
Category: Delivery, Engineering quality
Primary files: `.github/workflows/static.yml:1`, new workflow files

Problem
- Current workflow deploys static content but does not enforce quality requirements.

Implementation
1. Add separate CI workflow on PR:
- Lint
- Unit tests
- Build
- Size budget
- Lighthouse CI (desktop/mobile config)
2. Add required status checks before merge.
3. Publish benchmark artifact JSON for comparison.

Acceptance criteria
- PR cannot merge when quality/perf gates fail.
- Historical CI artifacts available for regression analysis.

---

### IZZI-H-013 - WebGL resilience and fallback strategy
Impact: High
Category: Reliability
Primary files: `main.js` renderer init/events

Problem
- No explicit handling of `webglcontextlost` and `webglcontextrestored` in current code.

Implementation
1. Add listeners on canvas for context loss/restoration.
2. Prevent default on loss event and display temporary UI state.
3. Recreate renderer resources on restore path.
4. Add fallback quality downgrade after repeated loss.

Acceptance criteria
- App recovers cleanly from simulated context loss in supported browsers.


## Medium Impact Items

### IZZI-M-001 - Split `main.js` into modules with clear boundaries
Impact: Medium
Category: Maintainability
Primary files: `main.js`

Implementation
1. Create modules:
- `render/`
- `scene/`
- `ui/`
- `data/`
- `perf/`
2. Extract shared constants/config into a single typed config file.
3. Keep public API small (`initApp()`).

Acceptance criteria
- No single file above ~500 lines for core logic.
- Module ownership and imports are clear.

---

### IZZI-M-002 - Add TypeScript for domain model safety
Impact: Medium
Category: Maintainability, Correctness
Primary files: all JS source files after modularization

Implementation
1. Introduce TypeScript incremental migration (`allowJs` first).
2. Define types for `PlanetDef`, `MoonDef`, `TelemetrySample`, `QualityPreset`.
3. Enforce strict null checks on UI elements and event wiring.

Acceptance criteria
- Build includes type-check step.
- High-risk domain/state objects are typed.

---

### IZZI-M-003 - Move heavy geometry/texture generation off main thread
Impact: Medium
Category: Performance
Primary files: procedural generators in `main.js` (`create*Texture`, setup functions)

Implementation
1. Use worker(s) for procedural texture generation and data array assembly.
2. Pass transferable buffers back to main thread.
3. Keep immediate placeholders while workers run.

Acceptance criteria
- Lower main-thread blocking during startup.
- UI remains responsive during scene initialization.

---

### IZZI-M-004 - Optimize hover picking path with layers/BVH and event throttling
Impact: Medium
Category: Performance, Interaction
Primary files: `main.js:1936`, `main.js:1954`, `main.js:1966`

Implementation
1. Move pickables to dedicated layer and raycast that layer only.
2. Keep picking cadence adaptive to movement velocity and zoom.
3. Evaluate `three-mesh-bvh` only if pick set grows significantly.

Acceptance criteria
- Stable hover latency with less raycast CPU overhead.

---

### IZZI-M-005 - Reduce per-frame property writes for stable scenes
Impact: Medium
Category: Performance
Primary files: `main.js:1977`, `main.js:2155`

Implementation
1. Expand epsilon guards to all opacity/scale writes.
2. Cache last applied material values globally by object id.
3. Batch updates by camera band instead of per-frame loops when static.

Acceptance criteria
- Fewer material/property mutations in profiler.
- No visual flicker on threshold transitions.

---

### IZZI-M-006 - Content and learning UX layer
Impact: Medium
Category: Product value
Primary files: new UI module + current nav components

Implementation
1. Add info drawer per selected body:
- Radius, period, distance, moon count
- Live vs simulated data badge
2. Add search command palette (`/` key or button) for jump-to body.
3. Add guided storyline presets (Inner planets, Gas giants, Milky Way, Observable universe).

Acceptance criteria
- User can discover and focus any major object in < 3 interactions.

---

### IZZI-M-007 - Improve mobile ergonomics and touch target consistency
Impact: Medium
Category: UX, Accessibility
Primary files: `styles.css` mobile sections (`styles.css:922` onward)

Implementation
1. Ensure all tap targets meet minimum size guidance.
2. Rebalance right-side vertical controls to avoid thumb strain and overlap.
3. Add optional compact mode to hide non-essential diagnostic controls on mobile.

Acceptance criteria
- No accidental tap errors in common mobile flows.
- Core controls remain reachable one-handed.

---

### IZZI-M-008 - Add offline/near-offline support for core assets
Impact: Medium
Category: Delivery, Reliability
Primary files: service worker files + build config

Implementation
1. Add service worker precache for shell and key textures.
2. Use runtime caching with stale-while-revalidate for non-critical assets.
3. Version caches by app release id.

Acceptance criteria
- Repeat visits load quickly with weak connectivity.
- Cache invalidation is deterministic per release.

---

### IZZI-M-009 - Add automated visual regression testing for major camera bands
Impact: Medium
Category: Quality assurance
Primary files: test harness (Playwright or similar)

Implementation
1. Capture snapshots at deterministic camera positions and quality tiers.
2. Compare against baseline with explicit tolerance.
3. Run snapshots in CI for PRs touching scene/UI code.

Acceptance criteria
- Visual regressions are detected before deployment.

---

### IZZI-M-010 - Formalize performance budgets and release criteria
Impact: Medium
Category: Performance governance
Primary files: docs + CI config

Implementation
1. Set target budgets by device class:
- FPS/frametime percentile
- Draw call maxima by camera band
- JS bundle size and texture memory ceilings
2. Fail CI when budget is exceeded beyond tolerance.
3. Add release checklist with benchmark evidence.

Acceptance criteria
- Every release has measurable pass/fail performance evidence.


## Low Impact Items

### IZZI-L-001 - Remove duplicated visibility logic paths
Impact: Low
Category: Maintainability
Primary files: `main.js:1977` to `main.js:2118`

Implementation
1. Consolidate repeated asteroid/kuiper/solar-detail visibility checks into one helper.
2. Keep legacy mode shim thin or remove if no longer needed.

Acceptance criteria
- Single source of truth for visibility gating.

---

### IZZI-L-002 - Standardize coding style and modern syntax
Impact: Low
Category: Maintainability
Primary files: `main.js`

Implementation
1. Replace broad `var` usage with `const`/`let` where safe.
2. Add formatter/linter config.
3. Keep comments short, precise, and ASCII-clean.

Acceptance criteria
- Consistent style and fewer accidental scope bugs.

---

### IZZI-L-003 - Document query parameters and debug modes
Impact: Low
Category: Developer experience
Primary files: README/docs

Implementation
1. Document supported query params (`quality`, `profile`, `bench`, `view`, `adaptiveRes`).
2. Add examples for reproducible benchmark runs.
3. Describe expected output JSON schema for bench mode.

Acceptance criteria
- New contributors can run and compare benchmarks without reading source.

---

### IZZI-L-004 - Add attributions and license metadata for data/textures
Impact: Low
Category: Compliance, Trust
Primary files: README/docs/about panel

Implementation
1. Add source attribution for astronomy data/models and texture assets.
2. Include license details and update cadence notes.

Acceptance criteria
- Users can inspect source and licensing in-app or in docs.

---

### IZZI-L-005 - Refine diagnostics UX for non-technical users
Impact: Low
Category: UX
Primary files: telemetry UI section in `index.html` + `main.js`

Implementation
1. Keep advanced telemetry behind expandable section by default.
2. Add plain-language tooltips for FPS, draw calls, memory counters.

Acceptance criteria
- Diagnostics are informative without overwhelming default experience.

---

### IZZI-L-006 - Add deterministic seed presets for demos
Impact: Low
Category: Product polish
Primary files: randomization and startup state sections in `main.js`

Implementation
1. Add named seed presets for consistent demos and screenshots.
2. Expose presets in URL or UI menu.

Acceptance criteria
- Team can reproduce identical visual states reliably.

---

### IZZI-L-007 - Minor CSS compositing cleanup for low-end devices
Impact: Low
Category: Performance polish
Primary files: `styles.css`

Implementation
1. Reduce layered blur/shadow intensity in low-power mode.
2. Gate non-critical visual effects by media query and quality tier.

Acceptance criteria
- Slightly better UI compositing cost on low-end mobile with minimal aesthetic loss.


## 5) Recommended Execution Order

1. Foundation
- IZZI-H-001, IZZI-H-002, IZZI-H-012

2. Critical user and trust issues
- IZZI-H-007, IZZI-H-008, IZZI-H-009, IZZI-H-010

3. Core performance wins
- IZZI-H-003, IZZI-H-004, IZZI-H-005, IZZI-H-006, IZZI-H-013

4. Product depth and durability
- IZZI-H-011 and all medium items

5. Cleanup and polish
- Low items

## 6) Validation Checklist After Implementation

1. Functional
- Planet focus, reset, time controls, and scale scrub all work on desktop + mobile.

2. Performance
- Compare benchmark JSON before/after in identical quality profile and seed.
- Validate frame-time percentiles (P50/P95/P99), draw calls, and points by camera band.

3. Accessibility
- Keyboard-only flow passes for all primary controls.
- Zoom works on mobile.
- Reduced-motion path verified.

4. Scientific transparency
- Source/provenance visible and mode clearly labeled.

5. Delivery
- CI gates pass and deployment artifact is hashed/versioned.

## 7) External Research Sources Used

1. Three.js manual (optimization)
- https://threejs.org/manual/#en/optimize-lots-of-objects

2. Three.js manual (resource cleanup)
- https://threejs.org/manual/#en/cleanup

3. MDN WebGL best practices
- https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices

4. MDN WebGL context loss event
- https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/webglcontextlost_event

5. MDN prefers-reduced-motion
- https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion

6. MDN canvas element (alternative content/accessibility context)
- https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/canvas

7. web.dev INP
- https://web.dev/articles/inp

8. web.dev LCP
- https://web.dev/articles/lcp

9. web.dev CLS
- https://web.dev/articles/cls

10. web.dev Core Web Vitals thresholds
- https://web.dev/articles/defining-core-web-vitals-thresholds

11. W3C WAI-ARIA APG menu button pattern
- https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/

12. WCAG 2.2 understanding: contrast minimum
- https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html

13. WCAG 2.2 understanding: focus visible
- https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html

14. WCAG 2.2 understanding: target size minimum
- https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html

15. MDN Subresource Integrity
- https://developer.mozilla.org/en-US/docs/Web/Security/Subresource_Integrity

16. MDN Content-Security-Policy header
- https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy

17. JPL Horizons system docs
- https://ssd.jpl.nasa.gov/horizons/manual.html

18. NAIF SPICE IDs and data ecosystem
- https://naif.jpl.nasa.gov/pub/naif/toolkit_docs/FORTRAN/req/naif_ids.html

19. Workbox docs (service worker caching toolkit)
- https://developer.chrome.com/docs/workbox

## 8) Limitations of This Review

1. No headless browser benchmark run was executed inside this audit, so performance conclusions are code-and-architecture based plus existing internal telemetry design.
2. Recommendations are intentionally broad and implementation-ready; exact numerical gains require before/after benchmark captures on your target hardware matrix.

## 9) Implementation Status (Completed)

All proposal IDs have been implemented in this pass and are tracked in `IMPLEMENTATION_TRACKER.md`.

- [x] IZZI-H-001
- [x] IZZI-H-002
- [x] IZZI-H-003
- [x] IZZI-H-004
- [x] IZZI-H-005
- [x] IZZI-H-006
- [x] IZZI-H-007
- [x] IZZI-H-008
- [x] IZZI-H-009
- [x] IZZI-H-010
- [x] IZZI-H-011
- [x] IZZI-H-012
- [x] IZZI-H-013
- [x] IZZI-M-001
- [x] IZZI-M-002
- [x] IZZI-M-003
- [x] IZZI-M-004
- [x] IZZI-M-005
- [x] IZZI-M-006
- [x] IZZI-M-007
- [x] IZZI-M-008
- [x] IZZI-M-009
- [x] IZZI-M-010
- [x] IZZI-L-001
- [x] IZZI-L-002
- [x] IZZI-L-003
- [x] IZZI-L-004
- [x] IZZI-L-005
- [x] IZZI-L-006
- [x] IZZI-L-007
