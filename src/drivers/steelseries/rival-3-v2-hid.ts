import type { MouseLighting, MouseStatus } from "../mouse-types.js";
import {
  RIVAL3_GEN2_DEFAULT_DPI_PRESETS,
  RIVAL3_GEN2_DEFAULT_POLLING_RATE,
  RIVAL3_GEN2_MAX_DPI_PRESETS,
  RIVAL3_GEN2_POLLING_RATES,
  RIVAL3_GEN2_REPORT_ID,
  STEELSERIES_PRODUCTS,
  STEELSERIES_VENDOR_ID,
  steelseriesRival3Gen2DecodeFirmware,
  steelseriesRival3Gen2DpiOptions,
  steelseriesRival3Gen2EncodeButtonsMapping,
  steelseriesRival3Gen2EncodeDpiPresets,
  steelseriesRival3Gen2EncodePollingRate,
  steelseriesRival3Gen2FirmwareQuery,
  steelseriesRival3Gen2SaveCommand,
  type Rival3Gen2ButtonAction,
  type Rival3Gen2ButtonName,
  type Rival3Gen2DpiPreset,
} from "@openmouse/protocol/steelseries";
import {
  RIVAL3_GEN2_BRIGHTNESS_LEVELS,
  RIVAL3_GEN2_LIGHTING_ZONE_MODES,
  RIVAL3_GEN2_REACTIVE_MODES,
  RIVAL3_GEN2_ZONE_LABELS,
  RIVAL3_GEN2_ZONES,
  steelseriesRival3Gen2EncodeBrightness,
  steelseriesRival3Gen2EncodeDefaultLighting,
  steelseriesRival3Gen2EncodeRainbow,
  steelseriesRival3Gen2EncodeReactiveColor,
  steelseriesRival3Gen2EncodeZoneColor,
  steelseriesRival3Gen2RgbFromHex,
  steelseriesRival3Gen2RgbToHex,
  type Rival3Gen2DefaultLighting,
  type Rival3Gen2Rgb,
  type Rival3Gen2Zone,
} from "@openmouse/protocol/steelseries";

const COMMAND_DELAY_MS = 50;
const FIRMWARE_TIMEOUT_MS = 500;

const ZONE_DEFAULTS: Record<Rival3Gen2Zone, Rival3Gen2Rgb> = {
  1: { r: 255, g: 0, b: 0 },
  2: { r: 0, g: 255, b: 0 },
  3: { r: 0, g: 0, b: 255 },
};

const ZONE_MODES = RIVAL3_GEN2_LIGHTING_ZONE_MODES;
const REACTIVE_ZONE = "Click reaction";
const REACTIVE_MODES = RIVAL3_GEN2_REACTIVE_MODES;

export class SteelSeriesRival3Gen2HidClient {
  readonly device: HIDDevice;
  private queue: Promise<unknown> = Promise.resolve();
  private listenerAttached = false;
  private readonly inputWaiters = new Set<(payload: Uint8Array) => void>();
  private dpiStages: Rival3Gen2DpiPreset[] = RIVAL3_GEN2_DEFAULT_DPI_PRESETS.map((dpi) => ({ x: dpi, y: dpi }));
  private activeDpiStage = 0;
  private pollingRateHz: number = RIVAL3_GEN2_DEFAULT_POLLING_RATE;
  private brightness = 100;
  private readonly zones = new Map<Rival3Gen2Zone, { mode: "Static" | "Off" | "Cycling"; color: Rival3Gen2Rgb }>(
    RIVAL3_GEN2_ZONES.map((zone) => [zone, { mode: "Static", color: { ...ZONE_DEFAULTS[zone] } }]),
  );
  private reactiveColor: Rival3Gen2Rgb | null = null;
  private defaultLighting: Rival3Gen2DefaultLighting = "rainbow";

  private readonly onInputReport = (event: HIDInputReportEvent): void => {
    const payload = new Uint8Array(event.data.buffer.slice(event.data.byteOffset, event.data.byteOffset + event.data.byteLength));
    for (const finish of [...this.inputWaiters]) finish(payload);
  };

  constructor(device: HIDDevice) { this.device = device; }

  static isSupported(device: HIDDevice): boolean {
    if (device.vendorId !== STEELSERIES_VENDOR_ID) return false;
    return STEELSERIES_PRODUCTS.get(device.productId)?.family === "rival3-v2";
  }

  get pollIntervalMs(): number { return 30_000; }
  get supportedPollingRates(): number[] { return [...RIVAL3_GEN2_POLLING_RATES]; }
  getDpiOptions(): number[] { return steelseriesRival3Gen2DpiOptions(); }

  async open(): Promise<void> {
    if (!this.device.opened) await this.device.open();
    if (!this.listenerAttached) {
      this.device.addEventListener("inputreport", this.onInputReport);
      this.listenerAttached = true;
    }
  }

  async close(): Promise<void> {
    if (this.listenerAttached) {
      this.device.removeEventListener("inputreport", this.onInputReport);
      this.listenerAttached = false;
    }
    if (this.device.opened) await this.device.close();
  }

  async readStatus(): Promise<MouseStatus> {
    return await this.run(async () => {
      await this.open();
      const firmware = await this.probeFirmware();
      const product = STEELSERIES_PRODUCTS.get(this.device.productId);
      const active = this.dpiStages[this.activeDpiStage];
      const lightingZones = this.lightingZones();
      return {
        brand: "SteelSeries",
        name: this.device.productName?.trim() || `SteelSeries ${product?.model ?? "Rival 3 Gen 2"}`,
        ui: {
          family: "steelseries-rival3-v2",
          settingsReady: true,
          valuesVerified: false,
          hideUnsupportedPollingRates: true,
          hideProcessingCard: true,
          pollingNote: "The Rival 3 Gen 2 cannot report its current settings; values shown are the last written by this app, or assumed defaults.",
          defaultDisplayName: "SteelSeries Rival 3 Gen 2",
        },
        batteryPercent: null,
        batteryState: "Unknown",
        dpi: active?.x ?? RIVAL3_GEN2_DEFAULT_DPI_PRESETS[0]!,
        pollingRateHz: this.pollingRateHz,
        supportedPollingRates: this.supportedPollingRates,
        activeProfile: null,
        connectionType: "Wired",
        liftOffDistance: null,
        firmware: [firmware],
        lighting: lightingZones[0],
        lightingZones,
      };
    });
  }

  async setDpi(dpi: number): Promise<number> {
    await this.setDpiStageValue(this.activeDpiStage, { x: dpi, y: dpi });
    return dpi;
  }

  async setDpiStageValue(stage: number, preset: Rival3Gen2DpiPreset): Promise<Rival3Gen2DpiPreset> {
    this.requireStage(stage);
    const stages = this.dpiStages.map((value, index) => (index === stage ? preset : value));
    await this.writePresets(stages, this.activeDpiStage);
    return preset;
  }

  async setActiveDpiStage(stage: number): Promise<number> {
    this.requireStage(stage);
    await this.writePresets(this.dpiStages, stage);
    return stage;
  }

  async setDpiStages(stages: readonly Rival3Gen2DpiPreset[], activeStage = 0): Promise<void> {
    await this.writePresets(stages, activeStage);
  }

  async setPollingRate(pollingRateHz: number): Promise<number> {
    await this.commit(steelseriesRival3Gen2EncodePollingRate(pollingRateHz));
    this.pollingRateHz = pollingRateHz;
    return pollingRateHz;
  }

  async setButtonsMapping(mapping: Partial<Record<Rival3Gen2ButtonName, Rival3Gen2ButtonAction>>): Promise<void> {
    await this.commit(steelseriesRival3Gen2EncodeButtonsMapping(mapping));
  }

  async setLighting(lighting: MouseLighting): Promise<MouseLighting> {
    if (lighting.zone === REACTIVE_ZONE) {
      if (lighting.mode !== "Reactive" && lighting.mode !== "Off") throw new Error("Choose Reactive or Off.");
      await this.setReactiveColor(lighting.mode === "Off" ? null : steelseriesRival3Gen2RgbFromHex(lighting.color));
      return this.lightingZones().find(({ zone }) => zone === REACTIVE_ZONE)!;
    }

    const zone = RIVAL3_GEN2_ZONES.find((candidate) => RIVAL3_GEN2_ZONE_LABELS[candidate] === lighting.zone);
    if (zone === undefined) throw new Error(`The Rival 3 Gen 2 has no "${lighting.zone}" lighting zone.`);

    switch (lighting.mode) {
      case "Static":
        await this.setZoneColor(zone, steelseriesRival3Gen2RgbFromHex(lighting.color));
        break;
      case "Off": {
        const previous = this.zones.get(zone)!.color;
        await this.setZoneColor(zone, { r: 0, g: 0, b: 0 });
        this.zones.set(zone, { mode: "Off", color: { ...previous } });
        break;
      }
      case "Cycling":
        await this.setRainbow(zone);
        break;
      default:
        throw new Error(`The Rival 3 Gen 2 does not support ${lighting.mode ?? "that"} lighting.`);
    }
    return this.lightingZones().find(({ zone: label }) => label === lighting.zone)!;
  }

  async setLightingBrightness(brightness: number): Promise<number> {
    await this.commit(steelseriesRival3Gen2EncodeBrightness(brightness));
    this.brightness = brightness;
    return brightness;
  }

  async setZoneColor(zone: Rival3Gen2Zone, color: Rival3Gen2Rgb): Promise<void> {
    await this.commit(steelseriesRival3Gen2EncodeZoneColor(zone, color));
    this.zones.set(zone, { mode: "Static", color: { ...color } });
  }

  async setReactiveColor(color: Rival3Gen2Rgb | null): Promise<void> {
    await this.commit(steelseriesRival3Gen2EncodeReactiveColor(color));
    this.reactiveColor = color && { ...color };
  }

  async setRainbow(zone: Rival3Gen2Zone | "all" = "all"): Promise<void> {
    const mask = zone === "all" ? 0x07 : 1 << (zone - 1);
    await this.commit(steelseriesRival3Gen2EncodeRainbow(mask));
    if (zone === "all") {
      for (const candidate of RIVAL3_GEN2_ZONES) this.zones.set(candidate, { ...this.zones.get(candidate)!, mode: "Cycling" });
    } else {
      this.zones.set(zone, { ...this.zones.get(zone)!, mode: "Cycling" });
    }
  }

  async setDefaultLighting(mode: Rival3Gen2DefaultLighting): Promise<void> {
    await this.commit(steelseriesRival3Gen2EncodeDefaultLighting(mode));
    this.defaultLighting = mode;
  }

  private lightingZones(): MouseLighting[] {
    const base = {
      color2: null,
      dualColorModes: [],
      reactiveModes: [],
      speeds: [],
      speed: null,
      brightness: this.brightness,
      brightnessLevels: RIVAL3_GEN2_BRIGHTNESS_LEVELS,
      writeOnly: true,
    } as const;
    return [
      ...RIVAL3_GEN2_ZONES.map((zone): MouseLighting => {
        const state = this.zones.get(zone)!;
        return {
          ...base,
          zone: RIVAL3_GEN2_ZONE_LABELS[zone],
          group: "Strip",
          modes: ZONE_MODES,
          mode: state.mode,
          color: steelseriesRival3Gen2RgbToHex(state.color),
          colorModes: ["Static"],
        };
      }),
      {
        ...base,
        zone: REACTIVE_ZONE,
        modes: REACTIVE_MODES,
        mode: this.reactiveColor ? "Reactive" : "Off",
        color: this.reactiveColor ? steelseriesRival3Gen2RgbToHex(this.reactiveColor) : "#ffffff",
        colorModes: ["Reactive"],
      },
    ];
  }

  private requireStage(stage: number): void {
    if (!Number.isInteger(stage) || stage < 0 || stage >= RIVAL3_GEN2_MAX_DPI_PRESETS) {
      throw new Error(`The Rival 3 Gen 2 holds ${RIVAL3_GEN2_MAX_DPI_PRESETS} DPI stages.`);
    }
  }

  private async writePresets(stages: readonly Rival3Gen2DpiPreset[], activeStage: number): Promise<void> {
    this.requireStage(activeStage);
    const report = steelseriesRival3Gen2EncodeDpiPresets(stages, activeStage);
    await this.run(async () => {
      await this.open();
      await this.write(report);
      await this.delay(COMMAND_DELAY_MS);
      await this.write(steelseriesRival3Gen2SaveCommand());
      this.dpiStages = [...stages];
      this.activeDpiStage = activeStage;
    });
  }

  private async commit(report: Uint8Array): Promise<void> {
    await this.run(async () => {
      await this.open();
      await this.write(report);
      await this.delay(COMMAND_DELAY_MS);
      await this.write(steelseriesRival3Gen2SaveCommand());
    });
  }

  private async probeFirmware(): Promise<string> {
    const response = new Promise<Uint8Array | null>((resolve) => {
      let timer: ReturnType<typeof setTimeout>;
      const finish = (payload: Uint8Array | null): void => {
        clearTimeout(timer);
        this.inputWaiters.delete(finish as (payload: Uint8Array) => void);
        resolve(payload);
      };
      timer = setTimeout(() => finish(null), FIRMWARE_TIMEOUT_MS);
      this.inputWaiters.add(finish as (payload: Uint8Array) => void);
    });
    await this.write(steelseriesRival3Gen2FirmwareQuery());
    const payload = await response;
    if (!payload) throw new Error("The Rival 3 Gen 2 did not answer the firmware query on this interface. Add the device again and choose another entry.");
    return steelseriesRival3Gen2DecodeFirmware(payload);
  }

  private async write(payload: Uint8Array): Promise<void> {
    await this.device.sendReport(RIVAL3_GEN2_REPORT_ID, payload.buffer as ArrayBuffer);
  }

  private delay(milliseconds: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, milliseconds)); }

  private async run<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation, operation);
    this.queue = result.then(() => undefined, () => undefined);
    return await result;
  }
}
