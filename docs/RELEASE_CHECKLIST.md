# Release Checklist

1. Run quality gates:
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`
- `npm run test:visual`

2. Confirm performance telemetry:
- Compare benchmark JSON against previous release.
- Verify frame-time percentiles and draw calls by camera band.

3. Validate accessibility:
- Keyboard-only navigation works.
- Focus-visible states are present.
- Reduced-motion behavior verified.
- Mobile pinch zoom remains enabled.

4. Validate data provenance:
- `Data Provenance` panel shows mode/source/time.
- If shipping updated ephemeris, regenerate snapshot and commit.

5. Deployment:
- CI workflow passes.
- GitHub Pages deploy uses `dist` artifact only.
