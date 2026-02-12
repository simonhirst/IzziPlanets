# Performance Deep Dive (No Visual Quality Loss)

## Current State Summary
- Renderer quality controls already exist (`low`/`medium`/`high`) with adaptive pixel ratio scaling.
- Live diagnostics overlay is available for desktop and exposes render/load metrics.
- Scene includes heavy galaxy/universe point-cloud content and layered HUD glass effects.

## Changes Implemented In This Pass
1. **Startup orbit distribution fix**
- Planets no longer start aligned on one axis.
- Sim mode now preserves initial/randomized orbital phase on boot, and only re-projects orbit phase when switching from `live` back to `sim`.

2. **Large-scene visibility gating**
- `galaxyGroup` and `universeGroup` are hidden until camera distance is near their reveal zones.
- This reduces unnecessary draw calls and blending work while you are in inner-solar views, without reducing visual fidelity when zooming out.

3. **Dependency loading efficiency (current version line)**
- Switched to `OrbitControls.min.js` for the current `three@0.128.0` runtime.
- Added `defer` on scripts so parsing/downloading is less blocking.
- Added CDN preconnect aligned to `cdn.jsdelivr.net`.

## Third-Party Dependency Strategy

### Verified latest status
- `three` npm latest: **`0.182.0`** (registry timestamp: `2025-12-10T16:30:23.346Z`).
- Newer `three` versions are **ESM-first**; legacy paths used by this app are no longer available in latest:
  - `build/three.min.js` -> 404 on latest
  - `examples/js/controls/OrbitControls.js` -> 404 on latest
  - `build/three.module.min.js` and `examples/jsm/controls/OrbitControls.js` are available

### Implication
A direct in-place bump from `0.128.0` to `0.182.0` is not a safe drop-in. It requires an **ES module migration** (and likely minor API updates for color/output settings and control imports).

## Recommended Roadmap (Prioritized)

### Phase 1: Low-risk wins (immediate)
1. Keep the new distance-based visibility gating for galaxy/universe geometry.
2. Add `visibilitychange` throttling/pause for non-visible tabs.
3. Cache infrequently changing UI/material values to avoid redundant property writes each frame.
4. Add rolling frame-time percentiles (P50/P90/P99) to telemetry for more stable tuning than single-frame FPS.

### Phase 2: Render-loop optimization (no quality loss)
1. Prevent unnecessary raycast work when pointer is idle outside scene.
2. Reduce repeated opacity/material writes when the value change is below epsilon.
3. Gate expensive far-scene updates behind scale bands (already started via visibility gating).

### Phase 3: Dependency modernization (controlled)
1. Migrate runtime to ESM imports (`three.module.min.js` + `examples/jsm/...`).
2. Pin exact versions and use immutable CDN URLs for cache stability.
3. Validate parity with visual regression checks (desktop + iPhone viewport snapshots).
4. Only then bump from `0.128.0` to current stable (`0.182.x`) with an explicit migration checklist.

## Validation Plan
1. Use desktop telemetry to compare before/after for:
- Draw calls
- Frame time P90
- FPS stability at Sun, galaxy threshold, universe threshold

2. Test matrix:
- Desktop high-DPR
- Mid-range laptop
- iPhone viewport (portrait + landscape)

3. Accept changes only when:
- Inner-solar scene has reduced draw calls/frame cost
- No visible loss in planetary, galaxy, or HUD quality
- Mobile interaction remains smooth and layout intact
