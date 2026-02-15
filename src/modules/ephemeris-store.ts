export type EphemerisPoint = {
  x: number;
  y: number;
  z: number;
};

export type EphemerisSnapshot = {
  source: string;
  generatedAt: string;
  validAt: string;
  coordinateFrame: string;
  bodies: Record<string, EphemerisPoint>;
};

const SNAPSHOT_URL = "/data/ephemeris/latest.json";

export function createEphemerisStore() {
  let cached: EphemerisSnapshot | null = null;

  async function loadLatest(): Promise<EphemerisSnapshot> {
    if (cached) return cached;
    const response = await fetch(SNAPSHOT_URL, { cache: "force-cache" });
    if (!response.ok) {
      throw new Error(`Failed to load ephemeris snapshot: ${response.status}`);
    }
    const json = await response.json();
    cached = json as EphemerisSnapshot;
    return cached;
  }

  function clearCache() {
    cached = null;
  }

  return {
    loadLatest,
    clearCache,
  };
}
