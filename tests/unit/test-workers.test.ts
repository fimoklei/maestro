import { describe, expect, it } from "vitest";
import { testMaxWorkers } from "../../scripts/lib/test-workers.mjs";

const ON_BATTERY = `Now drawing from 'Battery Power'
 -InternalBattery-0 (id=24510563)	95%; discharging; 12:25 remaining present: true
`;

describe("testMaxWorkers", () => {
  it("caps a run at 4 workers on battery power", () => {
    expect(
      testMaxWorkers({
        env: {},
        platform: "darwin",
        readPowerSource: () => ON_BATTERY,
      }),
    ).toBe(4);
  });

  it("keeps vitest's default on mains power", () => {
    expect(
      testMaxWorkers({
        env: {},
        platform: "darwin",
        readPowerSource: () => "Now drawing from 'AC Power'\n",
      }),
    ).toBeUndefined();
  });

  it("keeps vitest's default in CI, even on battery power", () => {
    expect(
      testMaxWorkers({
        env: { CI: "true" },
        platform: "darwin",
        readPowerSource: () => ON_BATTERY,
      }),
    ).toBeUndefined();
  });

  it("keeps vitest's default when the power source cannot be read", () => {
    expect(
      testMaxWorkers({
        env: {},
        platform: "darwin",
        readPowerSource: () => {
          throw new Error("pmset failed");
        },
      }),
    ).toBeUndefined();
  });

  it("keeps vitest's default off macOS, where pmset does not exist", () => {
    expect(
      testMaxWorkers({
        env: {},
        platform: "linux",
        readPowerSource: () => ON_BATTERY,
      }),
    ).toBeUndefined();
  });
});
