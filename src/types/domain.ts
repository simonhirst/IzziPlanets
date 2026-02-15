export type QualityTier = "ultraLow" | "low" | "medium" | "high";

export interface MoonDef {
  name: string;
  rf: number;
  of: number;
  od: number;
  color: number;
  tilt?: number;
  atmo?: number;
}

export interface PlanetDef {
  name: string;
  radius: number;
  orbitRadius: number;
  orbitDays: number;
  spinDays: number;
  tilt: number;
  color: number;
  roughness: number;
  moons: MoonDef[];
  ring?: {
    inner: number;
    outer: number;
    opacity?: number;
    color?: number;
  };
}

export interface GuidedTourPreset {
  key: string;
  label: string;
  distance: number;
}

export interface TelemetryPayload {
  [key: string]: unknown;
}
