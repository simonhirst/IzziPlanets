# Implementation Tracker

Date Started: 2026-02-14

## High
- [x] IZZI-H-001 Migrate to ESM runtime and modern Three.js pinning
- [x] IZZI-H-002 Add production build pipeline with hashed assets
- [x] IZZI-H-003 Replace remote Earth texture loading with local compressed texture pipeline
- [x] IZZI-H-004 Progressive world bootstrapping by scale bands
- [x] IZZI-H-005 Reduce transparent point overdraw with GPU-efficient starfield strategy
- [x] IZZI-H-006 Rework culling strategy (do not globally disable frustum culling)
- [x] IZZI-H-007 Accessibility baseline hardening (zoom, focus, keyboard)
- [x] IZZI-H-008 Add reduced-motion mode and animation policy
- [x] IZZI-H-009 Introduce data provenance and high-accuracy ephemeris mode
- [x] IZZI-H-010 Security hardening for third-party assets
- [x] IZZI-H-011 Add observability stack (CWV + render telemetry + error monitoring)
- [x] IZZI-H-012 Add CI quality gates (not just deployment)
- [x] IZZI-H-013 WebGL resilience and fallback strategy

## Medium
- [x] IZZI-M-001 Split main into modules with clear boundaries
- [x] IZZI-M-002 Add TypeScript for domain model safety
- [x] IZZI-M-003 Move heavy geometry/texture generation off main thread
- [x] IZZI-M-004 Optimize hover picking path with layers/BVH and event throttling
- [x] IZZI-M-005 Reduce per-frame property writes for stable scenes
- [x] IZZI-M-006 Content and learning UX layer
- [x] IZZI-M-007 Improve mobile ergonomics and touch target consistency
- [x] IZZI-M-008 Add offline/near-offline support for core assets
- [x] IZZI-M-009 Add automated visual regression testing for major camera bands
- [x] IZZI-M-010 Formalize performance budgets and release criteria

## Low
- [x] IZZI-L-001 Remove duplicated visibility logic paths
- [x] IZZI-L-002 Standardize coding style and modern syntax
- [x] IZZI-L-003 Document query parameters and debug modes
- [x] IZZI-L-004 Add attributions and license metadata for data/textures
- [x] IZZI-L-005 Refine diagnostics UX for non-technical users
- [x] IZZI-L-006 Add deterministic seed presets for demos
- [x] IZZI-L-007 Minor CSS compositing cleanup for low-end devices

