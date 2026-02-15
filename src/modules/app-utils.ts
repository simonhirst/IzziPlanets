import type { GuidedTourPreset } from "../types/domain";

export function buildAppVersion() {
  const envVersion = import.meta.env.VITE_APP_VERSION;
  if (envVersion) return envVersion;
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, ".");
  return `v${stamp}`;
}

export function supportsReducedMotion() {
  return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function buildGuidedTourPresets(): GuidedTourPreset[] {
  return [
    { key: "inner", label: "Inner Planets", distance: 60 },
    { key: "outer", label: "Outer Planets", distance: 220 },
    { key: "galaxy", label: "Milky Way", distance: 9000 },
    { key: "universe", label: "Observable Universe", distance: 2800000 },
  ];
}
