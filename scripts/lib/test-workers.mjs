// How many workers a test run may use. Several agents run tests at once, so
// on battery power each run takes fewer cores (#1610).

import { execFileSync } from "node:child_process";

const BATTERY_CAP = 4;

/** The macOS power report; its first line names the power source. */
export const readPmset = () =>
  execFileSync("/usr/bin/pmset", ["-g", "batt"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    timeout: 2_000,
  });

/** Undefined keeps vitest's default: on mains power, in CI, or when unread. */
export function testMaxWorkers({ env, platform, readPowerSource }) {
  if (env.CI || platform !== "darwin") return undefined;
  try {
    return readPowerSource().includes("'Battery Power'")
      ? BATTERY_CAP
      : undefined;
  } catch {
    return undefined;
  }
}
