import { describe, expect, it } from "vitest";
import { freshnessLine } from "./freshness-line";

const NOW = new Date("2026-09-22T12:00:00.000Z");
const minutesAgo = (minutes: number) => NOW.getTime() - minutes * 60_000;

describe("freshnessLine", () => {
  it("dates the oldest reading on the screen, not the newest", () => {
    expect(
      freshnessLine([minutesAgo(1), minutesAgo(4), minutesAgo(2)], NOW),
    ).toBe("Read 4 min ago");
  });

  it("reads just now when every reading is under a minute old", () => {
    expect(freshnessLine([minutesAgo(0), NOW.getTime()], NOW)).toBe(
      "Read just now",
    );
  });

  it("ignores a reading that has not answered yet", () => {
    expect(freshnessLine([undefined, minutesAgo(3), 0], NOW)).toBe(
      "Read 3 min ago",
    );
  });

  it("states nothing before any reading has answered", () => {
    expect(freshnessLine([undefined, 0], NOW)).toBeNull();
    expect(freshnessLine([], NOW)).toBeNull();
  });
});
