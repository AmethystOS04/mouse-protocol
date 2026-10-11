# LunaFury LUNA33 / TYPE33 evidence and testing

This integration is based on the public LunaFury WebHID configurator at
<https://mouse.lunafury.games/>. The site and its source map were inspected on
2026-10-05:

- `/js/app.14b76f96.js` and `/js/app.14b76f96.js.map` contain the device table
  and UI-side command calls.
- `/js/output.xvi3.min.js` contains the `XviUpdater` transport and the concrete
  feature-report packets.

## Hardware results

The owner confirmed full-function testing of the original LUNA33 support
with firmware `0.0.26.0`, over cable and the 8K receiver. This verifies the
runtime identities `0x0032` and `0x0033` on that firmware. They confirmed
the later feature rounds on the same model, firmware and connections:

| Feature | Owner-reported result |
| --- | --- |
| Independent button polling and all three onboard profiles | Normal over cable and 8K |
| DPI stage selection, value editing, separate X/Y and stage count | Normal over cable and 8K, including the revised DPI UI |
| Mouse, scroll, DPI and media remapping | Normal over cable and 8K |
| Keyboard single keys and combinations | Normal over cable and 8K |
| Sleep timeout and Never | Normal over cable and 8K |
| Mixed, Battery, DPI and Off receiver lighting | Normal over 8K; lighting control absent over cable |
| Bank switching and reconnect readback | Normal over cable and 8K |

The button-polling/onboard round and the revised DPI editor were confirmed
on 2026-10-08. These are the owner's reports, not independent hardware
measurements. TYPE33 has source and synthetic-test coverage only. The new
bottom-button power/DPI modes still need hardware testing, and no separate
Games or power-cycle results were supplied.

## Automated validation

The protocol build and all 151 Lamzu driver/codec tests pass. A broader
regression run on 2026-10-10 passed 2,252 tests with two registry exhaustive
checks excluded: `the probe matrix can trigger every driver` and
`no device can be claimed by more than one driver`. This is not a full
protocol CI result; both checks still need to run before merge.

The paired OpenMouse build and all 420 application tests pass with the local
protocol tarball, including 95 controller/Bridge integration tests. The app still
pins the official `0.27.0` package, which lacks these APIs. See the
[application development guide](https://github.com/sekiranunn/openmouse/blob/codex/lunafury-onboard-controls/docs/lunafury-development.md)
for the paired setup and protocol-first release order.

## Complete DPI restore regressions (2026-10-10)

The enabled DPI arrays omit dormant slots. Status now also exposes
`lunafury.dpiStorage`, containing the active bank, enabled count and all six
LUNA33 or five TYPE33 X/Y slots. `setLunaFuryDpiStorage` restores that storage
through the same bank-operation queue. It clones the backup before queuing,
rejects another bank, validates enabled values, and preserves raw 16-bit
values in dormant slots. TYPE33's remaining four table bytes stay unchanged.
Readback checks the count, every stored slot, trailing bytes and active stage.

The companion app keeps this backup in memory only; it is not an editable
Games field and is excluded from saved snapshots and imports. Games count
expansion followed by edits, restore and re-enabling the fourth slot is
covered on all four runtime PIDs. Tests check the complete underlying table,
not just the visible arrays. Additional tests cover reserved dormant values,
ignored writes, malformed backups, bank switches and queue recovery.

The application also resolves lower-priority legacy scalars before merging
a new game's table snapshot. Both switch directions and restoration of the
accumulated originals are covered through the real controller path. These
are synthetic regressions; no new hardware or Bridge-process result is claimed.

### Games switch composition

The app now merges the complete backup with the next game's target before
calling `setLunaFuryDpiStorage`. Enabled count and all stored X/Y slots are
written together, followed by explicit stage selection if needed. There is
no intermediate restore to the old count. This avoids deduplicating required
writes against the previous game or sorting slot edits before expansion.
An unchanged final table is not rewritten; dormant slots still come from
the original backup, and the driver preserves TYPE33's trailing bytes.

The controller suite includes three counterexamples on all four PIDs:
shared edited DPI with a different selection, four-to-four with a new fourth
slot, and maximum-count-to-four. Maximum count is six on LUNA33 and five on
TYPE33. All 12 failed before the app fix and pass with it. The tests also
restore the accumulated originals. Protocol source and packet definitions
are unchanged in this round; its build, 151 focused tests, package dry-run
and runtime audit were rerun. The 2,252-test broader result above comes from
the earlier run. No additional hardware result is claimed.

## Companion Games failure handling (2026-10-11)

The driver's rejected-write errors now reach the consuming app's Games API
as `failed`, rather than `written`. The app also reports a failed final
status read and restores unrelated user staging in a `finally` block. Bridge
does not record a successful signature or notify success for failed writes.
It retains the accumulated original settings through failed and partial
applications/restores, then retries on a later status poll.

The app adds 18 integration cases, including ignored complete-table writes
and restore retries on all four PIDs. Six run the actual Bridge hook callback
with synthetic refs and a synthetic status subscription, alongside the real
controller and driver. They check partial writes, retained backups, signature
invalidation, retries and success-notification gating. No DOM renderer,
native Bridge process or real device is used by these tests.

Protocol code and packets are unchanged. Build, all 151 focused tests,
package dry-run and runtime audit were rerun; the earlier 2,252-test result
and full-CI exclusions above remain historical, not a new full protocol pass.

### Unconfirmed application status cache

The companion app now marks its displayed status untrusted when the final
post-write read fails. Before Games planning, backup capture or no-op
confirmation, it requires a successful fresh read. A further refresh failure
returns `failed` without a speculative write; Bridge retains the originals
and retry state. A successful background read restores trust even when the
returned JSON is identical. Already-landed writes can then be confirmed
without rewriting them.

Seventeen new application integration cases include both stale-cache
counterexamples on all four runtime PIDs and sustained foreground/background
read failures in both directions. They also cover pending user edits,
manual no-op handling, generic scalar-DPI control and overlapping recovery.
Sixteen cases failed on the previous app commit before the fix; same-JSON
background recovery was an already-passing control. At the end of that
round, the paired build and all 384 app tests passed, including 62
controller/Bridge cases; bundle checks and application audit also passed.
The tests use synthetic devices and hook subscriptions, not a native Bridge
process or new hardware testing.

No protocol source or API change was needed. The protocol build, all 151
focused tests, package dry-run and runtime audit passed again. This does not
replace the outstanding full protocol CI or registry-only app validation.

### Companion manual Apply ordering (2026-10-12)

The app also recovers untrusted status before executing nonempty manual
Apply. Pending DPI count priority is evaluated from the confirmed enabled
count at execution time, including after background recovery or a Games
stash/restore. Expansion runs before dependent slot edits and reduction
after them. A failed preflight retains staging without writing settings or
automatically retrying that failed attempt. Count restaging removes only
edits and selections outside the final requested count and is blocked while
Apply holds the write guard.

Thirty-three application integration cases and three ordering unit tests
cover all four runtime PIDs, both count directions, sustained and overlapping
read failures, partial writes, retries, Games-carried manual staging,
consecutive count edits and generic/client-only stand-ins. The 32 fault/order
integration cases and three unit cases fail against app `1b75133` before the
fix. The owner's separate six-to-three-to-four reproduction now succeeds,
with a subsequent Apply returning `unchanged`.

The paired build and all 420 app tests pass, including 95 controller/Bridge
cases; bundle checks and audit pass. This round changes no protocol source,
API or packets. Protocol build, 151 focused tests, package dry-run and runtime
audit were rerun successfully. No new hardware or native-Bridge result is
claimed, and the earlier full-CI exclusions and release dependency remain.

## Live DPI and bank-operation regressions (2026-10-09)

LunaFury live status now reads the current bank's DPI table and active stage,
updating both axes instead of reusing the previous selected-stage cache.
Physical DPI switches and changes to stage count/values are covered on all
four runtime identities with synthetic HID fixtures. Refresh sends no writes
and does not repeatedly read the static LunaFury extension controls.

The older USB polling, LOD, flags, global debounce, sensor angle, Lightning
Trigger, per-button latency and wheel-guard setters now share the onboard
queue with bank switching and the newer setters. Their complete bank lookup,
write and readback remain together. Status reads also join the queue, so a
concurrent refresh cannot repopulate a switched bank's old cache. Shared
setters retain their previous execution path for other brands.

Regression tests exercise older setters with profile switches, plus mixed
old/new setters and live reads in both call orders. They record the active
bank at each write and check that a failed operation does not stall later
work. These tests use synthetic devices.

## Bottom-button power / DPI behavior (2026-10-09, hardware unverified)

The fixed actions for left double click, browser refresh and open browser
were withdrawn because they are absent from the official default menu.
The previous verified DPI interface is retained. Removing those actions
does not rewrite a hardware binding; existing assignments using them remain
unknown/read-only.

The official `settingDialog.vue` exposes two bottom-button modes:

1. Short press: power on/off.
2. Long press: power on/off; short press: DPI.

`XviUpdater.getDpiPowerMode(profile)` reads target 2, page 3, command 0x80,
length 6, selector `[profile, 0x14]`. Its setter writes:

- Mode 1: length 5, `[profile, 0x14, 0, 0x15, 1]`.
- Mode 2: length 6, `[profile, 0x14, 0, 7, 1, 6]`.

The power binding has a special five-byte layout. The decoder validates
bank, selector, function and data. The vendor UI treats unknown functions
as mode 2; this driver hides unsupported, truncated and unfamiliar bindings
and refuses to overwrite them.
Writes reread the existing binding, run through the onboard operation
queue, and confirm the exact selected mode. Ordinary buttons and other
banks are not written. Other brands cannot call this setter.

The card is on the Buttons page and uses staged Apply/undo. The setting
belongs to the current onboard bank but is deliberately excluded from
Games and profile imports so automatic game changes cannot alter power
button behavior. Changing the setting configures the binding; it does not
execute a power-off command. Both actual press behavior and persistence
after a power cycle are unverified; TYPE33 remains unverified.

Test on LUNA33 over cable and 8K with a backup pointing device available:
record each bank's original mode, compare with the official driver, apply
both modes, check physical short/long presses, reconnect/readback and bank
isolation, then restore the originals. Switching the mouse off may
disconnect it; turn it on again and reconnect before continuing.

## Official-style DPI editor (2026-10-08)

The custom DPI color extension was withdrawn. The LunaFury client has no
color setter and does not read or write the page-2 color table. Other brands'
color support is unchanged. A regression test checks that status reads and
stage-count edits send no color-table commands.

The app uses the official driver's fixed index palette, active-stage X/Y
sliders, stage-value inputs and an explicit stage-count selector. Clicking a
tile or focusing an input selects that stage. Numeric inputs clamp to
50 through 30000 and round down in 50-DPI steps. The existing staged Apply
workflow, serialized bank operations and readback-confirmed writes are
preserved. Stage-count changes retain dormant device values as before.

Hardware retest: verify tile selection, value inputs, current-stage sliders,
linked/separate axes, count shrink/expansion, undo/Apply and reconnect in
each onboard bank over cable and 8K. Fixed color tiles are display markers,
not device color readback. No firmware/reset actions are included.

## Receiver lighting and Never auto-sleep (2026-10-08)

Re-inspection of the same vendor bundles found `SetLightEffect(1, mode)` and
`GetLightEffect(1)`. These address the receiver, not the active onboard bank:
target 0 for LUNA33 PID `0x0033`, target 1 for TYPE33 PID `0x0084`.
Page 2, command `0x80` reads six bytes with zone argument 1; command 0 writes
`[1, 0, mode, 0, 0, 0]`. Mode is payload byte 2: 2 = Mixed, 6 = Battery,
11 = DPI, 0 = Off. Wired identities never receive these commands. Unknown,
unsupported and truncated reads do not expose a control. Writes require a
supported pre-read and exact readback; stale zone replies are filtered.
This receiver-global setting is deliberately excluded from Games profiles.

Vendor `getSleepTime(profile)` reads page 0 command `0x87`; `setSleepTime`
writes command 7, three bytes `[profile, secondsHigh, secondsLow]`. The UI
offers 1 through 30 minutes, converting zero minutes to `0xffff` for Never.
OpenMouse represents Never as zero seconds and preserves custom normal
timeouts; zero wire values and other reserved values are not guessed. Only
LunaFury uses this conversion. Sleep edits share the onboard-operation queue
with profile switches and filter replies by profile before verifying the
decoded timeout.

Hardware checklist: record the current receiver mode and each bank's timeout.
On the 8K receiver, apply Mixed/Battery/DPI/Off individually, inspect the LED,
and reconnect to verify readback. Cable connections must not show lighting.
For each connection, set a short sleep timeout, confirm actual idle sleep,
then choose Never and wait beyond that timeout without using the mouse.
Switch banks to check isolation, restore original values, and compare with
the vendor configurator (never run both configurators concurrently).

## Runtime identities

All devices use the shared CompX VID `0x373e`.

| Model | Connection | PID | Polling rates exposed by LunaFury |
| --- | --- | --- | --- |
| LUNA33 | cable | `0x0032` | 125, 250, 500, 1000 Hz |
| LUNA33 | 8K receiver | `0x0033` | 125, 250, 500, 1000, 2000, 4000, 8000 Hz |
| TYPE33 | cable | `0x0054` | 125, 250, 500, 1000, 2000, 4000, 8000 Hz |
| TYPE33 | 8K receiver | `0x0084` | 125, 250, 500, 1000, 2000, 4000, 8000 Hz |

The configurator also lists `0xb032`, `0xb033`, `0xb054`, and `0xb084` as
bootloader PIDs. They are intentionally excluded: firmware-update identities
must not be claimed by the normal settings driver.

Both models advertise a 30,000 DPI ceiling. LUNA33 exposes up to six DPI
stages and TYPE33 up to five. The stage-read request carries that model limit,
so each product profile supplies the correct maximum while the reply still
determines the active stage list at runtime.

## Protocol match

The configurator sends report ID 0 with a 64-byte payload. That is the same
CompX/XVI envelope implemented by `src/compx/codec.ts` and
`src/drivers/lamzu/hid.ts`.

| Setting | Read | Write / encoding |
| --- | --- | --- |
| Firmware | page `0x00`, command `0x81` | read only |
| Battery | page `0x00`, command `0x83` | read only |
| Active profile | page `0x00`, command `0x85` | writable; see onboard controls below |
| Polling rate | page `0x01`, command `0x80` | command `0x00`; `08/04/02/01/20/40/80` = 125 through 8000 Hz |
| Sleep | page `0x00`, command `0x87` | command `0x07` |
| Debounce | page `0x00`, command `0x88` | command `0x08` |
| Lift-off distance | page `0x01`, command `0x88` | command `0x08`; `87/01/02` = low/medium/high |
| DPI stages | page `0x01`, command `0x81` | command `0x01` |
| Angle snap | page `0x01`, command `0x84` | command `0x04` |
| Motion sync | page `0x01`, command `0x89` | command `0x09` |
| Ripple control | page `0x01`, command `0x8a` | command `0x0a` |
| Competitive Mode / 竞技模式 | page `0x01`, command `0x8b` | command `0x0b`; vendor `setHyperMode`, shared field `hyperMode` |
| Tracking Mode / 追踪模式 | page `0x01`, command `0x93` | command `0x13`; vendor `setTrackingMode`, shared field `performanceMode` |
| Sensor angle | page `0x01`, command `0x94`, length 2 | command `0x14`; signed byte, −30° through +30° |
| Lightning Trigger | page `0x00`, command `0x98`, length 4 | command `0x18`; 0 = off, 1 = left priority, 2 = right priority |
| Per-button latency | page `0x00`, command `0x92`, length 19 | command `0x12`; button IDs 1/2/3 = left/right/middle |
| Wheel anti-mistouch | page `0x00`, command `0x99`, length 4 | command `0x19`; enable byte and big-endian window in milliseconds |

The cable transport rewrites mouse target `0x02` to target `0x00`. The 2.4 GHz
receiver keeps mouse commands on target `0x02`, while receiver firmware remains
on target `0x00`. These are represented by the product profiles rather than a
forked LunaFury protocol implementation.

### LunaFury-specific controls

LunaFury labels follow its official `language.js` and `patternModule.vue`:
`angleSnapping` is 直线修正, `hyperMode` is 竞技模式, and `performanceMode`
is 追踪模式. Motion Sync and Ripple Control use 运动同步 and 波纹控制 in
Chinese. These are display overrides for LunaFury only; commands and labels
for other brands remain unchanged.

The owner clarified the hardware semantics on 2026-10-05: Competitive Mode
is Corded mode and Tracking Mode locks sensor sampling at 20 kHz. This
description is owner-provided, not an independently measured result.
The UI mirrors the vendor's `v-if="competition"`: tracking is shown only
while competitive mode is confirmed on. Hiding it preserves its stored
value. For staged changes, competitive mode enables before tracking edits
and disables after them; other brands retain their existing ordering.

`XviUpdater.hidIndex` is 1: received WebHID buffers do not include the report
ID. Decoders use the payload after the six-byte CompX header. Lightning mode
and sensor angle are payload byte 1; button ID is byte 2 and button latency
is bytes 3 and 4; wheel enable is byte 1 and its window is bytes 2 and 3.

Left/right latency uses 0 through 15 ms in 1 ms steps; middle-button debounce
uses 1 through 30 ms. The 19-byte latency write payload is
`[profile, 0, buttonId, hi, lo, 0, 0, hi, lo, 0, 0, 0, 20, 0, 0, 0, 20, 0, 0]`.
Wheel guard uses 20 through 200 ms in 20 ms steps. A disabled zero window is
a valid read, not a guessed default; enabling it from that state proposes 100 ms.
Writing a disabled zero window is supported so restoring a Games profile
does not invent a different prior value.

All added setters read back the value and reject a mismatch. Optional reads
that fail or return invalid values leave their controls absent, while basic
device settings remain available. Only the LunaFury product profiles issue
these extra commands; other CompX brands are unchanged.

LunaFury extension reads accept a reply only when its payload echoes the
requested profile; button-latency reads also match the button ID. A successful
reply for another profile or button is ignored while the same request waits
for a matching reply, within its existing attempt limit. This applies to both
initial reads and write readbacks. Generic CompX requests and write
acknowledgments retain their existing matching rules.

The UI places Lightning Trigger, independent left/right latency, middle
debounce, and wheel guard on the Buttons tab. Sensor angle is in Processing
on the Performance tab. As in the vendor UI, left/right priority disables
the corresponding latency slider. Turning priority off is applied before
staged latency edits, and enabling priority is applied after them. These
settings can also be saved in Games profiles as a partial LunaFury namespace.
Each profile restores only the controls it changed, preserving unrelated
settings and valid zero values.

## Hardware checklist

### Onboard controls and button remapping

The public configurator's runtime controls use profile IDs 1 through 3.
Button scan rate is page 0, read `0x9f` / write `0x1f`, with codes 1/32/64/128 for
1000/2000/4000/8000 Hz. LUNA33 cable offers only 1000 Hz. DPI stages use
page 1, read `0x81` / write `0x01`, with a 26-byte table; active stage is
read `0x82` / write `0x02`. Separate axes use `0x8d` / `0x0d`. Active
profile uses page 0, read `0x85` / write `0x05`.

Button remapping uses page 3, read `0x80` / write `0x00`. The payload is
`[profile, button, 0, function, dataLength, ...data]`. Reads request
function `0xff`, data length 10 and envelope length 15. Physical IDs 1 through 5
are left, right, middle, back and forward. Mouse actions use function 1;
keyboard shortcuts use function 4 with `[modifierMask, HIDusage]`; media
actions use function 5 with a big-endian consumer usage; DPI actions use
function 7. Disabled is function 0 with no data. Receiver buttons,
bottom controls, macros and vendor-specific advanced actions are excluded
from ordinary remapping. Bottom-button behavior has its separate control
described above.

The owner confirmed ordinary remapping on LUNA33 firmware `0.0.26.0` over
both cable and the 8K receiver, as recorded above. TYPE33 remapping remains
source-derived and synthetically tested only. Left is protected. Macros and
unknown assignments remain read-only; no macro storage or unrelated button
is rewritten. Each write addresses the active bank, reads the prior
assignment, and checks the complete function/data
readback. Reads match both profile and physical button. Profile switching
and remapping share the serialized onboard-operation queue. Games profiles
capture and restore only the supported buttons they touched.

For hardware testing, record the current bank and assignments. Change right,
middle or a side button to a reversible mouse action first, then test scroll,
DPI, a single key, a shortcut and a media action. Check the actual output,
refresh/reconnect readback and bank isolation, then restore the originals.
Check that a macro configured in the official driver stays unchanged.
Games apply/restore needs a separate pass; a successful readback alone does
not prove that the bound key or action fires correctly.

Connect each available cable/receiver identity in Chromium and confirm:

1. OpenMouse labels it `LunaFury LUNA33` or `LunaFury TYPE33`, never Attack
   Shark.
2. Firmware, battery, DPI stages, polling, LOD, sleep, debounce, motion sync,
   angle snap, and ripple control read successfully.
3. Change one reversible setting at a time, read it back, then restore the
   original value.
4. Confirm only the rates in the table are offered for that connection.
5. Confirm the driver refuses bootloader/DFU identities. The shared broad
   VID filter may still let Chromium show them in its native picker; do not
   select or send settings commands to an upgrade-mode interface.
6. With Lightning Trigger off, test independent left/right latencies and
   middle debounce, refresh/reconnect, and compare their values with the
   vendor configurator. Test each priority mode separately, restoring the
   initial mode afterward.
7. Test sensor angles −1°, 0°, and +1° first. Confirm direction and persistence
   on hardware, then restore the original angle.
8. Test wheel guard off and on at 20/100/200 ms. Confirm the actual firmware
   behavior, then restore both the original enable state and window.
9. Save a Games profile with a single LunaFury control, apply it, and restore
   the prior settings. Confirm unrelated controls remain unchanged, including
   the originally disabled zero wheel window if reported by this firmware.
10. Confirm Competitive Mode controls Tracking Mode's visibility, including
    staged on/off changes, without silently resetting its stored value.

Automated coverage includes all four runtime IDs, cable/receiver targeting,
profile 3, full packet fixtures, signed angles, invalid ranges, unsupported
reads, ignored writes, and the other-brand guard. LUNA33 hardware testing
is recorded above; TYPE33 still needs a real-device pass. The owner's
full-function report does not include item-by-item results for this checklist.
