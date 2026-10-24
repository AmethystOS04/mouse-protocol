import type { MouseLightingMode } from "../drivers/mouse-types.js";

export type Rival3Gen2Rgb = { r: number; g: number; b: number };
export type Rival3Gen2Zone = 1 | 2 | 3;
export type Rival3Gen2DefaultLighting = "off" | "reactive" | "rainbow" | "reactive-rainbow";

export const RIVAL3_GEN2_ZONES = [1, 2, 3] as const;
export const RIVAL3_GEN2_ZONE_LABELS: Record<Rival3Gen2Zone, string> = {
  1: "Top",
  2: "Middle",
  3: "Bottom",
};

export const RIVAL3_GEN2_LIGHTING_ZONE_MODES: readonly MouseLightingMode[] = ["Static", "Off", "Cycling"];
export const RIVAL3_GEN2_REACTIVE_MODES: readonly MouseLightingMode[] = ["Reactive", "Off"];
export const RIVAL3_GEN2_BRIGHTNESS_LEVELS = Array.from({ length: 101 }, (_, value) => value);

const ZONE_MASK: Record<Rival3Gen2Zone, number> = { 1: 0x01, 2: 0x02, 3: 0x04 };
const RGB_COMPONENT_COUNT = 3;

function validateChannel(value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > 255) {
    throw new Error("RGB channels must be integers from 0 to 255.");
  }
  return value;
}

function validateRgb(color: Rival3Gen2Rgb): Rival3Gen2Rgb {
  return { r: validateChannel(color.r), g: validateChannel(color.g), b: validateChannel(color.b) };
}

/**
 * `21 <mask> <R1 G1 B1> <R2 G2 B2> <R3 G3 B3>`
 *
 * The mask selects which positional RGB triplets are latched. Unselected
 * triplets are still carried in the report, so this helper always emits the
 * complete three-zone payload.
 */
export function steelseriesRival3Gen2EncodeZoneColor(zone: Rival3Gen2Zone, color: Rival3Gen2Rgb): Uint8Array {
  const rgb = validateRgb(color);
  const triplets = Array.from({ length: RIVAL3_GEN2_ZONES.length * RGB_COMPONENT_COUNT }, () => 0);
  const offset = (zone - 1) * RGB_COMPONENT_COUNT;
  triplets[offset] = rgb.r;
  triplets[offset + 1] = rgb.g;
  triplets[offset + 2] = rgb.b;
  return new Uint8Array([0x21, ZONE_MASK[zone], ...triplets]);
}

/** `23 <brightness>` with brightness in the inclusive 0–100 percent range. */
export function steelseriesRival3Gen2EncodeBrightness(brightness: number): Uint8Array {
  if (!Number.isInteger(brightness) || brightness < 0 || brightness > 100) {
    throw new Error("SteelSeries Rival 3 Gen 2 brightness must be an integer from 0 to 100.");
  }
  return new Uint8Array([0x23, brightness]);
}

/** `22 <mask>` enrolls the selected zones in the rainbow engine. */
export function steelseriesRival3Gen2EncodeRainbow(mask: number): Uint8Array {
  if (!Number.isInteger(mask) || mask < 0 || mask > 0x07) {
    throw new Error("SteelSeries Rival 3 Gen 2 rainbow mask must be between 0 and 7.");
  }
  return new Uint8Array([0x22, mask]);
}

/**
 * `26 <enable> 00 <R> <G> <B>` arms or disables the click-reactive flash.
 * The enable byte is required by the Gen 2 firmware.
 */
export function steelseriesRival3Gen2EncodeReactiveColor(color: Rival3Gen2Rgb | null): Uint8Array {
  if (color === null) return new Uint8Array([0x26, 0x00, 0x00, 0x00, 0x00, 0x00]);
  const rgb = validateRgb(color);
  return new Uint8Array([0x26, 0x01, 0x00, rgb.r, rgb.g, rgb.b]);
}

/** `27 <rainbow> <reactive>` controls the live lighting engines and startup state. */
export function steelseriesRival3Gen2EncodeDefaultLighting(mode: Rival3Gen2DefaultLighting): Uint8Array {
  const values: Record<Rival3Gen2DefaultLighting, readonly [number, number]> = {
    off: [0x00, 0x00],
    reactive: [0x00, 0x01],
    rainbow: [0x01, 0x00],
    "reactive-rainbow": [0x01, 0x01],
  };
  const [rainbow, reactive] = values[mode];
  return new Uint8Array([0x27, rainbow, reactive]);
}

export function steelseriesRival3Gen2ZoneMask(zone: Rival3Gen2Zone): number {
  return ZONE_MASK[zone];
}

export function steelseriesRival3Gen2RgbToHex(color: Rival3Gen2Rgb): string {
  const rgb = validateRgb(color);
  return `#${[rgb.r, rgb.g, rgb.b].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

export function steelseriesRival3Gen2RgbFromHex(color: string | null): Rival3Gen2Rgb {
  const match = /^#?([0-9a-f]{6})$/i.exec(color ?? "");
  if (!match) throw new Error("Choose a #rrggbb color first.");
  const value = Number.parseInt(match[1]!, 16);
  return { r: (value >> 16) & 0xff, g: (value >> 8) & 0xff, b: value & 0xff };
}
