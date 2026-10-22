import type { LamzuAtlantisProduct } from "../lamzu/atlantis.js";

/**
 * Scyrox's CompX generation — vendor id 0x3554 and the report-8 flash
 * protocol this package already implements for the Lamzu Atlantis generation,
 * the Pulsar 4K receiver, VGN and Teevolution. Scyrox is one more brand on
 * CompX's ODM stack, so this module adds only the product catalog and the
 * device identity; the transport, flash layout and field sealing are
 * inherited from the shared family modules. Two things are not inherited:
 * the rate bytes follow CompX's own table, not Lamzu's (both products declare
 * the "pulsar" rate family), and the 3955 sensor keeps its DPI stage values
 * in a region of their own rather than the legacy fields (both declare
 * dpiLayout "sensor3955").
 *
 * Verified read-only on a Scyrox V8S, mouse firmware v5.07: the wired mouse
 * 0x3554:0xf515 and its "Scyrox Turbo 8k dongle" receiver 0x3554:0xf517 — see
 * docs/scyrox-v8s-testing.md. Every other flash field the Atlantis client
 * reads decoded cleanly on both transports; no write has been exercised yet.
 */
export const SCYROX_VENDOR_ID = 0x3554;

/** The V8S identity from the command 0x01 handshake, read on wired 0xf515. */
export const SCYROX_V8S_CID = 0x3e;
export const SCYROX_V8S_MID = 0x05;

/** Product ids this brand owns on CompX's shared vendor id. */
export const SCYROX_PRODUCT_IDS: readonly number[] = [0xf515, 0xf517];

/**
 * The "20K" switch: 20,000 FPS sensor scanning, which the vendor configurator
 * offers in advanced settings and disables until Competitive Mode (this
 * driver's performance mode) is on. A one-byte field at flash 8, named
 * Scyrox20K in the vendor's own flash map.
 */
export const SCYROX_V8S_20K_ADDRESS = 8;

/**
 * The 3955's five lift-off heights, as codes 1-5 of the shared lift-off byte
 * (flash 10). From the configurator's UI strings, which list them per sensor;
 * the V8S read code 2 (0.9 mm) on both transports.
 */
export const SCYROX_V8S_LIFT_OFF_MILLIMETRES = [0.7, 0.9, 1.2, 1.4, 1.6] as const;

/** A Scyrox product; the descriptor shape is the shared Atlantis one. */
export type ScyroxProduct = LamzuAtlantisProduct;

/**
 * Polling rates Scyrox's web configurator offers on the V8S. The 1,000 Hz byte
 * (0x01) was read on the wire on both transports, and the 4,000 Hz byte (0x20)
 * was read from a mouse the configurator had set to 4,000 Hz; the rest of the
 * byte table is the configurator's own encoder.
 */
const RATES_V8S = [125, 250, 500, 1000, 2000, 4000, 8000] as const;

/**
 * Both transports speak CompX's own rate bytes (`rateFamily: "pulsar"`): the
 * vendor configurator writes 0x10, 0x20 and 0x40 for 2,000, 4,000 and 8,000 Hz,
 * and the mouse held 0x20 while reporting 4,000 Hz. Neither Lamzu family fits —
 * "wired" would write 0x20 for 2,000 Hz, which this firmware reads as 4,000,
 * and the read-back would then confirm a rate the mouse is not on, while
 * "receiver" would write 0x10 for 1,000 Hz, which it reads as 2,000.
 */
export const SCYROX_PRODUCTS: ReadonlyMap<number, ScyroxProduct> = new Map([
  [0xf515, {
    brand: "Scyrox",
    model: "V8S",
    wireless: false,
    pollingRates: RATES_V8S,
    rateFamily: "pulsar",
    // The 3955 sensor keeps the stage values in six-byte records at flash
    // 6912; the legacy fields at 12 still hold the factory defaults, which is
    // why a driver reading them displayed 400 where the mouse was on 1,600.
    dpiLayout: "sensor3955",
    verified: true,
    minDpi: 50,
    maxDpi: 50000,
    dpiStep: 50,
    // Scyrox's configurator offers at most five DPI presets.
    maxDpiStages: 5,
    // The lift-off byte is a five-height scale here, not Lamzu's two stops,
    // so the stop setter stays off and the scale carries the control.
    supportsLiftOffDistance: false,
    liftOffMillimetres: SCYROX_V8S_LIFT_OFF_MILLIMETRES,
    // Flash 185 is SensorMode on this firmware, an LP/HP/Corded enum the
    // vendor tool mostly switches by itself, not the boolean the Atlantis
    // client's hyper mode expects. The configurator's "Highest performance"
    // toggle (shown as "Competitive Mode" once on) writes flash 181, which is
    // this client's performance mode and stays enabled.
    supportsHyperMode: false,
    // Mouse Angle Mode, -30 to 30 degrees at flash 189 and 191.
    supportsAngleTuning: true,
    // The configurator's Restore button: command 0x09.
    supportsFactoryReset: true,
    // The configurator's Scyrox sleep setter writes flash 173 and 183 alike.
    mirrorSleepToPerformanceTime: true,
  }],
  [0xf517, {
    brand: "Scyrox",
    model: "V8S",
    wireless: true,
    pollingRates: RATES_V8S,
    rateFamily: "pulsar",
    dpiLayout: "sensor3955",
    verified: true,
    minDpi: 50,
    maxDpi: 50000,
    dpiStep: 50,
    maxDpiStages: 5,
    supportsLiftOffDistance: false,
    liftOffMillimetres: SCYROX_V8S_LIFT_OFF_MILLIMETRES,
    supportsHyperMode: false,
    supportsAngleTuning: true,
    supportsFactoryReset: true,
    mirrorSleepToPerformanceTime: true,
  }],
]);

export function scyroxProduct(vendorId: number, productId: number): ScyroxProduct | undefined {
  if (vendorId !== SCYROX_VENDOR_ID) return undefined;
  return SCYROX_PRODUCTS.get(productId);
}
