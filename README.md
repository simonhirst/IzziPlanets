# IzziPlanets

Interactive WebGL experience that scales from the solar system to galaxy and universe context views.

## Development

- Install: `npm ci`
- Dev server: `npm run dev`
- Build: `npm run build`
- Preview build: `npm run preview`
- Lint: `npm run lint`
- Type check: `npm run typecheck`
- Unit tests: `npm run test`
- Visual tests: `npm run test:visual`

## URL Query Parameters

- `quality=ultraLow|low|medium|high`: Override quality tier.
- `profile=optimized|legacy`: Choose modern or legacy profile paths.
- `adaptiveRes=off`: Disable dynamic resolution scaling.
- `view=galaxy|universe|all`: Start in a distant camera view.
- `bench=1`: Enable benchmark mode output.
- `benchMs=<number>`: Benchmark sample duration in ms.
- `benchWarmupMs=<number>`: Benchmark warmup duration in ms.
- `seed=<integer>`: Deterministic random seed.
- `seedPreset=cinematic|classroom|benchmark|sunrise`: Named deterministic seeds.
- `autorotate=off`: Disable autorotation.
- `staticFrame=1`: Freeze simulation motion for deterministic captures.
- `ciVisual=1`: Disable dynamic diagnostics for stable visual snapshots.
- `compressedTextures=off`: Force non-KTX2 texture fallback.
- `workerClouds=off`: Disable worker-based point cloud generation.

## Benchmark Output

Benchmark mode writes JSON to `window.__izziBenchResult` and to hidden `#benchResult` text.

Schema fields:

- `profile`
- `quality`
- `durationMs`
- `warmupMs`
- `animateTicks`
- `sampledFrames`
- `fpsAvg`
- `frameMsAvg`
- `frameMsP95`
- `drawCallsAvg`
- `trianglesAvg`
- `pointsAvg`
- `pixelRatio`
- `viewport.width`
- `viewport.height`

## Data Modes

- `Educational`: Analytic orbital model for speed and offline behavior.
- `High Accuracy`: Uses precomputed ephemeris snapshot (`public/data/ephemeris/latest.json`) generated from JPL Horizons tooling.

Use `node scripts/fetch-horizons.mjs YYYY-MM-DD` to refresh the snapshot.
