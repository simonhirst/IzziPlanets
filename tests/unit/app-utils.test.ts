import { describe, expect, it } from "vitest";
import { buildGuidedTourPresets, buildAppVersion, uid } from "../../src/modules/app-utils";

describe("app utils", () => {
  it("builds guided tour presets", () => {
    const presets = buildGuidedTourPresets();
    expect(presets.length).toBeGreaterThanOrEqual(4);
    expect(presets.some((item) => item.key === "galaxy")).toBe(true);
  });

  it("generates deterministic version prefix", () => {
    expect(buildAppVersion().startsWith("v")).toBe(true);
  });

  it("creates unique IDs", () => {
    const a = uid("test");
    const b = uid("test");
    expect(a).not.toBe(b);
  });
});
